import { Injectable, Logger } from '@nestjs/common';
import { SettingService } from '../setting/setting.service';

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  constructor(private readonly settingService: SettingService) {}

  async getLoginUrl(): Promise<string> {
    const clientId = await this.settingService.getValue('GITHUB_CLIENT_ID');
    if (!clientId) throw new Error('GitHub Client ID is not configured');
    
    return `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo,read:packages`;
  }

  async handleCallback(code: string): Promise<void> {
    const clientId = await this.settingService.getValue('GITHUB_CLIENT_ID');
    const clientSecret = await this.settingService.getValue('GITHUB_CLIENT_SECRET');
    
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      })
    });
    
    const data = await response.json();
    if (data.access_token) {
      await this.settingService.setValue('GITHUB_ACCESS_TOKEN', data.access_token);
      this.logger.log('GitHub Access Token saved successfully.');
    } else {
      throw new Error(`Failed to get access token: ${JSON.stringify(data)}`);
    }
  }

  async getRepositories() {
    const token = await this.settingService.getValue('GITHUB_ACCESS_TOKEN');
    if (!token) throw new Error('GitHub is not connected (Missing Access Token)');
    
    const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'MainCenter'
      }
    });
    
    if (!response.ok) {
        if (response.status === 401) {
            // Token invalid or expired
            await this.settingService.setValue('GITHUB_ACCESS_TOKEN', '');
        }
        throw new Error(`GitHub API error: ${response.statusText}`);
    }
    
    const repos = await response.json();
    return repos.map((repo: any) => ({
      id: repo.id,
      name: repo.full_name,
      url: repo.html_url,
      private: repo.private
    }));
  }
}
