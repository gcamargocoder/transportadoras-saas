import { ApiProperty } from '@nestjs/swagger';

// GET /driver/config -- limites configuraveis por tenant que o app precisa
// para decidir LOCALMENTE quando abrir uma parada e quando mostrar o alerta
// de pedagio proximo (Fase 25, secoes 6/11). Nenhum job/worker no backend --
// a deteccao acontece no dispositivo, que tem o GPS continuo.
export class DriverConfigEntity {
  @ApiProperty()
  gpsPingIntervalSeconds!: number;

  @ApiProperty()
  stopDetectionMinutes!: number;

  @ApiProperty()
  stopRadiusMeters!: number;

  @ApiProperty()
  tollProximityRadiusMeters!: number;
}
