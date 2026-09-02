import { Module } from '@nestjs/common';
import { VehicleIdlePeriodsController } from './controllers/vehicle-idle-periods.controller';
import { VehicleIdlePeriodsService } from './services/vehicle-idle-periods.service';

// Fase B -- periodo ocioso PERSISTIDO entre operacoes. Modulo enxuto: so
// PrismaService + AuditService (ambos @Global). Exportado para
// TripsModule (abertura/fechamento AUTO na maquina de estados da viagem) e
// FleetOperationsModule (Torre de Controle prioriza o periodo persistido /
// Fase A continua como fallback).
@Module({
  controllers: [VehicleIdlePeriodsController],
  providers: [VehicleIdlePeriodsService],
  exports: [VehicleIdlePeriodsService],
})
export class VehicleIdlePeriodsModule {}
