'use client';

import { Badge } from '../../components/ui/badge';
import { Drawer } from '../../components/ui/drawer';
import { FINANCE_AUDIT_ACTION_LABELS, FINANCE_AUDIT_ENTITY_NAME_LABELS } from '../../lib/labels';
import type { AuditLogEntity } from '../../types/entities';
import { formatDateTime } from '../../utils/format';

// Fase 77 -- somente leitura: nenhum editor, nenhuma acao de alterar/
// excluir (AuditLog e append-only, nunca mutavel pela API).
function JsonBlock({ label, value }: { label: string; value: unknown }): JSX.Element | null {
  if (value === null || value === undefined) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{label}</p>
      <pre className="scrollbar-thin overflow-x-auto rounded-md border border-border bg-surface-muted p-3 text-xs text-ink">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export function AuditDetailDrawer({ entry, onClose }: { entry: AuditLogEntity | null; onClose: () => void }): JSX.Element {
  return (
    <Drawer open={entry !== null} onClose={onClose} title="Detalhe do evento">
      {entry && (
        <div className="flex flex-col gap-4 p-4">
          <div>
            <Badge tone="info">{FINANCE_AUDIT_ACTION_LABELS[entry.action] ?? entry.action}</Badge>
            <p className="mt-1.5 text-xs text-ink-subtle">{entry.action}</p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-ink-subtle">Quando</p>
              <p className="mt-0.5 font-medium text-ink">{formatDateTime(entry.createdAt)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-subtle">Usuário (ID)</p>
              <p className="mt-0.5 break-all font-medium text-ink">{entry.userId ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-ink-subtle">Entidade</p>
              <p className="mt-0.5 font-medium text-ink">{FINANCE_AUDIT_ENTITY_NAME_LABELS[entry.entityName] ?? entry.entityName}</p>
            </div>
            <div>
              <p className="text-xs text-ink-subtle">Entidade (ID)</p>
              <p className="mt-0.5 break-all font-medium text-ink">{entry.entityId}</p>
            </div>
            <div>
              <p className="text-xs text-ink-subtle">IP</p>
              <p className="mt-0.5 font-medium text-ink">{entry.ipAddress ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-ink-subtle">User-Agent</p>
              <p className="mt-0.5 break-all font-medium text-ink">{entry.userAgent ?? '—'}</p>
            </div>
          </div>

          <JsonBlock label="Estado anterior" value={entry.previousValue} />
          <JsonBlock label="Estado novo / metadata" value={entry.newValue} />
        </div>
      )}
    </Drawer>
  );
}
