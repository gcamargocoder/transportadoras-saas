import { ApiProperty } from '@nestjs/swagger';
import { TollRouteStopEntity } from './toll-route-stop.entity';

export class TollRouteEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  originLabel!: string;

  @ApiProperty()
  destinationLabel!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: [TollRouteStopEntity], description: 'Pracas esperadas, em ordem.' })
  stops!: TollRouteStopEntity[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
