import { Module } from '@nestjs/common';
import { CustomerProfitabilityController } from './controllers/customer-profitability.controller';
import { CustomerProfitabilityService } from './services/customer-profitability.service';

// Fase 97 -- nenhuma dependencia de outro modulo: le Trip/TripRevenue/
// TripExpense/FuelSupply/TollTransaction/Customer direto via Prisma (global),
// mesma metodologia ja usada por TripSettlementsService/FreightDashboardService,
// nunca reimplementada com uma regra diferente. Sem escrita, sem migration.
@Module({
  controllers: [CustomerProfitabilityController],
  providers: [CustomerProfitabilityService],
})
export class CustomerProfitabilityModule {}
