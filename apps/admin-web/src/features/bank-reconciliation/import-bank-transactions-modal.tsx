'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UploadCloud } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { EntitySelect } from '../../components/ui/entity-select';
import { FormField } from '../../components/ui/form-field';
import { Modal } from '../../components/ui/modal';
import { useToast } from '../../components/ui/toast';
import { importBankTransactionsCsv } from '../../lib/api/bank-reconciliation.api';
import { toFriendlyMessage } from '../../lib/api/errors';
import { listFinancialAccounts } from '../../lib/api/finance-accounts.api';
import type { ImportBankTransactionsResultEntity } from '../../types/entities';

// Fase 80, secao 13 -- fluxo: selecionar conta -> selecionar arquivo ->
// importar (sincrono) -> resumo. Sem etapa de "validar" separada porque a
// API processa e retorna o resumo na mesma chamada -- nao ha upload
// permanente nem job/fila.
export function ImportBankTransactionsModal({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [financialAccountId, setFinancialAccountId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportBankTransactionsResultEntity | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      if (!file || !financialAccountId) throw new Error('Selecione a conta e o arquivo.');
      return importBankTransactionsCsv(financialAccountId, file);
    },
    onSuccess: (data) => {
      setResult(data);
      toast.success('Importação concluída.', `${data.imported} de ${data.rowsRead} linha(s) importada(s).`);
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
    },
    onError: (error) => toast.error('Não foi possível importar o extrato.', toFriendlyMessage(error)),
  });

  function handleClose() {
    setFile(null);
    setFinancialAccountId('');
    setResult(null);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Importar extrato bancário (CSV)"
      description="Colunas esperadas: date, description, amount, type (CREDIT/DEBIT), externalId (opcional). Nunca cria movimentação no ledger -- só armazena o extrato para conciliação manual."
      footer={
        result ? (
          <Button onClick={handleClose}>Fechar</Button>
        ) : (
          <>
            <Button variant="outline" onClick={handleClose} disabled={mutation.isPending}>
              Cancelar
            </Button>
            <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!file || !financialAccountId}>
              <UploadCloud size={16} />
              Importar
            </Button>
          </>
        )
      }
    >
      {!result ? (
        <div className="flex flex-col gap-4">
          <FormField label="Conta financeira" htmlFor="bank-import-account" required>
            <EntitySelect
              id="bank-import-account"
              queryKey={['finance-accounts', 'list', 'active-for-select']}
              queryFn={() => listFinancialAccounts({ isActive: true, pageSize: 100 })}
              getOptionValue={(a) => a.id}
              getOptionLabel={(a) => a.name}
              value={financialAccountId}
              onChange={setFinancialAccountId}
            />
          </FormField>
          <FormField label="Arquivo CSV" htmlFor="bank-import-file" required>
            <input
              id="bank-import-file"
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-xs file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
          </FormField>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-xs text-ink-subtle">Linhas lidas</p>
              <p className="mt-0.5 text-lg font-semibold text-ink">{result.rowsRead}</p>
            </div>
            <div>
              <p className="text-xs text-ink-subtle">Importadas</p>
              <p className="mt-0.5 text-lg font-semibold text-success-600">{result.imported}</p>
            </div>
            <div>
              <p className="text-xs text-ink-subtle">Duplicadas</p>
              <p className="mt-0.5 text-lg font-semibold text-ink-muted">{result.duplicates}</p>
            </div>
            <div>
              <p className="text-xs text-ink-subtle">Inválidas</p>
              <p className="mt-0.5 text-lg font-semibold text-danger-600">{result.invalid}</p>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div className="border-t border-border pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">Linhas inválidas</p>
              <ul className="scrollbar-thin flex max-h-48 flex-col gap-1.5 overflow-y-auto">
                {result.errors.map((e) => (
                  <li key={e.row} className="flex items-start gap-2 text-xs">
                    <Badge tone="danger">Linha {e.row}</Badge>
                    <span className="text-ink-muted">{e.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
