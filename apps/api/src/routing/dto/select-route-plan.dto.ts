import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SelectRoutePlanDto {
  @ApiProperty({ format: 'uuid', description: 'Uma das RoutePlan ja calculadas para esta viagem (ver GET .../route-plan/tolls ou POST .../alternatives).' })
  @IsUUID('4', { message: 'routePlanId deve ser um UUID valido.' })
  routePlanId!: string;
}
