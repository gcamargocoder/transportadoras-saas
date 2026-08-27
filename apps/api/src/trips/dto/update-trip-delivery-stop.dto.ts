import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { CreateTripDeliveryStopDto } from './create-trip-delivery-stop.dto';

// customerId e omitido do PartialType e redeclarado abaixo aceitando tambem
// `null` -- e o unico jeito de expressar "desvincular o destinatario" (mesmo
// padrao de UpdateTripDto.tollRouteId -- compact() preserva null e descarta
// somente undefined).
export class UpdateTripDeliveryStopDto extends PartialType(
  OmitType(CreateTripDeliveryStopDto, ['customerId'] as const),
) {
  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Destinatario. Envie null para desvincular o cliente desta parada.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'customerId deve ser um UUID valido.' })
  customerId?: string | null;
}
