import { Module } from '@nestjs/common';
import { TiresController } from './controllers/tires.controller';
import { TiresService } from './services/tires.service';

@Module({
  controllers: [TiresController],
  providers: [TiresService],
})
export class TiresModule {}
