import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { extname, resolve } from 'path';
import { ConfigService } from '@nestjs/config';
import { MulterModuleOptions } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { AppConfig } from '../../config/configuration';
import { ALLOWED_CHECKLIST_EVIDENCE_EXTENSIONS } from '../constants/checklist-evidence-file.constants';

// Fase 39 -- mesmo padrao de toll-import-storage.config.ts (Fase 33): disco
// PRIVADO (nunca registrado como pasta estatica em main.ts, nunca servido
// por nenhuma rota), nome de arquivo sempre um UUID novo + extensao
// original em minusculo (nunca o nome enviado pelo cliente -- evita path
// traversal/overwrite/extensao dupla).
export function buildChecklistEvidenceMulterOptions(
  configService: ConfigService<AppConfig, true>,
): MulterModuleOptions {
  const storageDir = resolve(configService.get('checklistEvidence.storageDir', { infer: true }));
  const maxFileSizeMb = configService.get('checklistEvidence.maxFileSizeMb', { infer: true });

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
      callback(null, ALLOWED_CHECKLIST_EVIDENCE_EXTENSIONS.includes(ext));
    },
    limits: { fileSize: maxFileSizeMb * 1024 * 1024 },
  };
}
