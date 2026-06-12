import { Module } from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { WebhookController } from './webhook.controller';

import { ProjectModule } from '../project/project.module';
import { EnvironmentModule } from '../environment/environment.module';
import { DeployModule } from '../deploy/deploy.module';
import { SettingModule } from '../setting/setting.module';
import { RegistryModule } from '../registry/registry.module';

@Module({
  imports: [ProjectModule, EnvironmentModule, DeployModule, SettingModule, RegistryModule],
  providers: [WebhookService],
  controllers: [WebhookController]
})
export class WebhookModule {}
