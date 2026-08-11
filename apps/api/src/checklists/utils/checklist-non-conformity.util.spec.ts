import { ChecklistItemType } from '@prisma/client';
import { ChecklistAnswerWithItem, hasCriticalNonConformity } from './checklist-non-conformity.util';

function answer(overrides: Partial<ChecklistAnswerWithItem['item']> & { booleanValue?: boolean | null }): ChecklistAnswerWithItem {
  return {
    booleanValue: overrides.booleanValue ?? null,
    item: {
      type: overrides.type ?? ChecklistItemType.BOOLEAN,
      required: overrides.required ?? true,
      critical: overrides.critical ?? true,
    },
  };
}

describe('hasCriticalNonConformity', () => {
  it('retorna true quando um item critico e obrigatorio foi respondido NAO', () => {
    const answers = [answer({ booleanValue: false })];
    expect(hasCriticalNonConformity(answers)).toBe(true);
  });

  it('retorna false quando a resposta do item critico e obrigatorio foi SIM', () => {
    const answers = [answer({ booleanValue: true })];
    expect(hasCriticalNonConformity(answers)).toBe(false);
  });

  it('retorna false quando o item nao e critico', () => {
    const answers = [answer({ booleanValue: false, critical: false })];
    expect(hasCriticalNonConformity(answers)).toBe(false);
  });

  it('retorna false quando o item critico nao e obrigatorio', () => {
    const answers = [answer({ booleanValue: false, required: false })];
    expect(hasCriticalNonConformity(answers)).toBe(false);
  });

  it('ignora itens que nao sao do tipo BOOLEAN mesmo com booleanValue false', () => {
    const answers = [answer({ booleanValue: false, type: ChecklistItemType.TEXT })];
    expect(hasCriticalNonConformity(answers)).toBe(false);
  });

  it('retorna true se pelo menos uma entre varias respostas for critica e negativa', () => {
    const answers = [
      answer({ booleanValue: true }),
      answer({ booleanValue: false, critical: false }),
      answer({ booleanValue: false }),
    ];
    expect(hasCriticalNonConformity(answers)).toBe(true);
  });

  it('retorna false para lista vazia de respostas', () => {
    expect(hasCriticalNonConformity([])).toBe(false);
  });
});
