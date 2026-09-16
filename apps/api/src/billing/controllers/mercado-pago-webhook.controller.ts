import { Body, Controller, Headers, HttpCode, HttpStatus, Logger, Post, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../auth/decorators/public.decorator';
import { WEBHOOK_THROTTLE } from '../../common/constants/throttle.constants';
import { MercadoPagoWebhookService } from '../services/mercado-pago-webhook.service';

interface MercadoPagoWebhookBody {
  type?: string;
  topic?: string;
  data?: { id?: string };
}

// Notificacao assincrona do Mercado Pago (preapproval autorizado/pausado/
// cancelado, pagamento de cobranca recorrente aprovado). @Public() -- sem
// JWT (o Mercado Pago nunca teria um token nosso) -- autenticado pela
// validacao de assinatura HMAC (x-signature), nunca por sessao. Fora do
// Swagger publico (endpoint tecnico de integracao, nao uma rota de negocio
// para o frontend consumir).
@ApiExcludeController()
@Controller('billing/webhooks/mercado-pago')
export class MercadoPagoWebhookController {
  private readonly logger = new Logger(MercadoPagoWebhookController.name);

  constructor(private readonly webhookService: MercadoPagoWebhookService) {}

  @Public()
  @Post()
  @Throttle(WEBHOOK_THROTTLE)
  @HttpCode(HttpStatus.OK)
  async receive(
    @Body() body: MercadoPagoWebhookBody,
    @Headers('x-signature') xSignature: string | undefined,
    @Headers('x-request-id') xRequestId: string | undefined,
  ): Promise<{ received: true }> {
    const dataId = body.data?.id;
    const type = body.type ?? body.topic;

    if (!dataId || !type) {
      this.logger.warn('Webhook Mercado Pago recebido sem type/data.id -- ignorado.');
      return { received: true };
    }

    if (!this.webhookService.validateSignature({ xSignature, xRequestId }, dataId)) {
      throw new UnauthorizedException('Assinatura do webhook invalida.');
    }

    await this.webhookService.process(type, dataId);
    return { received: true };
  }
}
