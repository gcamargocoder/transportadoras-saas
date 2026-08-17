import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class FreightRuleFeeDto {
  @ApiProperty({ example: 'Descarga' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label!: string;

  @ApiProperty({ example: 80 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'amount nao pode ser negativo.' })
  amount!: number;
}
