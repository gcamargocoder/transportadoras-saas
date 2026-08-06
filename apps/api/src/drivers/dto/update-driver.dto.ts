import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';
import { CreateDriverDto } from './create-driver.dto';

// PartialType reaproveita campos + validadores de CreateDriverDto (todos
// viram opcionais) -- evita duplicar ~15 decorators de validacao aqui.
export class UpdateDriverDto extends PartialType(CreateDriverDto) {
  @ApiPropertyOptional({ example: '2026-03-01', description: 'Data de desligamento do motorista.' })
  @IsOptional()
  @IsDateString({}, { message: 'terminationDate deve ser uma data valida (ISO 8601).' })
  terminationDate?: string;
}
