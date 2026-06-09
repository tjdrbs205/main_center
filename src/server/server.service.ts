import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Server } from './server.entity';

@Injectable()
export class ServerService {
  constructor(
    @InjectRepository(Server)
    private serverRepository: Repository<Server>,
  ) {}

  findAll(): Promise<Server[]> {
    return this.serverRepository.find();
  }

  async findOne(id: number): Promise<Server> {
    const server = await this.serverRepository.findOneBy({ id });
    if (!server) {
      throw new NotFoundException(`Server with ID ${id} not found`);
    }
    return server;
  }

  create(serverData: Partial<Server>): Promise<Server> {
    const server = this.serverRepository.create(serverData);
    return this.serverRepository.save(server);
  }

  async update(id: number, serverData: Partial<Server>): Promise<Server> {
    await this.serverRepository.update(id, serverData);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    await this.serverRepository.delete(id);
  }
}
