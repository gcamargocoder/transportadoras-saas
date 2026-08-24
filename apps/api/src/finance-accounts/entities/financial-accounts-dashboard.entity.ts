import { ApiProperty } from '@nestjs/swagger';

// GET /finance/accounts/dashboard (Fase 78, secao 14) -- visao ATUAL das
// contas (sem evolucao temporal, fora do escopo desta fase). Os totais de
// saldo somam TODAS as contas (ativas e inativas) -- uma conta inativa ainda
// representa dinheiro que precisa aparecer em algum lugar; activeAccounts/
// inactiveAccounts e que distinguem o status (ver docs/financial-accounts.md).
export class FinancialAccountsDashboardEntity {
  @ApiProperty()
  totalBalance!: number;

  @ApiProperty()
  totalBankBalance!: number;

  @ApiProperty()
  totalCashBalance!: number;

  @ApiProperty()
  activeAccounts!: number;

  @ApiProperty()
  inactiveAccounts!: number;
}
