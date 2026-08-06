import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Client Prisma injetavel, com ciclo de vida atrelado ao ciclo de vida do
// Nest (conecta no bootstrap, desconecta no shutdown). Nenhuma query de
// negocio e feita aqui -- apenas a infraestrutura de conexao.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Conexao com o banco de dados estabelecida.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
