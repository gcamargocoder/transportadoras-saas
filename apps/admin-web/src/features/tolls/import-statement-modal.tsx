'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UploadCloud } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { EntitySelect } from '../../components/ui/entity-select';
import { FormField } from '../../components/ui/form-field';
import { Modal } from '../../components/ui/modal';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { listTagProviders } from '../../lib/api/fleet.api';
import { uploadTollStatement } from '../../lib/api/tolls.api';

export function ImportStatementModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [providerId, setProviderId] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      if (!file || !providerId) throw new Error('Selecione a operadora e o arquivo.');
      return uploadTollStatement(file, providerId);
    },
    onSuccess: (job) => {
      toast.success(
        'Extrato importado.',
        `${job.importedRecords} registro(s) importado(s), ${job.ignoredRecords} ignorado(s), ${job.errorRecords} com erro.`,
      );
      queryClient.invalidateQueries({ queryKey: ['toll-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['toll-import'] });
      handleClose();
    },
    onError: (error) =>
      toast.error('Não foi possível importar o extrato.', toFriendlyMessage(error)),
  });

  function handleClose() {
    setFile(null);
    setProviderId('');
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Importar extrato de pedágio"
      description="Arquivos CSV ou XLSX exportados pela operadora de tag."
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!file || !providerId}
          >
            <UploadCloud size={16} />
            Importar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Operadora" htmlFor="providerId" required>
          <EntitySelect
            id="providerId"
            queryKey={['tag-providers', 'select']}
            queryFn={() => listTagProviders({ pageSize: 100 })}
            getOptionValue={(p) => p.id}
            getOptionLabel={(p) => p.name}
            value={providerId}
            onChange={setProviderId}
          />
        </FormField>

        <FormField label="Arquivo (CSV ou XLSX)" htmlFor="file" required>
          <input
            id="file"
            type="file"
            accept=".csv,.xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-xs file:font-medium file:text-brand-700 hover:file:bg-brand-100"
          />
        </FormField>
      </div>
    </Modal>
  );
}
