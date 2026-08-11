import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Min, MaxLength, ValidateNested } from 'class-validator';
import { CreateChecklistItemDto } from './create-checklist-item.dto';

export class CreateChecklistSectionDto {
  @ApiProperty({ example: 'SEGURANCA' })
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ description: 'Ordem explicita de exibicao dentro do template.' })
  @IsInt()
  @Min(0)
  order!: number;

  @ApiProperty({ type: [CreateChecklistItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'a section precisa de pelo menos 1 item.' })
  @ArrayMaxSize(200, { message: 'no maximo 200 itens por section.' })
  @ValidateNested({ each: true })
  @Type(() => CreateChecklistItemDto)
  items!: CreateChecklistItemDto[];
}
