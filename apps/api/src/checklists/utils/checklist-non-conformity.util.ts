import { ChecklistItemType } from '@prisma/client';

export interface ChecklistAnswerWithItem {
  booleanValue: boolean | null;
  item: {
    type: ChecklistItemType;
    required: boolean;
    critical: boolean;
  };
}

// Fase 38, secao 16 -- "preservar a informacao, nunca bloquear
// automaticamente". Funcao pura (sem Prisma/IO) para ficar testavel sem
// mock de banco (ver auditoria: nao ha precedente de mock de PrismaService
// neste projeto). So considera itens BOOLEAN -- outros tipos nunca tem
// booleanValue preenchido de verdade, entao nunca deveriam "contar" aqui
// mesmo que um valor residual exista.
export function hasCriticalNonConformity(answers: ChecklistAnswerWithItem[]): boolean {
  return answers.some(
    (answer) =>
      answer.item.type === ChecklistItemType.BOOLEAN &&
      answer.item.critical &&
      answer.item.required &&
      answer.booleanValue === false,
  );
}
