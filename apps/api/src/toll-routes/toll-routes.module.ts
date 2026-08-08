import { Module } from '@nestjs/common';
import { TollRoutesController } from './controllers/toll-routes.controller';
import { TollRoutesService } from './services/toll-routes.service';
import { TollReconciliationService } from './services/toll-reconciliation.service';

@Module({
  controllers: [TollRoutesController],
  providers: [TollRoutesService, TollReconciliationService],
  exports: [TollRoutesService, TollReconciliationService],
})
export class TollRoutesModule {}
