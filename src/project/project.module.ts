import { Module, forwardRef } from '@nestjs/common';
import { ProjectService } from './project.service';
import { ProjectController } from './project.controller';
import { ProjectPollerService } from './project-poller.service';

import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from './project.entity';
import { DeployModule } from '../deploy/deploy.module';
import { SettingModule } from '../setting/setting.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project]),
    forwardRef(() => DeployModule),
    SettingModule,
  ],
  providers: [ProjectService, ProjectPollerService],
  controllers: [ProjectController],
  exports: [ProjectService],
})
export class ProjectModule {}
