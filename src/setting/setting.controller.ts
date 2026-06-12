import { Controller, Get, Param, Put, Body } from '@nestjs/common';
import { SettingService } from './setting.service';

@Controller('api/settings')
export class SettingController {
  constructor(private readonly settingService: SettingService) {}

  @Get(':key')
  async getSetting(@Param('key') key: string) {
    const value = await this.settingService.getValue(key);
    const sensitiveKeys = ['AGENT_SECRET_TOKEN', 'GHCR_TOKEN'];
    if (sensitiveKeys.includes(key)) {
      return { key, isSet: !!value };
    }
    return { key, value: value || '' };
  }

  @Put(':key')
  async updateSetting(@Param('key') key: string, @Body() body: { value: string }) {
    return this.settingService.setValue(key, body.value);
  }
}
