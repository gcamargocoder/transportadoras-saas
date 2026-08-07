import { ApiProperty } from '@nestjs/swagger';

// Dado de referencia GLOBAL (nao pertence a nenhum tenant).
export class TollPlazaEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  operator!: string;

  @ApiProperty({ nullable: true })
  highway!: string | null;

  @ApiProperty({ nullable: true })
  km!: number | null;

  @ApiProperty({ nullable: true })
  city!: string | null;

  @ApiProperty({ nullable: true })
  state!: string | null;

  @ApiProperty({ nullable: true })
  latitude!: number | null;

  @ApiProperty({ nullable: true })
  longitude!: number | null;

  @ApiProperty({ nullable: true, description: 'Valor cobrado por eixo.' })
  pricePerAxle!: number | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
