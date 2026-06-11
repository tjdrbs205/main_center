import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { RegistryService } from './registry.service';
import { Registry } from './registry.entity';

@Controller('api/registry')
export class RegistryController {
  constructor(private readonly registryService: RegistryService) {}

  @Get()
  findAll() {
    return this.registryService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.registryService.findOne(+id);
  }

  @Post()
  create(@Body() registryData: Partial<Registry>) {
    return this.registryService.create(registryData);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() registryData: Partial<Registry>) {
    return this.registryService.update(+id, registryData);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.registryService.remove(+id);
  }
}
