import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

// Controller minimo, apenas para health check da API.
// Nenhuma rota de negocio foi criada nesta etapa.
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }
}
