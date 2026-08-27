import { Module } from '@nestjs/common';
import { FreightModule } from '../freight/freight.module';
import { ContractRenewalsController } from './controllers/contract-renewals.controller';
import { ContractRenewalsService } from './services/contract-renewals.service';

@Module({
  imports: [FreightModule],
  controllers: [ContractRenewalsController],
  providers: [ContractRenewalsService],
})
export class ContractRenewalsModule {}
