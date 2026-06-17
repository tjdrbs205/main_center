import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { Client, ConnectConfig } from 'ssh2';
import { Server } from '../server/server.entity';
import { Project } from '../project/project.entity';
import { Environment } from '../environment/environment.entity';
import { SettingService } from '../setting/setting.service';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

@Injectable()
export class DeployService {
  private readonly logger = new Logger(DeployService.name);

  constructor(private readonly settingService: SettingService) {}

  private async executeSshCommand(server: Server, command: string, silent: boolean = false): Promise<string> {
    if (!silent) this.logger.log(`[SSH] Connecting to ${server.username}@${server.ipOrHostname}:${server.port || 22}`);

    return new Promise((resolve, reject) => {
      const conn = new Client();
      const config: ConnectConfig = {
        host: server.ipOrHostname,
        port: server.port,
        username: server.username,
        readyTimeout: 10000,
      };

      // --- Authentication method selection ---
      if (server.privateKey) {
        if (!silent) this.logger.log(`[SSH] Auth method: explicit privateKey from DB (length=${server.privateKey.length})`);
        let key = server.privateKey.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (!key.endsWith('\n')) key += '\n';

        const firstLine = key.split('\n')[0];
        if (!silent) this.logger.log(`[SSH] Key header: "${firstLine}"`);

        if (!key.includes('-----BEGIN') || !key.includes('-----END')) {
          const errMsg = 'Invalid SSH private key format. The key must be in PEM format (e.g., -----BEGIN OPENSSH PRIVATE KEY-----).';
          if (!silent) this.logger.error(`[SSH] ${errMsg}`);
          return reject(new Error(errMsg));
        }
        config.privateKey = key;
      } else if (server.password) {
        if (!silent) this.logger.log(`[SSH] Auth method: password`);
        config.password = server.password;
      } else {
        if (!silent) this.logger.log(`[SSH] Auth method: no explicit credentials, trying system default SSH keys...`);
        const defaultKeyNames = ['id_ed25519', 'id_rsa', 'id_ecdsa'];
        const sshDir = path.join(os.homedir(), '.ssh');
        if (!silent) this.logger.log(`[SSH] Scanning SSH dir: ${sshDir}`);
        let foundKey = false;
        for (const keyName of defaultKeyNames) {
          const keyPath = path.join(sshDir, keyName);
          try {
            if (fs.existsSync(keyPath)) {
              const keyContent = fs.readFileSync(keyPath, 'utf-8');
              const firstLine = keyContent.split('\n')[0];
              if (!silent) this.logger.log(`[SSH] Found key: ${keyPath} (header: "${firstLine}", length=${keyContent.length})`);
              config.privateKey = keyContent;
              foundKey = true;
              break;
            } else {
              if (!silent) this.logger.debug(`[SSH] Key not found: ${keyPath}`);
            }
          } catch (e) {
            if (!silent) this.logger.warn(`[SSH] Cannot read ${keyPath}: ${e.message}`);
          }
        }
        if (!foundKey && process.env.SSH_AUTH_SOCK) {
          config.agent = process.env.SSH_AUTH_SOCK;
          if (!silent) this.logger.log(`[SSH] Using SSH agent: ${process.env.SSH_AUTH_SOCK}`);
        }
        if (!foundKey && !process.env.SSH_AUTH_SOCK) {
          if (!silent) this.logger.warn(`[SSH] No authentication method available. Connection will likely fail.`);
        }
      }

      if (!silent) this.logger.log(`[SSH] Attempting connection...`);

      conn.on('ready', () => {
        if (!silent) this.logger.log(`[SSH] Connection established. Executing command...`);
        conn.exec(command, (err, stream) => {
          if (err) {
            if (!silent) this.logger.error(`[SSH] exec error: ${err.message}`);
            conn.end();
            return reject(err);
          }
          let output = '';
          stream.on('close', (code, signal) => {
            conn.end();
            if (code !== 0) {
              if (!silent) this.logger.error(`[SSH] Command exited with code ${code}. Output:\n${output}`);
              return reject(new Error(`Command exited with code ${code}. Output: ${output}`));
            }
            if (!silent) this.logger.log(`[SSH] Command completed successfully.`);
            resolve(output);
          }).on('data', (data) => {
            output += data;
          }).stderr.on('data', (data) => {
            output += data;
          });
        });
      }).on('error', (err) => {
        if (!silent) this.logger.error(`[SSH] Connection error: ${err.message}`);
        if (!silent) this.logger.error(`[SSH] Error stack: ${err.stack}`);
        reject(err);
      }).connect(config);
    });
  }

  async deployProject(project: Project, envVars: Environment[]) {
    this.logger.log(`Deploying project ${project.name} to ${project.server.ipOrHostname}...`);
    const projectDir = `~/.main_center_projects/${project.containerName}`;
    
    // Build .env content
    const envContent = envVars.map(e => `${e.key}="${e.value.replace(/"/g, '\\"')}"`).join('\n');
    
    // Ensure project has composeYaml, otherwise fallback to simple run
    if (!project.composeYaml) {
      throw new Error(`Project ${project.name} does not have a docker-compose.yml defined.`);
    }

    const commands: string[] = [
      `mkdir -p ${projectDir}`,
      `cd ${projectDir}`,
      `cat << 'EOF' > .env\n${envContent}\nEOF`,
      `cat << 'EOF' > docker-compose.yml\n${project.composeYaml}\nEOF`
    ];

    try {
      const ghcrUser = await this.settingService.getValue('GHCR_USERNAME');
      const ghcrToken = await this.settingService.getValue('GHCR_TOKEN');
      if (ghcrUser && ghcrToken) {
        commands.push(`echo "${ghcrToken}" | docker login ghcr.io -u ${ghcrUser} --password-stdin`);
      }
    } catch (e) {
      this.logger.warn('Failed to fetch GHCR credentials from settings.', e);
    }
    commands.push(
      `docker compose pull`,
      `docker compose up -d`
    );

    const fullCommand = commands.join(' && ');

    this.logger.log(`Executing command: ${fullCommand}`);
    try {
      const output = await this.executeSshCommand(project.server, fullCommand);
      this.logger.log(`Deployment successful for ${project.name}:\n${output}`);
      return output;
    } catch (e) {
      this.logger.error(`Deployment failed for ${project.name}: ${e.message}`);
      throw new HttpException({
        message: `Deployment failed for ${project.name}`,
        details: e.message
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async pingServer(server: Server): Promise<boolean> {
    try {
      await this.executeSshCommand(server, 'echo "pong"', true);
      return true;
    } catch (e) {
      return false;
    }
  }

  async getContainerStatus(server: Server, containerName: string): Promise<string> {
    try {
      const output = await this.executeSshCommand(server, `docker inspect -f '{{.State.Status}}' ${containerName}`, true);
      return output.trim();
    } catch (e) {
      return 'down';
    }
  }
}
