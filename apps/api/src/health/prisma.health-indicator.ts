import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

// Indicador customizado de saude do banco de dados: executa um SELECT
// trivial para confirmar que a conexao Prisma <-> Postgres esta ativa.
@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return this.getStatus(key, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      throw new HealthCheckError(
        'Prisma health check falhou',
        this.getStatus(key, false, { message }),
      );
    }
  }
}
