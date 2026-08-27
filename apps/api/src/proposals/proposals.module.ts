import { Module } from '@nestjs/common';
import { ProposalsController } from './controllers/proposals.controller';
import { ProposalsService } from './services/proposals.service';

// Fase 95 -- nenhuma dependencia de modulo externo: valida Customer/
// Quotation via consulta direta ao Prisma (mesmo padrao leve ja usado por
// QuotationsService/ContractsService/FreightPricingService para
// assertCustomerExists), nunca importa CustomersService/QuotationsService.
// Nunca cria Trip nem aplica precificacao -- sem TripsModule/FreightModule.
@Module({
  controllers: [ProposalsController],
  providers: [ProposalsService],
})
export class ProposalsModule {}
