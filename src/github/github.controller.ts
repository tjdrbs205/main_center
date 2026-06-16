import { Controller, Get, Query, Redirect, Res, Req, InternalServerErrorException } from '@nestjs/common';
import { GithubService } from './github.service';
import type { Response } from 'express';

@Controller('api/github')
export class GithubController {
  constructor(private readonly githubService: GithubService) {}

  @Get('login')
  async login(@Res() res: Response) {
    try {
      const url = await this.githubService.getLoginUrl();
      res.redirect(url);
    } catch (error: any) {
      res.status(400).send(error.message);
    }
  }

  @Get('callback')
  async callback(@Query('code') code: string, @Res() res: Response) {
    if (!code) {
      return res.status(400).send('Authorization code missing');
    }

    try {
      await this.githubService.handleCallback(code);
      // Redirect back to the main UI after successful auth
      res.redirect('/');
    } catch (error: any) {
      res.status(500).send(`Failed to authenticate with GitHub: ${error.message}`);
    }
  }

  @Get('repos')
  async getRepos() {
    try {
      return await this.githubService.getRepositories();
    } catch (error: any) {
      throw new InternalServerErrorException(error.message);
    }
  }
}
