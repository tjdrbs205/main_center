import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Environment } from './environment.entity';

@Injectable()
export class EnvironmentService {
  constructor(
    @InjectRepository(Environment)
    private envRepository: Repository<Environment>,
  ) {}

  findAll(): Promise<Environment[]> {
    return this.envRepository.find();
  }

  create(data: Partial<Environment>): Promise<Environment> {
    const env = this.envRepository.create(data);
    return this.envRepository.save(env);
  }

  async update(id: number, data: Partial<Environment>): Promise<Environment | null> {
    await this.envRepository.update(id, data);
    return this.envRepository.findOne({ where: { id } });
  }

  async remove(id: number): Promise<void> {
    await this.envRepository.delete(id);
  }
}
