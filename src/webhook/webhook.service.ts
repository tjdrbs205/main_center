import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ProjectService } from '../project/project.service';
import { EnvironmentService } from '../environment/environment.service';
import { DeployService } from '../deploy/deploy.service';
import { RegistryService } from '../registry/registry.service';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly projectService: ProjectService,
    private readonly environmentService: EnvironmentService,
    private readonly deployService: DeployService,
    private readonly registryService: RegistryService,
  ) {}

  async handleDeployWebhook(token: string, envKeysString?: string) {
    this.logger.log(`Received webhook for token: ${token}`);
    const project = await this.projectService.findByWebhookToken(token);
    
    if (!project) {
      throw new NotFoundException('Project not found for the given webhook token');
    }

    if (!project.server) {
      throw new Error('Project has no assigned server');
    }

    let envVars = project.environments || [];
    
    // Parse incoming envKeys and add missing ones
    if (envKeysString) {
      const keys = envKeysString.split(',').map(k => k.trim()).filter(k => k);
      const existingKeys = envVars.map(e => e.key);
      const newKeys = keys.filter(k => !existingKeys.includes(k));
      
      if (newKeys.length > 0) {
        this.logger.log(`Adding ${newKeys.length} new environment variables from webhook.`);
        for (const newKey of newKeys) {
          const newEnv = await this.environmentService.create({ key: newKey, value: '' });
          envVars.push(newEnv);
        }
        await this.projectService.update(project.id, { environments: envVars });
      }
    }
    
    return this.deployService.deployProject(project, envVars);
  }

  async handleSelfUpdate() {
    this.logger.log('Received self-update webhook. Starting self-update process...');
    
    let loginCmd = '';
    try {
      const registries = await this.registryService.findAll();
      const ghcr = registries.find(r => r.url.includes('ghcr.io'));
      if (ghcr) {
        // Use single quotes inside the shell command to prevent premature variable expansion, but we need to safely pass credentials
        loginCmd = `docker login ghcr.io -u "${ghcr.username}" -p "${ghcr.token}"; `;
        this.logger.log('Found ghcr.io registry credentials. Will attempt to authenticate before pull.');
      }
    } catch (e) {
      this.logger.warn('Failed to fetch registries for self-update', e);
    }
    
    const cmd = `docker run --rm -d -v /var/run/docker.sock:/var/run/docker.sock docker sh -c "
      sleep 3;
      IMAGE=\\$(docker inspect --format='{{.Config.Image}}' main_center_agent);
      DATA_PATH=\\$(docker inspect --format='{{range .Mounts}}{{if eq .Destination \\"/app/data\\"}}{{.Source}}{{end}}{{end}}' main_center_agent);
      ${loginCmd}
      docker pull \\$IMAGE;
      docker stop main_center_agent;
      docker rm main_center_agent;
      docker run -d --name main_center_agent --restart unless-stopped -p 3000:3000 -v /var/run/docker.sock:/var/run/docker.sock -v \\$DATA_PATH:/app/data \\$IMAGE
    "`;
    
    try {
       await execAsync(cmd);
       this.logger.log('Self update background process initiated successfully.');
       return { status: 'Self-update initiated' };
    } catch (e) {
       this.logger.error('Self update failed', e);
       throw e;
    }
  }
}
