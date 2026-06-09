import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ProjectService } from '../project/project.service';
import { DeployService } from '../deploy/deploy.service';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private healthCache: Record<number, string> = {};

  constructor(
    private readonly projectService: ProjectService,
    private readonly deployService: DeployService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async checkHealth() {
    this.logger.debug('Starting health check for all projects');
    const projects = await this.projectService.findAll();
    
    for (const project of projects) {
      if (!project.server) continue;
      
      try {
        const status = await this.deployService.getContainerStatus(project.server, project.containerName);
        this.healthCache[project.id] = status;
      } catch (e) {
        this.healthCache[project.id] = 'error';
      }
    }
  }

  getHealthStatus() {
    return this.healthCache;
  }
}
