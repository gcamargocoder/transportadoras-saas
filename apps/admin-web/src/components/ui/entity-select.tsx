'use client';

import { useQuery } from '@tanstack/react-query';
import { Select } from './select';

// Combo simples que carrega a primeira pagina (ate 100 registros) de um
// endpoint paginado e exibe como <select> nativo. Suficiente para o volume
// tipico de motoristas/veiculos/clientes/locais de uma transportadora nesta
// fase -- para frotas muito grandes, um combobox com busca assincrona seria
// necessario (nao implementado; ver pendencias no relatorio final).
export function EntitySelect<T>({
  queryKey,
  queryFn,
  getOptionValue,
  getOptionLabel,
  value,
  onChange,
  placeholder = 'Selecione...',
  disabled,
  id,
  invalid,
}: {
  queryKey: unknown[];
  queryFn: () => Promise<{ items: T[] }>;
  getOptionValue: (item: T) => string;
  getOptionLabel: (item: T) => string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
}): JSX.Element {
  const { data, isLoading } = useQuery({ queryKey, queryFn });

  return (
    <Select
      id={id}
      value={value}
      disabled={disabled || isLoading}
      invalid={invalid}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{isLoading ? 'Carregando...' : placeholder}</option>
      {data?.items.map((item) => (
        <option key={getOptionValue(item)} value={getOptionValue(item)}>
          {getOptionLabel(item)}
        </option>
      ))}
    </Select>
  );
}
