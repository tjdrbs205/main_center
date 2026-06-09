import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { EnvironmentService } from './environment.service';
import { Environment } from './environment.entity';

@Controller('api/environment')
export class EnvironmentController {
  constructor(private readonly environmentService: EnvironmentService) {}

  @Get()
  findAll(): Promise<Environment[]> {
    return this.environmentService.findAll();
  }

  @Post()
  create(@Body() data: Partial<Environment>): Promise<Environment> {
    return this.environmentService.create(data);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: Partial<Environment>): Promise<Environment | null> {
    return this.environmentService.update(+id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.environmentService.remove(+id);
  }
}
