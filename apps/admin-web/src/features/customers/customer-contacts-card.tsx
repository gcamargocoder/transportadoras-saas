'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardHeader } from '../../components/ui/card';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { Dropdown } from '../../components/ui/dropdown';
import { useToast } from '../../components/ui/toast';
import { useAuth } from '../../hooks/use-auth';
import { toFriendlyMessage } from '../../lib/api/errors';
import { deleteCustomerContact, listCustomerContacts } from '../../lib/api/trips.api';
import { hasRole, TRIP_WRITE_ROLES } from '../../lib/auth/roles';
import type { CustomerContactEntity } from '../../types/entities';
import { CustomerContactModal } from './customer-contact-modal';

// Fase 93 -- contatos comerciais do cliente (CRM). Lista simples (nunca mais
// que algumas dezenas por cliente): sem paginacao, mesmo espirito das outras
// listas curtas ja usadas na pagina de detalhe do cliente.
export function CustomerContactsCard({ customerId }: { customerId: string }): JSX.Element {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canWrite = hasRole(user?.role, TRIP_WRITE_ROLES);
  const [formOpen, setFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<CustomerContactEntity | null>(null);
  const [removingContact, setRemovingContact] = useState<CustomerContactEntity | null>(null);

  const query = useQuery({
    queryKey: ['customers', customerId, 'contacts'],
    queryFn: () => listCustomerContacts(customerId),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['customers', customerId, 'contacts'] });
    queryClient.invalidateQueries({ queryKey: ['customers', customerId, 'summary'] });
  }

  const removeMutation = useMutation({
    mutationFn: (contactId: string) => deleteCustomerContact(customerId, contactId),
    onSuccess: () => {
      toast.success('Contato removido.');
      invalidate();
      setRemovingContact(null);
    },
    onError: (error) => toast.error('Não foi possível remover o contato.', toFriendlyMessage(error)),
  });

  const contacts = query.data ?? [];

  return (
    <Card>
      <CardHeader
        title="Contatos"
        description="Pessoas de contato do cliente."
        action={
          canWrite && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingContact(null);
                setFormOpen(true);
              }}
            >
              <Plus size={14} />
              Novo
            </Button>
          )
        }
      />
      <ul className="divide-y divide-border">
        {!query.isLoading && contacts.length === 0 && (
          <li className="px-5 py-4 text-sm text-ink-subtle">Nenhum contato cadastrado.</li>
        )}
        {contacts.map((contact) => (
          <li key={contact.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium text-ink">{contact.name}</span>
                {contact.isPrimary && <Badge tone="brand">Principal</Badge>}
              </div>
              <div className="truncate text-xs text-ink-subtle">
                {[contact.role, contact.phone, contact.email].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
            {canWrite && (
              <Dropdown
                trigger={
                  <span className="rounded-md p-1.5 text-ink-subtle hover:bg-surface-muted hover:text-ink">
                    <MoreHorizontal size={16} />
                  </span>
                }
                items={[
                  {
                    label: 'Editar',
                    icon: <Pencil size={14} />,
                    onClick: () => {
                      setEditingContact(contact);
                      setFormOpen(true);
                    },
                  },
                  {
                    label: 'Remover',
                    icon: <Trash2 size={14} />,
                    danger: true,
                    onClick: () => setRemovingContact(contact),
                  },
                ]}
              />
            )}
          </li>
        ))}
      </ul>

      <CustomerContactModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        customerId={customerId}
        contact={editingContact}
      />
      <ConfirmDialog
        open={Boolean(removingContact)}
        onClose={() => setRemovingContact(null)}
        onConfirm={() => removingContact && removeMutation.mutate(removingContact.id)}
        title="Remover contato"
        description={`Tem certeza que deseja remover o contato "${removingContact?.name}"?`}
        confirmLabel="Remover"
        danger
        loading={removeMutation.isPending}
      />
    </Card>
  );
}
