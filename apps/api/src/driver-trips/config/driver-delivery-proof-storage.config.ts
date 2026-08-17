import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { extname, resolve } from 'path';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';
import { ALLOWED_FISCAL_DOCUMENT_EXTENSIONS } from '../../fiscal/constants/fiscal-file.constants';

// Fase 56 -- comprovante de entrega (Driver App) reaproveita o MESMO
// diretorio/extensoes/limite de tamanho de fiscal-document-storage.config.ts
// (mesmas variaveis de ambiente FISCAL_DOCUMENTS_STORAGE_DIR/
// FISCAL_DOCUMENTS_MAX_FILE_SIZE_MB -- nunca um storage paralelo), mas
// construido SEM injecao de dependencia: DriverTripsModule ja registra um
// MulterModule (evidencia de checklist, so JPG/PNG) para o unico upload
// pre-existente do controller; registrar um SEGUNDO MulterModule no mesmo
// modulo colidiria com esse provider. Passar as opcoes LITERALMENTE para
// FileInterceptor('file', options) (suportado nativamente pelo Nest) evita
// essa colisao sem duplicar nenhuma logica de dominio -- so le os MESMOS
// valores de env que ConfigService leria.
export function buildDriverDeliveryProofMulterOptions(): MulterOptions {
  const storageDir = resolve(process.env.FISCAL_DOCUMENTS_STORAGE_DIR ?? './storage/fiscal-documents');
  const maxFileSizeMb = parseInt(process.env.FISCAL_DOCUMENTS_MAX_FILE_SIZE_MB ?? '15', 10);

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
