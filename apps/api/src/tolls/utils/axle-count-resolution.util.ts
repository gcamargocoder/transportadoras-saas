import { BadRequestException } from '@nestjs/common';

// Regra de negocio central da Fase 27 (secoes 11-13): quando o axleCount de
// uma TollTransaction nao e informado explicitamente, o valor a usar e:
//   1. o declaredAxles do AxleEvent mais recente desta viagem NESTA praca
//      (excecao registrada pelo motorista -- ex: 7 em vez de 9), ou
//   2. na ausencia de excecao, o padrao da composicao
//      (AxleConfiguration.totalAxles).
// Nunca altera AxleConfiguration -- so LE o padrao para resolver um valor
// que sera gravado apenas na TollTransaction (passagem especifica).
export interface AxleCountResolutionInput {
  providedAxleCount?: number;
  matchingAxleEventDeclaredAxles?: number | null;
  defaultAxles?: number | null;
}

export function resolveAxleCount(input: AxleCountResolutionInput): number {
  if (input.providedAxleCount !== undefined) {
    return input.providedAxleCount;
  }
  if (input.matchingAxleEventDeclaredAxles !== null && input.matchingAxleEventDeclaredAxles !== undefined) {
    return input.matchingAxleEventDeclaredAxles;
  }
  if (input.defaultAxles !== null && input.defaultAxles !== undefined) {
    return input.defaultAxles;
  }
  throw new BadRequestException(
    'axleCount nao informado e nao ha AxleEvent nem configuracao de eixos da composicao para resolve-lo automaticamente.',
  );
}
