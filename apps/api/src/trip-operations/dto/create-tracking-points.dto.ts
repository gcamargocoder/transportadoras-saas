import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

// Um ponto de GPS individual, enviado pelo app do motorista. deviceEventId
// garante idempotencia: reenviar o mesmo ponto (ex: apos reconexao) nunca
// duplica -- ver TrackingPointsService.createBatch.
export class TrackingPointInputDto {
  @ApiProperty()
  @IsString()
  deviceEventId!: string;

  @ApiProperty()
  @IsNumber()
  latitude!: number;

  @ApiProperty()
  @IsNumber()
  longitude!: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  speedKmh?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  headingDeg?: number;

  @ApiProperty({ description: 'Timestamp do dispositivo no momento da leitura do GPS.' })
  @IsDateString({}, { message: 'recordedAt deve ser uma data valida (ISO 8601).' })
  recordedAt!: string;
}

// Lote de pontos (Fase 25) -- o app acumula localizacoes offline e envia em
// lote quando a conexao volta. Limite de tamanho evita payloads absurdos de
// um dispositivo com bug/loop.
export class CreateTrackingPointsDto {
  @ApiProperty({ type: [TrackingPointInputDto] })
  @ValidateNested({ each: true })
  @Type(() => TrackingPointInputDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  points!: TrackingPointInputDto[];
}
