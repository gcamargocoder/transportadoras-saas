import { ApiProperty } from '@nestjs/swagger';
import { TripStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateTripStatusDto {
  @ApiProperty({ enum: TripStatus, example: TripStatus.IN_PROGRESS })
  @IsEnum(TripStatus, { message: 'status invalido.' })
  status!: TripStatus;
}
