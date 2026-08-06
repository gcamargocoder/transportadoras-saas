import { Module } from '@nestjs/common';
import { DriversController } from './controllers/drivers.controller';
import { DriverDocumentsService } from './services/driver-documents.service';
import { DriversService } from './services/drivers.service';

@Module({
  controllers: [DriversController],
  providers: [DriversService, DriverDocumentsService],
})
export class DriversModule {}
