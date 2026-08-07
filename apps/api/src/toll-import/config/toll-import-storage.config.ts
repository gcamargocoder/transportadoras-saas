import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { extname, resolve } from 'path';
import { ConfigService } from '@nestjs/config';
import { MulterModuleOptions } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { AppConfig } from '../../config/configuration';
import { ALLOWED_TOLL_IMPORT_EXTENSIONS } from '../constants/toll-import-file.constants';

// Storage sempre em disco PRIVADO (nunca registrado como pasta estatica em
// main.ts, nunca servido por nenhuma rota) -- ver
// docs/SECURITY_AND_DEVELOPMENT_STANDARDS.md, secao 10 ("Uploads").
// Nome do arquivo em disco e sempre um UUID novo + extensao original em
// minusculo -- nunca o nome enviado pelo cliente, o que evita path
// traversal, overwrite e qualquer tentativa de "extensao dupla" (ex:
// "extrato.csv.exe").
export function buildTollImportMulterOptions(
  configService: ConfigService<AppConfig, true>,
): MulterModuleOptions {
  const storageDir = resolve(configService.get('tollImport.storageDir', { infer: true }));
  const maxFileSizeMb = configService.get('tollImport.maxFileSizeMb', { infer: true });

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
    // Rejeita qualquer extensao fora da whitelist ANTES de gravar em disco
    // -- nunca aceita executaveis nem formatos ainda nao suportados.
    fileFilter: (_req, file, callback) => {
      const ext = extname(file.originalname).toLowerCase();
      callback(null, ALLOWED_TOLL_IMPORT_EXTENSIONS.includes(ext));
    },
    limits: { fileSize: maxFileSizeMb * 1024 * 1024 },
  };
}
