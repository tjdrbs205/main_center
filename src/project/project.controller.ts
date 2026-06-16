import { Controller, Get, Post, Body, Param, Put, Delete } from '@nestjs/common';
import { ProjectService } from './project.service';
import { Project } from './project.entity';
import { ProjectPollerService } from './project-poller.service';
import { DeployService } from '../deploy/deploy.service';

@Controller('api/projects')
export class ProjectController {
  constructor(
    private readonly projectService: ProjectService,
    private readonly projectPollerService: ProjectPollerService,
    private readonly deployService: DeployService,
  ) {}

  @Get()
  findAll() {
    return this.projectService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectService.findOne(+id);
  }

  @Post()
  create(@Body() projectData: Partial<Project>) {
    return this.projectService.create(projectData);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() projectData: Partial<Project>) {
    return this.projectService.update(+id, projectData);
  }

  @Post(':id/rotate-token')
  rotateToken(@Param('id') id: string) {
    return this.projectService.rotateToken(+id);
  }

  @Post('check-updates')
  checkUpdates() {
    return this.projectPollerService.checkForUpdates();
  }

  @Post(':id/deploy')
  async manualDeploy(@Param('id') id: string) {
    const project = await this.projectService.findOne(+id);
    const result = await this.deployService.deployProject(project, project.environments || []);
    
    // Clear the updateAvailable flag if it was set
    if (project.updateAvailable) {
        await this.projectService.update(+id, { updateAvailable: false });
    }
    return result;
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.projectService.remove(+id);
  }
}
