import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

// POST /driver/checklists -- inicia uma execucao real de um template
// PUBLISHED. Local/KM/responsavel sao capturados aqui (inicio da inspecao),
// espelhando os campos fixos do topo do formulario real (Local da Inspecao,
// Placa Cavalo/Carreta ja vem de vehicleId/trailerId, KM atual, Nome do
// Encarregado) -- ver modelo Sider anexado ao pedido da Fase 38.
export class CreateChecklistExecutionDto {
  @ApiProperty({ description: 'Id gerado pelo dispositivo -- garante idempotencia.' })
  @IsString()
  deviceEventId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4', { message: 'templateId deve ser um UUID valido.' })
  templateId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4', { message: 'tripId deve ser um UUID valido.' })
  tripId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Cavalo mecanico (Placa Cavalo).' })
  @IsOptional()
  @IsUUID('4', { message: 'vehicleId deve ser um UUID valido.' })
  vehicleId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Carreta (Placa Carreta).' })
  @IsOptional()
  @IsUUID('4', { message: 'trailerId deve ser um UUID valido.' })
  trailerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ description: 'KM atual informado (valor). Distinto da evidencia fotografica do odometro.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  odometerKm?: number;

  @ApiPropertyOptional({ description: 'Local da inspecao (texto livre, ex: endereco do patio).' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  inspectionLocation?: string;

  @ApiPropertyOptional({ description: 'Nome do encarregado/responsavel presente na inspecao.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  responsibleName?: string;
}
