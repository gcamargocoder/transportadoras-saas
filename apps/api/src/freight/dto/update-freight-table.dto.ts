import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { FreightTableStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateFreightTableDto } from './create-freight-table.dto';

export class UpdateFreightTableDto extends PartialType(CreateFreightTableDto) {
  @ApiPropertyOptional({ enum: FreightTableStatus })
  @IsOptional()
  @IsEnum(FreightTableStatus, { message: 'status invalido.' })
  status?: FreightTableStatus;
}
