import { Controller, Get, Post, Body, Param, Put, Delete } from '@nestjs/common';
import { ServerService } from './server.service';
import { Server } from './server.entity';

@Controller('api/servers')
export class ServerController {
  constructor(private readonly serverService: ServerService) {}

  @Get()
  findAll() {
    return this.serverService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.serverService.findOne(+id);
  }

  @Post()
  create(@Body() serverData: Partial<Server>) {
    return this.serverService.create(serverData);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() serverData: Partial<Server>) {
    return this.serverService.update(+id, serverData);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.serverService.remove(+id);
  }
}
