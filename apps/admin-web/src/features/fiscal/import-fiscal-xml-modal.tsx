'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileUp } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { EntitySelect } from '../../components/ui/entity-select';
import { FormField } from '../../components/ui/form-field';
import { Modal } from '../../components/ui/modal';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { listDrivers } from '../../lib/api/drivers.api';
import { importFiscalXml } from '../../lib/api/fiscal.api';
import { listVehicles } from '../../lib/api/fleet.api';
import { listCustomers } from '../../lib/api/trips.api';

// Importa XML fiscal (NF-e/CT-e/MDF-e) -- metadados extraidos pelo parser do
// backend (parseFiscalXml), nunca informados aqui. Reimportar o mesmo XML
// (mesma chave de acesso) e idempotente -- o backend retorna o documento ja
// existente em vez de duplicar.
export function ImportFiscalXmlModal({
  open,
  onClose,
  tripId: fixedTripId,
}: {
  open: boolean;
  onClose: () => void;
  /** Quando informado (ex: aberto a partir do detalhe da viagem), o documento e sempre vinculado a esta viagem. */
  tripId?: string;
}): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [customerId, setCustomerId] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Selecione o arquivo XML.');
      return importFiscalXml(file, {
        tripId: fixedTripId,
        vehicleId: vehicleId || undefined,
        driverId: driverId || undefined,
        customerId: customerId || undefined,
      });
    },
    onSuccess: (document) => {
      toast.success('XML importado.', `${document.documentType} nº ${document.documentNumber ?? '—'} reconhecido.`);
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents'] });
      handleClose();
    },
    onError: (error) => toast.error('Não foi possível importar o XML.', toFriendlyMessage(error)),
  });

  function handleClose() {
    setFile(null);
    setVehicleId('');
    setDriverId('');
    setCustomerId('');
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Importar XML fiscal"
      description="NF-e, CT-e ou MDF-e. Extrai chave, número, série, data, emitente e destinatário automaticamente -- nunca valida perante a SEFAZ."
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!file}>
            <FileUp size={16} />
            Importar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Arquivo XML" htmlFor="fiscal-import-file" required>
          <input
            id="fiscal-import-file"
            type="file"
            accept=".xml"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-xs file:font-medium file:text-brand-700 hover:file:bg-brand-100"
          />
        </FormField>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Vínculo operacional (opcional)</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Veículo" htmlFor="fiscal-import-vehicle">
              <EntitySelect
                id="fiscal-import-vehicle"
                queryKey={['vehicles', 'select']}
                queryFn={() => listVehicles({ pageSize: 100 })}
                getOptionValue={(v) => v.id}
                getOptionLabel={(v) => v.plate}
                value={vehicleId}
                onChange={setVehicleId}
                placeholder="Nenhum"
              />
            </FormField>
            <FormField label="Motorista" htmlFor="fiscal-import-driver">
              <EntitySelect
                id="fiscal-import-driver"
                queryKey={['drivers', 'select']}
                queryFn={() => listDrivers({ pageSize: 100 })}
                getOptionValue={(d) => d.id}
                getOptionLabel={(d) => d.name}
                value={driverId}
                onChange={setDriverId}
                placeholder="Nenhum"
              />
            </FormField>
            <FormField label="Cliente" htmlFor="fiscal-import-customer">
              <EntitySelect
                id="fiscal-import-customer"
                queryKey={['customers', 'select']}
                queryFn={() => listCustomers({ pageSize: 100 })}
                getOptionValue={(c) => c.id}
                getOptionLabel={(c) => c.name}
                value={customerId}
                onChange={setCustomerId}
                placeholder="Nenhum"
              />
            </FormField>
          </div>
        </div>
      </div>
    </Modal>
  );
}
