import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { AppConfig } from '../config/configuration';
import { TollImportController } from './controllers/toll-import.controller';
import { buildTollImportMulterOptions } from './config/toll-import-storage.config';
import { TollImportService } from './services/toll-import.service';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) =>
        buildTollImportMulterOptions(configService),
    }),
  ],
  controllers: [TollImportController],
  providers: [TollImportService],
})
export class TollImportModule {}
