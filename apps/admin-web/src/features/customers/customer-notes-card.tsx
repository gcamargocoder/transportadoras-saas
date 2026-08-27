'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Card, CardHeader } from '../../components/ui/card';
import { useToast } from '../../components/ui/toast';
import { useAuth } from '../../hooks/use-auth';
import { toFriendlyMessage } from '../../lib/api/errors';
import { createCustomerNote, listCustomerNotes } from '../../lib/api/trips.api';
import { hasRole, TRIP_WRITE_ROLES } from '../../lib/auth/roles';
import { formatDateTime } from '../../utils/format';

// Fase 93 -- observacoes/interacoes comerciais (CRM). Append-only: sem
// editar/remover, e um log de interacoes (mesmo espirito de uma timeline).
export function CustomerNotesCard({ customerId }: { customerId: string }): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canWrite = hasRole(user?.role, TRIP_WRITE_ROLES);
  const [content, setContent] = useState('');

  const query = useQuery({
    queryKey: ['customers', customerId, 'notes'],
    queryFn: () => listCustomerNotes(customerId),
  });

  const mutation = useMutation({
    mutationFn: () => createCustomerNote(customerId, content.trim()),
    onSuccess: () => {
      toast.success('Observação registrada.');
      setContent('');
      queryClient.invalidateQueries({ queryKey: ['customers', customerId, 'notes'] });
      queryClient.invalidateQueries({ queryKey: ['customers', customerId, 'summary'] });
    },
    onError: (error) => toast.error('Não foi possível registrar a observação.', toFriendlyMessage(error)),
  });

  const notes = query.data ?? [];

  return (
    <Card>
      <CardHeader title="Observações e interações" description="Histórico de anotações comerciais do cliente." />

      {canWrite && (
        <div className="flex flex-col gap-2 border-b border-border px-5 py-4">
          <textarea
            className="min-h-16 w-full rounded-md border border-border px-3 py-2 text-sm"
            placeholder="Registrar uma observação ou interação com o cliente..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={content.trim().length < 2}
              loading={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              Registrar
            </Button>
          </div>
        </div>
      )}

      <ul className="divide-y divide-border">
        {!query.isLoading && notes.length === 0 && (
          <li className="px-5 py-4 text-sm text-ink-subtle">Nenhuma observação registrada ainda.</li>
        )}
        {notes.map((note) => (
          <li key={note.id} className="px-5 py-3 text-sm">
            <p className="whitespace-pre-wrap text-ink">{note.content}</p>
            <p className="mt-1 text-xs text-ink-subtle">{formatDateTime(note.createdAt)}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
