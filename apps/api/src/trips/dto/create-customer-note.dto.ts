import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCustomerNoteDto {
  @ApiProperty({ example: 'Cliente solicitou revisao do prazo de coleta para as quintas-feiras.' })
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  content!: string;
}
