import { ApiProperty } from '@nestjs/swagger';

export class MercadoPagoAuthorizationEntity {
  @ApiProperty({ description: 'URL de checkout do Mercado Pago para o tenant autorizar a cobranca recorrente.' })
  initPoint!: string;
}
