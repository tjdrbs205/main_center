import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { Client, ConnectConfig } from 'ssh2';
import { Server } from '../server/server.entity';
import { Project } from '../project/project.entity';
import { Environment } from '../environment/environment.entity';
import { SettingService } from '../setting/setting.service';

@Injectable()
export class DeployService {
  private readonly logger = new Logger(DeployService.name);

  constructor(private readonly settingService: SettingService) {}

  private async executeSshCommand(server: Server, command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      const config: ConnectConfig = {
        host: server.ipOrHostname,
        port: server.port,
        username: server.username,
        readyTimeout: 10000,
      };

      if (server.privateKey) {
        // Normalize: trim whitespace, ensure consistent LF line endings, ensure trailing newline
        let key = server.privateKey.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (!key.endsWith('\n')) key += '\n';

        if (!key.includes('-----BEGIN') || !key.includes('-----END')) {
          return reject(new Error(
            'Invalid SSH private key format. The key must be in PEM format (e.g., -----BEGIN OPENSSH PRIVATE KEY-----).'
          ));
        }
        config.privateKey = key;
      } else if (server.password) {
        config.password = server.password;
      }

      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }
          let output = '';
          stream.on('close', (code, signal) => {
            conn.end();
            if (code !== 0) {
              return reject(new Error(`Command exited with code ${code}. Output: ${output}`));
            }
            resolve(output);
          }).on('data', (data) => {
            output += data;
          }).stderr.on('data', (data) => {
            output += data;
          });
        });
      }).on('error', (err) => {
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
      await this.executeSshCommand(server, 'echo "pong"');
      return true;
    } catch (e) {
      return false;
    }
  }

  async getContainerStatus(server: Server, containerName: string): Promise<string> {
    try {
      const output = await this.executeSshCommand(server, `docker inspect -f '{{.State.Status}}' ${containerName}`);
      return output.trim();
    } catch (e) {
      return 'down';
    }
  }
}
