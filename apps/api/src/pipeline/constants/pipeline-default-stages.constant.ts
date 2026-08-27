// Fase 96 -- conjunto inicial padrao (regra da fase), criado uma unica vez
// por tenant na primeira vez que o pipeline e acessado (ver
// PipelineStagesService.ensureDefaultStages). Depois de criado, cada tenant
// e livre para renomear/reordenar/inativar ou adicionar novos estagios --
// esta lista nunca e reaplicada/sincronizada depois da primeira vez.
export const PIPELINE_DEFAULT_STAGES: ReadonlyArray<{
  name: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
}> = [
  { name: 'Lead', order: 1, isWon: false, isLost: false },
  { name: 'Cotação', order: 2, isWon: false, isLost: false },
  { name: 'Proposta', order: 3, isWon: false, isLost: false },
  { name: 'Negociação', order: 4, isWon: false, isLost: false },
  { name: 'Ganho', order: 5, isWon: true, isLost: false },
  { name: 'Perdido', order: 6, isWon: false, isLost: true },
];
