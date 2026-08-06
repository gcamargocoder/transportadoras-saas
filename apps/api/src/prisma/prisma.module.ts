import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Global para que qualquer modulo de negocio futuro injete PrismaService sem
// precisar importar PrismaModule explicitamente em cada feature module.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
