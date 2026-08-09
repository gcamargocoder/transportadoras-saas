import { ConflictException } from '@nestjs/common';

// Regra unica de "quilometragem so anda para frente" (Fase 18/27) --
// compartilhada por qualquer fluxo que registre um novo odometro para um
// veiculo (abastecimento administrativo, abastecimento do app, largada da
// viagem), para nunca duplicar a mesma validacao/calculo em cada service.
export function assertOdometerNotBelowVehicle(
  currentOdometerKm: number | null,
  nextOdometerKm: number,
): void {
  if (currentOdometerKm !== null && nextOdometerKm < currentOdometerKm) {
    throw new ConflictException(
      `odometerKm (${nextOdometerKm}) nao pode ser menor que a quilometragem atual do veiculo (${currentOdometerKm} km).`,
    );
  }
}

// Retorna o novo valor a gravar em Vehicle.odometerKm quando nextOdometerKm
// e maior que o atual, ou null quando nao ha nada a atualizar (evita um
// UPDATE desnecessario).
export function computeBumpedOdometer(
  currentOdometerKm: number | null,
  nextOdometerKm: number,
): number | null {
  if (currentOdometerKm === null || nextOdometerKm > currentOdometerKm) {
    return nextOdometerKm;
  }
  return null;
}
