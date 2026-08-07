import { Module } from '@nestjs/common';
import { TollPlazasController } from './controllers/toll-plazas.controller';
import { TollTransactionsController } from './controllers/toll-transactions.controller';
import { TollPlazasService } from './services/toll-plazas.service';
import { TollTransactionsService } from './services/toll-transactions.service';

@Module({
  controllers: [TollPlazasController, TollTransactionsController],
  providers: [TollPlazasService, TollTransactionsService],
})
export class TollsModule {}
