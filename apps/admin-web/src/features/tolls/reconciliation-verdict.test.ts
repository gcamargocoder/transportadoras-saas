import { describe, expect, it } from 'vitest';
import type { ReconciliationStatus, TollReconciliationStopVerdict } from '../../types/entities';
import { AUDIT_VERDICT_LABELS, AUDIT_VERDICT_TONE } from './audit-verdict';
import {
  RECONCILIATION_STATUS_LABELS,
  RECONCILIATION_STATUS_TONE,
  RECONCILIATION_VERDICT_LABELS,
  RECONCILIATION_VERDICT_TONE,
} from './reconciliation-verdict';

const ALL_VERDICTS: TollReconciliationStopVerdict[] = [
  'CORRECT',
  'OVERCHARGE',
  'UNDERCHARGE',
  'UNVERIFIABLE',
  'NOT_REGISTERED',
];

const ALL_STATUSES: ReconciliationStatus[] = [
  'PENDING',
  'CONFORM',
  'ATTENTION',
  'CRITICAL',
  'UNVERIFIABLE',
];

describe('reconciliation-verdict', () => {
  it('reaproveita exatamente os rótulos/tons dos 4 vereditos do motor de conferência (Fase 22)', () => {
    for (const verdict of ['CORRECT', 'OVERCHARGE', 'UNDERCHARGE', 'UNVERIFIABLE'] as const) {
      expect(RECONCILIATION_VERDICT_LABELS[verdict]).toBe(AUDIT_VERDICT_LABELS[verdict]);
      expect(RECONCILIATION_VERDICT_TONE[verdict]).toBe(AUDIT_VERDICT_TONE[verdict]);
    }
  });

  it('adiciona um rótulo/tom próprio para NOT_REGISTERED (único veredito novo da Fase 23)', () => {
    expect(RECONCILIATION_VERDICT_LABELS.NOT_REGISTERED).toMatch(/não registrado/i);
    expect(RECONCILIATION_VERDICT_TONE.NOT_REGISTERED).toBe('warning');
  });

  it('define rótulo e tom para todos os vereditos possíveis', () => {
    for (const verdict of ALL_VERDICTS) {
      expect(RECONCILIATION_VERDICT_LABELS[verdict]).toBeTruthy();
      expect(RECONCILIATION_VERDICT_TONE[verdict]).toBeTruthy();
    }
  });

  it('define rótulo e tom para todos os status gerais possíveis (Fase 24)', () => {
    for (const status of ALL_STATUSES) {
      expect(RECONCILIATION_STATUS_LABELS[status]).toBeTruthy();
      expect(RECONCILIATION_STATUS_TONE[status]).toBeTruthy();
    }
  });
});
