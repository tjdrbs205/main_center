import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from './setting.entity';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class SettingService {
  private readonly logger = new Logger(SettingService.name);
  private updateLogs: string[] = [];

  getUpdateLogs(): string[] {
    return this.updateLogs;
  }

  private addLog(msg: string) {
    const time = new Date().toLocaleTimeString();
    this.updateLogs.push(`[${time}] ${msg}`);
    this.logger.log(msg);
  }

  constructor(
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
  ) {}

  async getValue(key: string): Promise<string | null> {
    const setting = await this.settingRepository.findOne({ where: { key } });
    return setting ? setting.value : null;
  }

  async setValue(key: string, value: string): Promise<Setting> {
    let setting = await this.settingRepository.findOne({ where: { key } });
    if (setting) {
      setting.value = value;
    } else {
      setting = this.settingRepository.create({ key, value });
    }
    return this.settingRepository.save(setting);
  }

  async checkSystemUpdate() {
    this.logger.debug('Checking system update for main_center...');
    try {
      const url = `https://ghcr.io/v2/tjdrbs205/main_center/manifests/latest`;
      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          'Accept': 'application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json'
        }
      });

      if (response.ok) {
        const remoteDigest = response.headers.get('docker-content-digest');
        
        let localDigest = await this.getValue('MAIN_CENTER_LAST_DIGEST');
        try {
          const { stdout } = await execAsync(`docker inspect --format='{{index .RepoDigests 0}}' main_center_agent`);
          const parts = stdout.trim().split('@');
          if (parts.length === 2) {
            localDigest = parts[1]; // sha256:...
            await this.setValue('MAIN_CENTER_LAST_DIGEST', localDigest);
          }
        } catch (e) {
          this.logger.warn('Could not inspect local main_center_agent digest. Using DB value.', e.message);
        }

        if (remoteDigest && remoteDigest !== localDigest) {
          this.logger.log(`New Main Center system update detected: ${remoteDigest}`);
          await this.setValue('MAIN_CENTER_UPDATE_AVAILABLE', 'true');
          
          // Auto Update Check
          const autoUpdate = await this.getValue('MAIN_CENTER_AUTO_UPDATE');
          if (autoUpdate === 'true') {
            this.logger.log('Main Center auto-update is enabled. Triggering update...');
            // In the background
            this.handleSelfUpdate(remoteDigest).catch(e => this.logger.error('Auto system update failed', e));
          }
          return { available: true, digest: remoteDigest };
        } else {
          await this.setValue('MAIN_CENTER_UPDATE_AVAILABLE', 'false');
          return { available: false, digest: localDigest };
        }
      } else {
        this.logger.warn(`Failed to check system update. Status: ${response.status}`);
      }
    } catch (e) {
      this.logger.error('Error checking system update', e);
    }
    return { error: true };
  }

  async handleSelfUpdate(newDigest?: string) {
    this.updateLogs = []; // Reset logs
    this.addLog('Received self-update request. Starting self-update process...');

    try {
      const ghcrUser = await this.getValue('GHCR_USERNAME');
      const ghcrToken = await this.getValue('GHCR_TOKEN');
      if (ghcrUser && ghcrToken) {
        const user = ghcrUser.replace(/'/g, "'\\''");
        const token = ghcrToken.replace(/'/g, "'\\''");
        await execAsync(`echo '${token}' | docker login ghcr.io -u '${user}' --password-stdin`);
        this.addLog('Authenticated with ghcr.io successfully.');
      } else {
        this.addLog('GHCR credentials not configured in Settings. Using public access.');
      }
    } catch (e) {
      this.addLog('Registry login failed, attempting pull without auth...');
    }

    let dataPath: string;
    const image = 'ghcr.io/tjdrbs205/main_center:latest';
    try {
      const { stdout: dataOut } = await execAsync(
        `docker inspect --format='{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Source}}{{end}}{{end}}' main_center_agent`,
      );
      dataPath = dataOut.trim().replace(/^'|'$/g, '');
      this.addLog(`Using target image: ${image}, data path: ${dataPath}`);
    } catch (e) {
      this.addLog(`Failed to inspect running container: ${e.message}`);
      throw e;
    }

    this.addLog(`Pulling latest image: ${image}`);
    try {
      await new Promise<void>((resolve, reject) => {
        const pull = spawn('docker', ['pull', image]);
        pull.stdout.on('data', (data) => {
          const lines = data.toString().split('\n').filter(l => l.trim());
          lines.forEach(l => this.addLog(l));
        });
        pull.stderr.on('data', (data) => {
          const lines = data.toString().split('\n').filter(l => l.trim());
          lines.forEach(l => this.addLog(`ERR: ${l}`));
        });
        pull.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Docker pull exited with code ${code}`));
        });
      });
      this.addLog('Latest image pulled successfully.');
    } catch (e) {
      this.addLog(`Failed to pull latest image: ${e.message}`);
      throw e;
    }

    const cmd = `docker run --rm -d -v /var/run/docker.sock:/var/run/docker.sock docker sh -c 'sleep 3 && docker stop main_center_agent && docker rm main_center_agent && docker run -d --name main_center_agent --restart unless-stopped -p 3000:3000 -v /var/run/docker.sock:/var/run/docker.sock -v ${dataPath}:/app/data ${image} && docker image prune -a -f'`;

    try {
      if (newDigest) {
        await this.setValue('MAIN_CENTER_LAST_DIGEST', newDigest);
        await this.setValue('MAIN_CENTER_UPDATE_AVAILABLE', 'false');
      }
      this.addLog('Executing background restarter container...');
      await execAsync(cmd);
      this.addLog('Self-update background process initiated successfully. Main Center will now restart and this connection will drop.');
      return { status: 'Self-update initiated' };
    } catch (e) {
      this.addLog(`Self-update failed: ${e.message}`);
      throw e;
    }
  }
}
