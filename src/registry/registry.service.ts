import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Registry } from './registry.entity';

@Injectable()
export class RegistryService {
  constructor(
    @InjectRepository(Registry)
    private readonly registryRepository: Repository<Registry>,
  ) {}

  findAll(): Promise<Registry[]> {
    return this.registryRepository.find();
  }

  async findOne(id: number): Promise<Registry> {
    const registry = await this.registryRepository.findOne({ where: { id } });
    if (!registry) {
      throw new NotFoundException(`Registry with ID ${id} not found`);
    }
    return registry;
  }

  create(registryData: Partial<Registry>): Promise<Registry> {
    const registry = this.registryRepository.create(registryData);
    return this.registryRepository.save(registry);
  }

  async update(id: number, registryData: Partial<Registry>): Promise<Registry> {
    const registry = await this.findOne(id);
    const updated = this.registryRepository.merge(registry, registryData);
    return this.registryRepository.save(updated);
  }

  async remove(id: number): Promise<void> {
    await this.registryRepository.delete(id);
  }
}
