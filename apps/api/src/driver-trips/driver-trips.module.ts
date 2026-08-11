import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { AppConfig } from '../config/configuration';
import { buildChecklistEvidenceMulterOptions } from '../checklists/config/checklist-evidence-storage.config';
import { ChecklistsModule } from '../checklists/checklists.module';
import { FuelSuppliesModule } from '../fuel-supplies/fuel-supplies.module';
import { RoutingModule } from '../routing/routing.module';
import { TripOperationsModule } from '../trip-operations/trip-operations.module';
import { TripsModule } from '../trips/trips.module';
import { DriverTripsController } from './controllers/driver-trips.controller';
import { DriverContext } from './context/driver-context';
import { DriverGuard } from './guards/driver.guard';
import { DriverTripsService } from './services/driver-trips.service';

// API propria do app do motorista (Fase 25). Importa TripsModule so para
// reaproveitar TripsService (maquina de estados/auditoria/metricas ja
// existente -- nunca duplicada aqui) e TripOperationsModule para os 3
// servicos de sub-recurso (paradas/eixos/localizacao), compartilhados com a
// leitura administrativa em TripsController. ChecklistsModule (Fase 38)
// segue o mesmo padrao de FuelSuppliesModule: os endpoints driver/checklists/*
// vivem direto no DriverTripsController, nunca um controller/guard duplicado.
// MulterModule (Fase 39) -- upload de evidencia de checklist, mesmo padrao
// de TollImportModule (disco privado, ver checklist-evidence-storage.config.ts).
@Module({
  imports: [
    TripsModule,
    TripOperationsModule,
    FuelSuppliesModule,
    RoutingModule,
    ChecklistsModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) =>
        buildChecklistEvidenceMulterOptions(configService),
    }),
  ],
  controllers: [DriverTripsController],
  providers: [DriverTripsService, DriverContext, DriverGuard],
})
export class DriverTripsModule {}
