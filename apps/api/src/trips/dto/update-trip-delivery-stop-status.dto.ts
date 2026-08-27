import { ApiProperty } from '@nestjs/swagger';
import { TripDeliveryStopStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateTripDeliveryStopStatusDto {
  @ApiProperty({ enum: TripDeliveryStopStatus, example: TripDeliveryStopStatus.IN_PROGRESS })
  @IsEnum(TripDeliveryStopStatus, { message: 'status invalido.' })
  status!: TripDeliveryStopStatus;
}
