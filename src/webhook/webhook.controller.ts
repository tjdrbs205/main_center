import { Controller, Post, Headers, Body, UnauthorizedException } from '@nestjs/common';
import { WebhookService } from './webhook.service';

@Controller('api/webhook')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post('deploy')
  async deployProject(
    @Headers('authorization') authHeader: string,
    @Body() body: { envKeys?: string },
  ) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }
    const token = authHeader.split(' ')[1];
    return this.webhookService.handleDeployWebhook(token, body?.envKeys);
  }

  @Post('self-update')
  async selfUpdate(@Headers('authorization') authHeader: string) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }
    const token = authHeader.split(' ')[1];
    if (token !== process.env.AGENT_SECRET_TOKEN) {
      throw new UnauthorizedException('Invalid agent secret token');
    }
    return this.webhookService.handleSelfUpdate();
  }
}
