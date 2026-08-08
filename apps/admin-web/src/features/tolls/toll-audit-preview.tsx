import { AlertCircle, TrendingDown, TrendingUp } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { formatCurrency } from '../../utils/format';
import { AUDIT_VERDICT_LABELS, AUDIT_VERDICT_TONE, type TollAuditPreview } from './audit-verdict';

export function TollAuditPreviewCard({
  preview,
  chargedAmount,
}: {
  preview: TollAuditPreview;
  chargedAmount: number | null;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-surface-subtle p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
        Conferência do pedágio
      </p>

      {preview.verdict === 'UNVERIFIABLE' ? (
        <div className="flex items-start gap-2.5">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-ink-subtle" />
          <div>
            {chargedAmount !== null && (
              <p className="text-sm text-ink-muted">
                Valor cobrado:{' '}
                <span className="font-medium text-ink">{formatCurrency(chargedAmount)}</span>
              </p>
            )}
            <p className="mt-1 text-sm font-medium text-ink">Valor esperado: não disponível</p>
            {preview.message && <p className="mt-1 text-xs text-ink-subtle">{preview.message}</p>}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-ink-muted">Valor esperado</span>
            <span className="text-right font-medium text-ink">
              {formatCurrency(preview.expectedAmount)}
            </span>
            <span className="text-ink-muted">Valor cobrado</span>
            <span className="text-right font-medium text-ink">{formatCurrency(chargedAmount)}</span>
          </div>
          <div className="my-1 border-t border-border" />
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-muted">Divergência</span>
            <span
              className={`flex items-center gap-1 text-sm font-semibold ${
                preview.verdict === 'OVERCHARGE'
                  ? 'text-danger-600'
                  : preview.verdict === 'UNDERCHARGE'
                    ? 'text-warning-600'
                    : 'text-success-600'
              }`}
            >
              {preview.verdict === 'OVERCHARGE' && <TrendingUp size={14} />}
              {preview.verdict === 'UNDERCHARGE' && <TrendingDown size={14} />}
              {preview.discrepancyAmount !== null && preview.discrepancyAmount > 0 ? '+ ' : ''}
              {formatCurrency(preview.discrepancyAmount)}
            </span>
          </div>
        </div>
      )}

      <div className="mt-3">
        <Badge tone={AUDIT_VERDICT_TONE[preview.verdict]}>
          {AUDIT_VERDICT_LABELS[preview.verdict]}
        </Badge>
      </div>
    </div>
  );
}
