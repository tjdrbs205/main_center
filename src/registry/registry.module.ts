import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegistryController } from './registry.controller';
import { RegistryService } from './registry.service';
import { Registry } from './registry.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Registry])],
  controllers: [RegistryController],
  providers: [RegistryService],
  exports: [RegistryService],
})
export class RegistryModule {}
