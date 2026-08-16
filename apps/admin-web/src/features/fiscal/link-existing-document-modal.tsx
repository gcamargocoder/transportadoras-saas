'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { FormField } from '../../components/ui/form-field';
import { Modal } from '../../components/ui/modal';
import { Select } from '../../components/ui/select';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { listFiscalDocuments, updateFiscalDocument } from '../../lib/api/fiscal.api';
import { FISCAL_DOCUMENT_TYPE_LABELS } from '../../lib/labels';

// Fase 53, secao 1 -- vincula um FiscalDocument JA EXISTENTE (sem vinculo
// nenhum) a esta viagem, via PATCH /fiscal/documents/:id. Nunca cria um
// documento novo aqui (evita duplicacao) -- para isso ja existem os
// modais de upload/importacao (pre-vinculados a viagem).
export function LinkExistingDocumentModal({
  open,
  onClose,
  tripId,
}: {
  open: boolean;
  onClose: () => void;
  tripId: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [documentId, setDocumentId] = useState('');

  const unlinkedQuery = useQuery({
    queryKey: ['fiscal-documents', 'unlinked-picker'],
    queryFn: ({ signal }) => listFiscalDocuments({ unlinkedOnly: true, pageSize: 100 }, signal),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: () => {
      if (!documentId) throw new Error('Selecione um documento.');
      return updateFiscalDocument(documentId, { tripId });
    },
    onSuccess: () => {
      toast.success('Documento vinculado.', 'O documento fiscal foi vinculado a esta viagem.');
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents'] });
      handleClose();
    },
    onError: (error) => toast.error('Não foi possível vincular o documento.', toFriendlyMessage(error)),
  });

  function handleClose(): void {
    setDocumentId('');
    onClose();
  }

  const documents = unlinkedQuery.data?.items ?? [];

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Vincular documento existente"
      description="Documentos fiscais já cadastrados, ainda sem vínculo operacional."
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!documentId}>
            Vincular
          </Button>
        </>
      }
    >
      <FormField label="Documento" htmlFor="link-existing-document" required>
        <Select
          id="link-existing-document"
          value={documentId}
          onChange={(e) => setDocumentId(e.target.value)}
          disabled={unlinkedQuery.isLoading}
        >
          <option value="">{unlinkedQuery.isLoading ? 'Carregando...' : 'Selecione...'}</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>
              {FISCAL_DOCUMENT_TYPE_LABELS[d.documentType]} · {d.documentNumber ?? d.fileName ?? d.id.slice(0, 8)}
            </option>
          ))}
        </Select>
      </FormField>
      {!unlinkedQuery.isLoading && documents.length === 0 && (
        <p className="mt-3 text-xs text-ink-subtle">Nenhum documento sem vínculo disponível para vincular.</p>
      )}
    </Modal>
  );
}
