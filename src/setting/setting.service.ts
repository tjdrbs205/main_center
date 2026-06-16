import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from './setting.entity';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class SettingService {
  private readonly logger = new Logger(SettingService.name);

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
      const token = await this.getValue('GHCR_TOKEN');
      if (!token) return { status: 'skipped', reason: 'Missing GHCR_TOKEN' };

      const username = await this.getValue('GHCR_USERNAME') || 'token';
      const basicAuth = Buffer.from(`${username}:${token}`).toString('base64');

      const url = `https://ghcr.io/v2/tjdrbs205/main_center/manifests/latest`;
      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
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
    this.logger.log('Received self-update request. Starting self-update process...');

    try {
      const ghcrUser = await this.getValue('GHCR_USERNAME');
      const ghcrToken = await this.getValue('GHCR_TOKEN');
      if (ghcrUser && ghcrToken) {
        const user = ghcrUser.replace(/'/g, "'\\''");
        const token = ghcrToken.replace(/'/g, "'\\''");
        await execAsync(`echo '${token}' | docker login ghcr.io -u '${user}' --password-stdin`);
        this.logger.log('Authenticated with ghcr.io successfully.');
      } else {
        this.logger.warn('GHCR credentials not configured in Settings. Pull may fail for private images.');
      }
    } catch (e) {
      this.logger.warn('Registry login failed, attempting pull without auth...', e);
    }

    let dataPath: string;
    const image = 'ghcr.io/tjdrbs205/main_center:latest';
    try {
      const { stdout: dataOut } = await execAsync(
        `docker inspect --format='{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Source}}{{end}}{{end}}' main_center_agent`,
      );
      dataPath = dataOut.trim().replace(/^'|'$/g, '');
      this.logger.log(`Using target image: ${image}, data path: ${dataPath}`);
    } catch (e) {
      this.logger.error('Failed to inspect running container', e);
      throw e;
    }

    this.logger.log(`Pulling latest image: ${image}`);
    try {
      await execAsync(`docker pull ${image}`);
      this.logger.log('Latest image pulled successfully.');
    } catch (e) {
      this.logger.error('Failed to pull latest image', e);
      throw e;
    }

    const cmd = `docker run --rm -d -v /var/run/docker.sock:/var/run/docker.sock docker sh -c 'sleep 3 && docker stop main_center_agent && docker rm main_center_agent && docker run -d --name main_center_agent --restart unless-stopped -p 3000:3000 -v /var/run/docker.sock:/var/run/docker.sock -v ${dataPath}:/app/data ${image} && docker image prune -a -f'`;

    try {
      if (newDigest) {
        await this.setValue('MAIN_CENTER_LAST_DIGEST', newDigest);
        await this.setValue('MAIN_CENTER_UPDATE_AVAILABLE', 'false');
      }
      await execAsync(cmd);
      this.logger.log('Self-update background process initiated successfully.');
      return { status: 'Self-update initiated' };
    } catch (e) {
      this.logger.error('Self-update failed', e);
      throw e;
    }
  }
}
