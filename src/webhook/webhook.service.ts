import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ProjectService } from '../project/project.service';
import { EnvironmentService } from '../environment/environment.service';
import { DeployService } from '../deploy/deploy.service';
import { SettingService } from '../setting/setting.service';
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
    private readonly settingService: SettingService,
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

    // Phase 1: Authenticate with ghcr.io using credentials from Settings
    try {
      const ghcrUser = await this.settingService.getValue('GHCR_USERNAME');
      const ghcrToken = await this.settingService.getValue('GHCR_TOKEN');
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

    // Phase 2: Inspect the current container to get image name and data volume path
    let image: string;
    let dataPath: string;
    try {
      const { stdout: imageOut } = await execAsync(
        "docker inspect --format='{{.Config.Image}}' main_center_agent",
      );
      image = imageOut.trim().replace(/^'|'$/g, '');

      const { stdout: dataOut } = await execAsync(
        `docker inspect --format='{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Source}}{{end}}{{end}}' main_center_agent`,
      );
      dataPath = dataOut.trim().replace(/^'|'$/g, '');
      this.logger.log(`Current image: ${image}, data path: ${dataPath}`);
    } catch (e) {
      this.logger.error('Failed to inspect running container', e);
      throw e;
    }

    // Phase 3: Pull the latest image (uses credentials from Phase 1)
    this.logger.log(`Pulling latest image: ${image}`);
    try {
      await execAsync(`docker pull ${image}`);
      this.logger.log('Latest image pulled successfully.');
    } catch (e) {
      this.logger.error('Failed to pull latest image', e);
      throw e;
    }

    // Phase 4: Spawn a helper container to restart us with the new image
    // The image is already pulled, so the helper only needs to stop/rm/run + cleanup
    const cmd = `docker run --rm -d -v /var/run/docker.sock:/var/run/docker.sock docker sh -c 'sleep 3 && docker stop main_center_agent && docker rm main_center_agent && docker run -d --name main_center_agent --restart unless-stopped -p 3000:3000 -v /var/run/docker.sock:/var/run/docker.sock -v ${dataPath}:/app/data ${image} && docker image prune -a -f'`;

    try {
      await execAsync(cmd);
      this.logger.log('Self-update background process initiated successfully.');
      return { status: 'Self-update initiated' };
    } catch (e) {
      this.logger.error('Self-update failed', e);
      throw e;
    }
  }
}
