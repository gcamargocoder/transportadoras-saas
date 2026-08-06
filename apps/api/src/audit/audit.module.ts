import { Global, Module } from '@nestjs/common';
import { AuditService } from './services/audit.service';

// Global: qualquer modulo de negocio injeta AuditService sem precisar
// importar AuditModule explicitamente (mesmo padrao do PrismaModule).
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
