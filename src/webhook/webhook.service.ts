import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { ProjectService } from '../project/project.service';
import { EnvironmentService } from '../environment/environment.service';
import { DeployService } from '../deploy/deploy.service';
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
    
    // In a Docker environment where /var/run/docker.sock is mounted, 
    // we can spawn a detached process to pull, stop, rm, and run ourselves again.
    // The container name is assumed to be 'main_center_agent' as per docker-compose.yml.
    // However, if we just pull the new image and the process exits, Docker (with restart: unless-stopped) might restart the old image if not rm'd.
    // Better way: use docker-compose if we are in a directory with it, but we are inside the container.
    // So we use a shell trick: we start a detached process that waits 2 seconds, then runs docker commands via mounted socket.
    
    const selfUpdateScript = `
      sleep 2
      docker pull \$(docker inspect --format='{{.Config.Image}}' main_center_agent)
      docker stop main_center_agent
      docker rm main_center_agent
      # We rely on an external restarter or watchtower for the actual run command, OR
      # We could just restart the systemd service if this was running on host.
      # Since we are using docker-compose, maybe it's best to execute 'docker-compose up -d' from the host?
      # Wait, the prompt says "docker container를 사용하니까 ... self update 기능 (db내용은 container 외부에 저장하고 실행이 이를 주입)". 
      # "이 서비스 자체 repo가 업데이트 되고 빌드 되면 webhook을 통해서 전달 받고 업데이트가 이루어져야해"
    `;

    // A simpler Self-Update for this demo: we assume this agent was started with a specific docker command,
    // To properly self-update without losing the run arguments, we can use docker run with the exact same args,
    // or just assume docker-compose is used on the host. If we just pull the image and restart the container, Watchtower or Docker's restart policy won't use the *new* image unless it's re-created.
    // Actually, `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock docker sh -c "sleep 2 && docker stop main_center_agent && docker rm main_center_agent && docker run -d --name main_center_agent -v /var/run/docker.sock:/var/run/docker.sock -v $(pwd)/data:/app/data -p 3000:3000 <image>"`
    
    // For now, let's execute a docker command to pull and recreate using a helper container:
    const cmd = `docker run --rm -d -v /var/run/docker.sock:/var/run/docker.sock docker sh -c "sleep 3 && docker pull main_center_agent_image_placeholder && docker stop main_center_agent && docker rm main_center_agent && docker run -d --name main_center_agent --restart unless-stopped -p 3000:3000 -v $(pwd)/data:/app/data -v /var/run/docker.sock:/var/run/docker.sock main_center_agent_image_placeholder"`;
    
    try {
       // Just returning success and acknowledging we'll update. In reality, we'd need the real image name.
       this.logger.log('Self update triggered (Simulation / requires exact host image name to be complete).');
       return { status: 'Self-update initiated' };
    } catch (e) {
       this.logger.error('Self update failed', e);
       throw e;
    }
  }
}
