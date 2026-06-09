import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActionTemplate } from './template.entity';

@Injectable()
export class TemplateService {
  constructor(
    @InjectRepository(ActionTemplate)
    private templateRepository: Repository<ActionTemplate>,
  ) {}

  findAll(): Promise<ActionTemplate[]> {
    return this.templateRepository.find();
  }

  create(data: Partial<ActionTemplate>): Promise<ActionTemplate> {
    const template = this.templateRepository.create(data);
    return this.templateRepository.save(template);
  }

  async update(id: number, data: Partial<ActionTemplate>): Promise<ActionTemplate | null> {
    await this.templateRepository.update(id, data);
    return this.templateRepository.findOne({ where: { id } });
  }

  async remove(id: number): Promise<void> {
    await this.templateRepository.delete(id);
  }
}
