import { Controller, Get, Post, Put, Delete, Body, Param } from '@nestjs/common';
import { TemplateService } from './template.service';
import { ActionTemplate } from './template.entity';

@Controller('api/template')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Get()
  findAll(): Promise<ActionTemplate[]> {
    return this.templateService.findAll();
  }

  @Post()
  create(@Body() data: Partial<ActionTemplate>): Promise<ActionTemplate> {
    return this.templateService.create(data);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() data: Partial<ActionTemplate>): Promise<ActionTemplate | null> {
    return this.templateService.update(+id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<void> {
    return this.templateService.remove(+id);
  }
}
