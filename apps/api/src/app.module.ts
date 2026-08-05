import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Modulos de negocio (viagens, pedagios, veiculos, tenants...) serao
    // registrados aqui conforme forem implementados.
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
