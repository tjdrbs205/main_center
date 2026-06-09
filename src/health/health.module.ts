import { Module } from '@nestjs/common';
import { HealthService } from './health.service';
import { HealthController } from './health.controller';

import { ProjectModule } from '../project/project.module';
import { DeployModule } from '../deploy/deploy.module';

@Module({
  imports: [ProjectModule, DeployModule],
  providers: [HealthService],
  controllers: [HealthController]
})
export class HealthModule {}
