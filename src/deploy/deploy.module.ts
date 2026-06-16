import { Module } from '@nestjs/common';
import { DeployService } from './deploy.service';
import { DeployController } from './deploy.controller';
import { SettingModule } from '../setting/setting.module';

@Module({
  imports: [SettingModule],
  providers: [DeployService],
  controllers: [DeployController],
  exports: [DeployService],
})
export class DeployModule {}
