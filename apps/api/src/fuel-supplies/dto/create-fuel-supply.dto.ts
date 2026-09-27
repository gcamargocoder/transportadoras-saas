import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FuelType, PaymentType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  MaxLength,
  ValidateIf,
} from 'class-validator';

// totalAmount NAO faz parte deste DTO -- e SEMPRE calculado no service
// (liters * pricePerLiter), nunca aceito do cliente.
//
// vehicleId/driverId sao condicionais: quando tripId e informado, sao
// SEMPRE derivados da viagem (qualquer valor aqui enviado e ignorado pelo
// service); quando tripId esta ausente, tornam-se obrigatorios e validados
// diretamente (ver TripAdvance/TripExpense para o mesmo principio aplicado
// ao caso "sempre ha viagem" -- aqui a viagem e opcional, entao existe um
// caminho alternativo explicito).
//
// Fase 7 (Gestao de Combustivel) -- fuelTankId/fuelStationId sao mutuamente
// exclusivos (validado no service, onde a mensagem pode citar os dois
// campos): presente = abastecimento INTERNO (baixa o tanque proprio na
// mesma transacao, via FuelTanksService.registerInternalFueling -- mesma
// funcao ja usada pelo Driver App, Fase 3); ausente = EXTERNO (posto/
// fornecedor, fluxo inalterado). pricePerLiter fica opcional pelo mesmo
// motivo do Driver App: abastecimento interno nao tem compra associada a
// ELE (o custo ja foi pago no RECEIPT) -- exigido apenas quando EXTERNO
// (validado no service, pois so ali se sabe se e interno).
export class CreateFuelSupplyDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Viagem associada (opcional).' })
  @IsOptional()
  @IsUUID('4', { message: 'tripId deve ser um UUID valido.' })
  tripId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Obrigatorio quando tripId nao e informado (ignorado quando ha viagem).',
  })
  @ValidateIf((dto: CreateFuelSupplyDto) => !dto.tripId)
  @IsUUID('4', { message: 'vehicleId deve ser um UUID valido.' })
  vehicleId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Obrigatorio quando tripId nao e informado (ignorado quando ha viagem).',
  })
  @ValidateIf((dto: CreateFuelSupplyDto) => !dto.tripId)
  @IsUUID('4', { message: 'driverId deve ser um UUID valido.' })
  driverId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Posto/fornecedor externo. Omitido quando o abastecimento e interno (fuelTankId) ou quando o posto nao e conhecido.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'fuelStationId deve ser um UUID valido.' })
  fuelStationId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Gestao de Combustivel -- tanque proprio de origem. Presente = abastecimento INTERNO ' +
      '(baixa o tanque); nunca junto de fuelStationId.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'fuelTankId deve ser um UUID valido.' })
  fuelTankId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Vinculo opcional a um Attachment (comprovante) ja existente.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'attachmentId deve ser um UUID valido.' })
  attachmentId?: string;

  @ApiProperty({ enum: FuelType, example: FuelType.DIESEL_S10 })
  @IsEnum(FuelType, { message: 'fuelType invalido.' })
  fuelType!: FuelType;

  @ApiProperty({ example: 250.5, description: 'Litros abastecidos -- deve ser maior que zero.' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive({ message: 'liters deve ser maior que zero.' })
  liters!: number;

  @ApiPropertyOptional({
    example: 5.899,
    description: 'Preco por litro -- obrigatorio (maior que zero) para abastecimento EXTERNO; opcional para INTERNO (fuelTankId).',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0, { message: 'pricePerLiter nao pode ser negativo.' })
  pricePerLiter?: number;

  @ApiProperty({ example: 125000, description: 'Odometro no momento do abastecimento.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'odometerKm nao pode ser negativo.' })
  odometerKm!: number;

  @ApiProperty({ example: '2026-09-02T14:00:00.000Z' })
  @IsDateString({}, { message: 'supplyDate deve ser uma data valida (ISO 8601).' })
  supplyDate!: string;

  @ApiPropertyOptional({ enum: PaymentType })
  @IsOptional()
  @IsEnum(PaymentType, { message: 'paymentType invalido.' })
  paymentType?: PaymentType;

  @ApiPropertyOptional({ example: 'NF-4521' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  invoiceNumber?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
