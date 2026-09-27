import { AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import type { BiAlertSeverity } from '../../types/entities';

// BI 10/11 -- unica fonte de rotulo/cor/icone de severidade de alerta,
// reaproveitada pela aba Alertas e pelo painel "Atenção" da Visão geral
// (BI 11). Severidade nunca e so cor -- sempre rotulo + icone.
export const ALERT_SEVERITY_OPTIONS: { value: BiAlertSeverity; label: string }[] = [
  { value: 'CRITICAL', label: 'Crítica' },
  { value: 'WARNING', label: 'Atenção' },
  { value: 'INFO', label: 'Informativa' },
];

export const ALERT_SEVERITY_TONE: Record<BiAlertSeverity, 'danger' | 'warning' | 'info'> = {
  CRITICAL: 'danger',
  WARNING: 'warning',
  INFO: 'info',
};

export const ALERT_SEVERITY_ICON = { CRITICAL: AlertOctagon, WARNING: AlertTriangle, INFO: Info };

export const ALERT_SEVERITY_RANK: Record<BiAlertSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

export const ALERT_SEVERITY_BORDER: Record<BiAlertSeverity, string> = {
  CRITICAL: 'border-l-danger-500',
  WARNING: 'border-l-warning-500',
  INFO: 'border-l-info-500',
};

export function alertSeverityLabel(severity: BiAlertSeverity): string {
  return ALERT_SEVERITY_OPTIONS.find((option) => option.value === severity)?.label ?? severity;
}
