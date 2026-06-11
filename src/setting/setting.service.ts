import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from './setting.entity';

@Injectable()
export class SettingService {
  constructor(
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
  ) {}

  async getValue(key: string): Promise<string | null> {
    const setting = await this.settingRepository.findOne({ where: { key } });
    return setting ? setting.value : null;
  }

  async setValue(key: string, value: string): Promise<Setting> {
    let setting = await this.settingRepository.findOne({ where: { key } });
    if (setting) {
      setting.value = value;
    } else {
      setting = this.settingRepository.create({ key, value });
    }
    return this.settingRepository.save(setting);
  }
}
