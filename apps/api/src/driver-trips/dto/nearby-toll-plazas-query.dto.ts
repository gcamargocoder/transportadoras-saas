import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber } from 'class-validator';

export class NearbyTollPlazasQueryDto {
  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  lat!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  lng!: number;
}
