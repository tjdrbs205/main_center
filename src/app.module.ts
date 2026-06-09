import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ServerModule } from './server/server.module';
import { ProjectModule } from './project/project.module';
import { DeployModule } from './deploy/deploy.module';
import { WebhookModule } from './webhook/webhook.module';
import { HealthModule } from './health/health.module';

import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { EnvironmentModule } from './environment/environment.module';
import { TemplateModule } from './template/template.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: 'data/db.sqlite',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
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
    WebhookModule,
    HealthModule,
    EnvironmentModule,
    TemplateModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
