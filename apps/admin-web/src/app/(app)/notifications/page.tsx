'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { DataTable } from '../../../components/ui/data-table';
import { DatePicker } from '../../../components/ui/date-picker';
import { ErrorState } from '../../../components/ui/error-state';
import { FilterBar } from '../../../components/ui/filter-bar';
import { FormField } from '../../../components/ui/form-field';
import { Pagination } from '../../../components/ui/pagination';
import { PageHeader } from '../../../components/ui/page-header';
import { Select } from '../../../components/ui/select';
import { useToast } from '../../../components/ui/toast';
import { resolveNotificationLink } from '../../../features/notifications/notification-links';
import { toFriendlyMessage } from '../../../lib/api/errors';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../../lib/api/notifications.api';
import { ALERT_SEVERITY_LABELS, ALERT_SEVERITY_TONE, NOTIFICATION_TYPE_LABELS } from '../../../lib/labels';
import type { NotificationEntity } from '../../../types/entities';
import type { AlertSeverity, NotificationType } from '../../../types/enums';
import { formatDateTime } from '../../../utils/format';

const PAGE_SIZE = 20;
const TYPE_OPTIONS = Object.entries(NOTIFICATION_TYPE_LABELS) as [NotificationType, string][];

export default function NotificationsPage(): JSX.Element {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [unread, setUnread] = useState<'true' | 'false' | ''>('');
  const [severity, setSeverity] = useState<AlertSeverity | ''>('');
  const [type, setType] = useState<NotificationType | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const filters = {
    unread: unread || undefined,
    severity: severity || undefined,
    type: type || undefined,
    from: from || undefined,
    to: to || undefined,
  };
  const hasActiveFilters = Boolean(unread || severity || type || from || to);

  const query = useQuery({
    queryKey: ['notifications', 'list', page, filters],
    queryFn: ({ signal }) => listNotifications({ page, pageSize: PAGE_SIZE, ...filters }, signal),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const readMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: invalidate,
    onError: (error) => toast.error('Não foi possível marcar como lida.', toFriendlyMessage(error)),
  });

  const readAllMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: (result) => {
      toast.success(`${result.count} notificação(ões) marcada(s) como lida(s).`);
      invalidate();
    },
    onError: (error) => toast.error('Não foi possível marcar todas como lidas.', toFriendlyMessage(error)),
  });

  function handleOpen(notification: NotificationEntity): void {
    if (!notification.readAt) {
      readMutation.mutate(notification.id);
    }
    const link = resolveNotificationLink(notification);
    if (link) router.push(link);
  }

  const columns = useMemo<ColumnDef<NotificationEntity, unknown>[]>(
    () => [
      {
        header: '',
        id: 'unread-dot',
        cell: ({ row }) =>
          !row.original.readAt ? <span className="block h-2 w-2 rounded-full bg-brand-600" aria-label="Não lida" /> : null,
      },
      {
        header: 'Severidade',
        cell: ({ row }) => <Badge tone={ALERT_SEVERITY_TONE[row.original.severity]}>{ALERT_SEVERITY_LABELS[row.original.severity]}</Badge>,
      },
      { header: 'Tipo', accessorFn: (row) => NOTIFICATION_TYPE_LABELS[row.type] },
      {
        header: 'Notificação',
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-medium text-ink">{row.original.title}</p>
            <p className="text-xs text-ink-subtle">{row.original.message}</p>
          </div>
        ),
      },
      { header: 'Data', cell: ({ row }) => formatDateTime(row.original.createdAt) },
      {
        header: 'Status',
        cell: ({ row }) => (row.original.readAt ? <Badge tone="neutral">Lida</Badge> : <Badge tone="info">Não lida</Badge>),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Notificações"
        description="Alertas operacionais que exigem atenção: ocorrências críticas, veículos, manutenção, fiscal, faturamento e mais."
        actions={
          <Button variant="outline" onClick={() => readAllMutation.mutate()} loading={readAllMutation.isPending}>
            <CheckCheck size={14} />
            Marcar todas como lidas
          </Button>
        }
      />

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setUnread('');
          setSeverity('');
          setType('');
          setFrom('');
          setTo('');
          setPage(1);
        }}
      >
        <FormField label="Status" htmlFor="notif-unread" className="w-full sm:w-40">
          <Select
            id="notif-unread"
            value={unread}
            onChange={(e) => {
              setUnread(e.target.value as 'true' | 'false' | '');
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            <option value="true">Não lidas</option>
            <option value="false">Lidas</option>
          </Select>
        </FormField>
        <FormField label="Severidade" htmlFor="notif-severity" className="w-full sm:w-40">
          <Select
            id="notif-severity"
            value={severity}
            onChange={(e) => {
              setSeverity(e.target.value as AlertSeverity | '');
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            <option value="CRITICAL">Críticas</option>
            <option value="HIGH">Alta</option>
            <option value="MEDIUM">Avisos</option>
            <option value="LOW">Baixa</option>
          </Select>
        </FormField>
        <FormField label="Tipo" htmlFor="notif-type" className="w-full sm:w-56">
          <Select
            id="notif-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as NotificationType | '');
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="De" htmlFor="notif-from">
          <DatePicker
            id="notif-from"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
        <FormField label="Até" htmlFor="notif-to">
          <DatePicker
            id="notif-to"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </FormField>
      </FilterBar>

      {query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <DataTable
            columns={columns}
            data={query.data?.items ?? []}
            isLoading={query.isLoading}
            isError={false}
            getRowId={(n) => n.id}
            onRowClick={handleOpen}
            emptyTitle="Nenhuma notificação para o filtro selecionado."
          />
          {query.data && <Pagination meta={query.data.meta} onPageChange={setPage} />}
        </div>
      )}
    </div>
  );
}
