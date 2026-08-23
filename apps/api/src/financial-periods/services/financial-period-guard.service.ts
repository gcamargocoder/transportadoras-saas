import { ConflictException, Injectable } from '@nestjs/common';
import { FinancialPeriodStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Fase 76, secao 9 -- utilitario central consumido por qualquer servico que
// mute um dado com data financeira (ReceivablePayment/PayablePayment,
// criacao/cancelamento de Receivable/Payable). Responsabilidade unica:
// determinar o periodo YYYY-MM da data informada e bloquear a mutacao se
// esse periodo estiver CLOSED naquele tenant.
//
// Regra explicita (secao 9 do pedido): periodo INEXISTENTE = operacao
// permitida. O sistema NUNCA cria/abre um periodo automaticamente aqui --
// isso evita acoplamento excessivo entre o guard e o restante do dominio.
//
// Performance (secao 16): no maximo 1 consulta simples (findUnique por
// constraint unica tenantId+year+month) por chamada -- nunca 1 por
// pagamento/titulo em lote.
@Injectable()
export class FinancialPeriodGuardService {
  constructor(private readonly prisma: PrismaService) {}

  async assertPeriodOpenForDate(tenantId: string, financialDate: Date): Promise<void> {
    const year = financialDate.getUTCFullYear();
    const month = financialDate.getUTCMonth() + 1;

    const period = await this.prisma.financialPeriod.findUnique({
      where: { tenantId_year_month: { tenantId, year, month } },
      select: { status: true },
    });

    if (period?.status === FinancialPeriodStatus.CLOSED) {
      const label = `${String(month).padStart(2, '0')}/${year}`;
      throw new ConflictException(
        `O periodo financeiro ${label} esta FECHADO -- nao e possivel registrar ou alterar dados com esta data de competencia.`,
      );
    }
  }
}
