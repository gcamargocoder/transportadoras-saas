import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { AppConfig } from '../config/configuration';
import { buildFiscalDocumentMulterOptions } from './config/fiscal-document-storage.config';
import { FiscalDocumentsController } from './controllers/fiscal-documents.controller';
import { FiscalDocumentsService } from './services/fiscal-documents.service';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) =>
        buildFiscalDocumentMulterOptions(configService),
    }),
  ],
  controllers: [FiscalDocumentsController],
  providers: [FiscalDocumentsService],
})
export class FiscalModule {}
