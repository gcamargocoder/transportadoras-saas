import { ApiProperty } from '@nestjs/swagger';

export class TollRouteStopEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tollPlazaId!: string;

  @ApiProperty()
  tollPlazaName!: string;

  @ApiProperty({ nullable: true })
  highway!: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Tarifa por eixo da praca -- null quando desconhecida.',
  })
  pricePerAxle!: number | null;

  @ApiProperty({ description: '1 = primeira praca esperada da rota.' })
  sequence!: number;
}
