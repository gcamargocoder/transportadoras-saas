'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UploadCloud } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { DatePicker } from '../../components/ui/date-picker';
import { EntitySelect } from '../../components/ui/entity-select';
import { FormField } from '../../components/ui/form-field';
import { Input } from '../../components/ui/input';
import { Modal } from '../../components/ui/modal';
import { Select } from '../../components/ui/select';
import { useToast } from '../../components/ui/toast';
import { toFriendlyMessage } from '../../lib/api/errors';
import { uploadFiscalDocument } from '../../lib/api/fiscal.api';
import { listVehicles } from '../../lib/api/fleet.api';
import { listDrivers } from '../../lib/api/drivers.api';
import { listCustomers } from '../../lib/api/trips.api';
import { FISCAL_DOCUMENT_TYPE_LABELS } from '../../lib/labels';
import type { FiscalDocumentType } from '../../types/enums';

const EMPTY_FORM = {
  documentType: '' as FiscalDocumentType | '',
  documentNumber: '',
  accessKey: '',
  series: '',
  issueDate: '',
  senderName: '',
  senderDocument: '',
  recipientName: '',
  recipientDocument: '',
  vehicleId: '',
  driverId: '',
  customerId: '',
};

// Upload direto (PDF/XML/JPG/JPEG/PNG) -- sem parser, metadados sempre
// informados manualmente aqui (distinto de ImportFiscalXmlModal).
export function UploadFiscalDocumentModal({
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
  const [form, setForm] = useState(EMPTY_FORM);

  const mutation = useMutation({
    mutationFn: () => {
      if (!file || !form.documentType) throw new Error('Selecione o tipo de documento e o arquivo.');
      return uploadFiscalDocument(file, {
        documentType: form.documentType,
        documentNumber: form.documentNumber || undefined,
        accessKey: form.accessKey || undefined,
        series: form.series || undefined,
        issueDate: form.issueDate || undefined,
        senderName: form.senderName || undefined,
        senderDocument: form.senderDocument || undefined,
        recipientName: form.recipientName || undefined,
        recipientDocument: form.recipientDocument || undefined,
        tripId: fixedTripId,
        vehicleId: form.vehicleId || undefined,
        driverId: form.driverId || undefined,
        customerId: form.customerId || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Documento enviado.', 'O documento fiscal foi registrado.');
      queryClient.invalidateQueries({ queryKey: ['fiscal-documents'] });
      handleClose();
    },
    onError: (error) => toast.error('Não foi possível enviar o documento.', toFriendlyMessage(error)),
  });

  function handleClose() {
    setFile(null);
    setForm(EMPTY_FORM);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Enviar documento fiscal"
      description="PDF, XML, JPG/JPEG ou PNG. Metadados informados manualmente (sem extração automática)."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!file || !form.documentType}>
            <UploadCloud size={16} />
            Enviar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Arquivo (PDF, XML, JPG/JPEG ou PNG)" htmlFor="fiscal-upload-file" required>
          <input
            id="fiscal-upload-file"
            type="file"
            accept=".pdf,.xml,.jpg,.jpeg,.png"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-xs file:font-medium file:text-brand-700 hover:file:bg-brand-100"
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Tipo de documento" htmlFor="fiscal-upload-type" required>
            <Select
              id="fiscal-upload-type"
              value={form.documentType}
              onChange={(e) => setForm({ ...form, documentType: e.target.value as FiscalDocumentType | '' })}
            >
              <option value="">Selecione...</option>
              {(Object.keys(FISCAL_DOCUMENT_TYPE_LABELS) as FiscalDocumentType[]).map((t) => (
                <option key={t} value={t}>
                  {FISCAL_DOCUMENT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Número" htmlFor="fiscal-upload-number">
            <Input id="fiscal-upload-number" value={form.documentNumber} onChange={(e) => setForm({ ...form, documentNumber: e.target.value })} />
          </FormField>
          <FormField label="Chave de acesso" htmlFor="fiscal-upload-key">
            <Input id="fiscal-upload-key" value={form.accessKey} onChange={(e) => setForm({ ...form, accessKey: e.target.value })} />
          </FormField>
          <FormField label="Série" htmlFor="fiscal-upload-series">
            <Input id="fiscal-upload-series" value={form.series} onChange={(e) => setForm({ ...form, series: e.target.value })} />
          </FormField>
          <FormField label="Data de emissão" htmlFor="fiscal-upload-issue-date">
            <DatePicker id="fiscal-upload-issue-date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Emitente (nome)" htmlFor="fiscal-upload-sender-name">
            <Input id="fiscal-upload-sender-name" value={form.senderName} onChange={(e) => setForm({ ...form, senderName: e.target.value })} />
          </FormField>
          <FormField label="Emitente (CNPJ/CPF)" htmlFor="fiscal-upload-sender-doc">
            <Input id="fiscal-upload-sender-doc" value={form.senderDocument} onChange={(e) => setForm({ ...form, senderDocument: e.target.value })} />
          </FormField>
          <FormField label="Destinatário (nome)" htmlFor="fiscal-upload-recipient-name">
            <Input
              id="fiscal-upload-recipient-name"
              value={form.recipientName}
              onChange={(e) => setForm({ ...form, recipientName: e.target.value })}
            />
          </FormField>
          <FormField label="Destinatário (CNPJ/CPF)" htmlFor="fiscal-upload-recipient-doc">
            <Input
              id="fiscal-upload-recipient-doc"
              value={form.recipientDocument}
              onChange={(e) => setForm({ ...form, recipientDocument: e.target.value })}
            />
          </FormField>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Vínculo operacional (opcional)</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Veículo" htmlFor="fiscal-upload-vehicle">
              <EntitySelect
                id="fiscal-upload-vehicle"
                queryKey={['vehicles', 'select']}
                queryFn={() => listVehicles({ pageSize: 100 })}
                getOptionValue={(v) => v.id}
                getOptionLabel={(v) => v.plate}
                value={form.vehicleId}
                onChange={(v) => setForm({ ...form, vehicleId: v })}
                placeholder="Nenhum"
              />
            </FormField>
            <FormField label="Motorista" htmlFor="fiscal-upload-driver">
              <EntitySelect
                id="fiscal-upload-driver"
                queryKey={['drivers', 'select']}
                queryFn={() => listDrivers({ pageSize: 100 })}
                getOptionValue={(d) => d.id}
                getOptionLabel={(d) => d.name}
                value={form.driverId}
                onChange={(v) => setForm({ ...form, driverId: v })}
                placeholder="Nenhum"
              />
            </FormField>
            <FormField label="Cliente" htmlFor="fiscal-upload-customer">
              <EntitySelect
                id="fiscal-upload-customer"
                queryKey={['customers', 'select']}
                queryFn={() => listCustomers({ pageSize: 100 })}
                getOptionValue={(c) => c.id}
                getOptionLabel={(c) => c.name}
                value={form.customerId}
                onChange={(v) => setForm({ ...form, customerId: v })}
                placeholder="Nenhum"
              />
            </FormField>
          </div>
        </div>
      </div>
    </Modal>
  );
}
