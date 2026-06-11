import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './project.entity';
import { randomBytes } from 'crypto';

@Injectable()
export class ProjectService {
  constructor(
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
  ) {}

  findAll(): Promise<Project[]> {
    return this.projectRepository.find({ relations: { server: true, environments: true, registry: true } });
  }

  async findOne(id: number): Promise<Project> {
    const project = await this.projectRepository.findOne({ where: { id }, relations: { server: true, environments: true, registry: true } });
    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }
    return project;
  }

  create(projectData: Partial<Project>): Promise<Project> {
    if (!projectData.webhookToken) {
      projectData.webhookToken = randomBytes(16).toString('hex');
    }
    const project = this.projectRepository.create(projectData);
    return this.projectRepository.save(project);
  }

  async update(id: number, projectData: Partial<Project>): Promise<Project> {
    const project = await this.findOne(id);
    const updated = this.projectRepository.merge(project, projectData);
    return this.projectRepository.save(updated);
  }

  async rotateToken(id: number): Promise<Project> {
    const project = await this.findOne(id);
    project.webhookToken = randomBytes(16).toString('hex');
    return this.projectRepository.save(project);
  }

  async remove(id: number): Promise<void> {
    await this.projectRepository.delete(id);
  }

  async findByWebhookToken(token: string): Promise<Project | null> {
    return this.projectRepository.findOne({ where: { webhookToken: token }, relations: { server: true, environments: true, registry: true } });
  }
}
