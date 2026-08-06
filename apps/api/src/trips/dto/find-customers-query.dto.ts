import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class FindCustomersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Busca livre por nome ou documento.' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;
}
