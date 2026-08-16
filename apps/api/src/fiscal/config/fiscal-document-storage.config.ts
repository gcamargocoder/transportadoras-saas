import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { extname, resolve } from 'path';
import { ConfigService } from '@nestjs/config';
import { MulterModuleOptions } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { AppConfig } from '../../config/configuration';
import { ALLOWED_FISCAL_DOCUMENT_EXTENSIONS } from '../constants/fiscal-file.constants';

// Fase 52 -- mesmo padrao de toll-import-storage.config.ts/
// checklist-evidence-storage.config.ts: disco PRIVADO (nunca registrado como
// pasta estatica em main.ts, nunca servido por nenhuma rota), nome de
// arquivo em disco sempre um UUID novo + extensao original em minusculo
// (nunca o nome enviado pelo cliente). Aceita as 5 extensoes do modulo
// (upload livre); a rota de IMPORTACAO (so XML) restringe mais na propria
// service, apos o upload -- nao existe um segundo multer separado so por
// causa de 1 extensao a menos (ver FiscalDocumentsService.importXml).
export function buildFiscalDocumentMulterOptions(
  configService: ConfigService<AppConfig, true>,
): MulterModuleOptions {
  const storageDir = resolve(configService.get('fiscalDocuments.storageDir', { infer: true }));
  const maxFileSizeMb = configService.get('fiscalDocuments.maxFileSizeMb', { infer: true });

  if (!existsSync(storageDir)) {
    mkdirSync(storageDir, { recursive: true });
  }

  return {
    storage: diskStorage({
      destination: storageDir,
      filename: (_req, file, callback) => {
        callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
      },
    }),
    fileFilter: (_req, file, callback) => {
      const ext = extname(file.originalname).toLowerCase();
      callback(null, ALLOWED_FISCAL_DOCUMENT_EXTENSIONS.includes(ext));
    },
    limits: { fileSize: maxFileSizeMb * 1024 * 1024 },
  };
}
