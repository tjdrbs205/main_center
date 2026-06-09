import { Controller, Post, Param, Body } from '@nestjs/common';
import { WebhookService } from './webhook.service';

@Controller('api/webhook')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post('deploy/:token')
  async deployProject(
    @Param('token') token: string,
    @Body() body: { envKeys?: string },
  ) {
    return this.webhookService.handleDeployWebhook(token, body?.envKeys);
  }

  @Post('self-update')
  async selfUpdate() {
    return this.webhookService.handleSelfUpdate();
  }
}
