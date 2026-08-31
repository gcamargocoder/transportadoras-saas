import { ApiProperty } from '@nestjs/swagger';

// PEDAGIO PROXIMO (Fase 25, secao 11) -- pracas do corredor operacional
// manual da viagem (TollRoute, Fase 23) quando cadastrado; na ausencia dele,
// pracas com match real na rota geografica ja calculada (RoutePlan.tolls,
// corrigido na auditoria "TMS + Driver App") -- nunca uma busca livre no
// cadastro global de pracas.
export class NearbyTollPlazaEntity {
  @ApiProperty({ format: 'uuid' })
  tollPlazaId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  highway!: string | null;

  @ApiProperty({ description: 'Distancia aproximada em linha reta, em metros.' })
  distanceMeters!: number;

  @ApiProperty({ description: 'Quantidade de eixos padrao da composicao -- usada se o motorista nao alterar.' })
  defaultAxles!: number;
}
