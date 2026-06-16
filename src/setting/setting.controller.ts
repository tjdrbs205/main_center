import { Controller, Get, Param, Post, Put, Body } from '@nestjs/common';
import { SettingService } from './setting.service';

@Controller('api/settings')
export class SettingController {
  constructor(private readonly settingService: SettingService) {}

  @Get('status/setup')
  async getSetupStatus() {
    const clientId = await this.settingService.getValue('GITHUB_CLIENT_ID');
    const clientSecret = await this.settingService.getValue('GITHUB_CLIENT_SECRET');
    return {
      isGithubAppConfigured: !!(clientId && clientSecret)
    };
  }

  @Get(':key')
  async getSetting(@Param('key') key: string) {
    if (key === 'AGENT_SECRET_TOKEN' || key === 'GITHUB_CLIENT_SECRET' || key === 'GHCR_TOKEN') {
      const val = await this.settingService.getValue(key);
      return { isSet: !!val };
    }
    const value = await this.settingService.getValue(key);
    return { value };
  }

  @Put(':key')
  async updateSetting(
    @Param('key') key: string,
    @Body('value') value: string,
  ) {
    await this.settingService.setValue(key, value);
    return { success: true };
  }

  @Post('self-update')
  async selfUpdate() {
    return this.settingService.handleSelfUpdate();
  }

  @Get('system-update/status')
  async getSystemUpdateStatus() {
    const updateAvailable = await this.settingService.getValue('MAIN_CENTER_UPDATE_AVAILABLE');
    const autoUpdate = await this.settingService.getValue('MAIN_CENTER_AUTO_UPDATE');
    const lastDigest = await this.settingService.getValue('MAIN_CENTER_LAST_DIGEST');

    return {
      updateAvailable: updateAvailable === 'true',
      autoUpdate: autoUpdate === 'true',
      lastDigest
    };
  }

  @Post('system-update/check')
  async checkSystemUpdate() {
    return this.settingService.checkSystemUpdate();
  }
}
