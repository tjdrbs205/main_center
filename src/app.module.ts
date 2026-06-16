import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ServerModule } from './server/server.module';
import { ProjectModule } from './project/project.module';
import { DeployModule } from './deploy/deploy.module';
import { HealthModule } from './health/health.module';

import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EnvironmentModule } from './environment/environment.module';
import { SettingModule } from './setting/setting.module';
import { Setting } from './setting/setting.entity';
import { GithubModule } from './github/github.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: 'data/db.sqlite',
      entities: [__dirname + '/**/*.entity{.ts,.js}', Setting],
      synchronize: true,
    }),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api{/*path}'],
    }),
    ServerModule,
    ProjectModule,
    DeployModule,
    HealthModule,
    EnvironmentModule,
    SettingModule,
    GithubModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
