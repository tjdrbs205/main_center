import { Controller, Get, Post, Body, Param, Put, Delete } from '@nestjs/common';
import { ProjectService } from './project.service';
import { Project } from './project.entity';

@Controller('api/projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

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

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.projectService.remove(+id);
  }
}
