import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ProjectService } from './project.service';
import { DeployService } from '../deploy/deploy.service';
import { SettingService } from '../setting/setting.service';

@Injectable()
export class ProjectPollerService {
  private readonly logger = new Logger(ProjectPollerService.name);

  constructor(
    private readonly projectService: ProjectService,
    private readonly deployService: DeployService,
    private readonly settingService: SettingService,
  ) {}

  @Cron('*/10 * * * *')
  async handleCron() {
    this.logger.debug('Running scheduled GHCR image polling...');
    await this.checkForUpdates();
    await this.settingService.checkSystemUpdate();
  }

  async checkForUpdates() {
    const projects = await this.projectService.findAll();
    const token = await this.settingService.getValue('GHCR_TOKEN');
    
    if (!token) {
        this.logger.warn('Skipping GHCR polling because GHCR_TOKEN is not set.');
        return { status: 'skipped', reason: 'Missing GHCR_TOKEN' };
    }

    const username = await this.settingService.getValue('GHCR_USERNAME') || 'token';
    const basicAuth = Buffer.from(`${username}:${token}`).toString('base64');
    let updatedCount = 0;

    for (const project of projects) {
        if (!project.githubRepo || !project.dockerImage) continue;

        try {
            const imageStr = project.dockerImage.replace('ghcr.io/', '');
            const parts = imageStr.split(':');
            const repoPath = parts[0];
            const tag = parts[1] || 'latest';

            const url = `https://ghcr.io/v2/${repoPath}/manifests/${tag}`;
            const response = await fetch(url, {
                method: 'HEAD',
                headers: {
                    'Authorization': `Basic ${basicAuth}`,
                    'Accept': 'application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json'
                }
            });

            if (response.ok) {
                const digest = response.headers.get('docker-content-digest');
                if (digest && digest !== project.lastImageDigest) {
                    this.logger.log(`New image detected for ${project.name}: ${digest}`);
                    
                    if (project.autoUpdate) {
                        this.logger.log(`AutoUpdate is enabled. Triggering deployment for ${project.name}`);
                        await this.deployService.deployProject(project, project.environments || []);
                        await this.projectService.update(project.id, { 
                            lastImageDigest: digest, 
                            updateAvailable: false 
                        });
                        updatedCount++;
                    } else {
                        // Mark update available
                        if (!project.updateAvailable) {
                            await this.projectService.update(project.id, { 
                                updateAvailable: true
                                // Do not update lastImageDigest until it's actually deployed
                            });
                            updatedCount++;
                        }
                    }
                }
            } else {
                this.logger.warn(`Failed to check image for ${project.name}: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            this.logger.error(`Error polling for project ${project.name}`, error);
        }
    }
    
    return { status: 'success', updatedProjects: updatedCount };
  }
}
