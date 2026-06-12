import { Injectable, Logger } from '@nestjs/common';
import { Client, ConnectConfig } from 'ssh2';
import { Server } from '../server/server.entity';
import { Project } from '../project/project.entity';
import { Environment } from '../environment/environment.entity';

@Injectable()
export class DeployService {
  private readonly logger = new Logger(DeployService.name);

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
        config.privateKey = server.privateKey;
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

    if (project.registry) {
      if (project.registry.expiresAt && new Date(project.registry.expiresAt) < new Date()) {
        this.logger.warn(`Registry '${project.registry.name}' token has expired (Expired at: ${project.registry.expiresAt}).`);
      }
      commands.push(`echo "${project.registry.token}" | docker login ${project.registry.url} -u ${project.registry.username} --password-stdin`);
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
      throw e;
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
