import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { SearchCombobox } from './search-combobox';

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const baseProps = {
  queryKey: (s: string) => ['test', s] as unknown[],
  queryFn: async () => ({ items: [] as string[] }),
  getOptionValue: (item: string) => item,
  renderOption: (item: string) => item,
  getDisplayText: (item: string) => item,
  onSelect: () => {},
  onClear: () => {},
};

describe('SearchCombobox', () => {
  it('usa bg-surface no input de busca, nunca bg-white fixo', () => {
    const { container } = renderWithClient(<SearchCombobox {...baseProps} selectedItem={null} />);
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.className).toMatch(/bg-surface\b/);
    expect(input.className).not.toMatch(/bg-white/);
  });

  it('usa bg-surface no chip de item selecionado, nunca bg-white fixo', () => {
    const { container } = renderWithClient(
      <SearchCombobox {...baseProps} selectedItem="Item selecionado" />,
    );
    const chip = container.firstChild as HTMLElement;
    expect(chip.className).toMatch(/bg-surface\b/);
    expect(chip.className).not.toMatch(/bg-white/);
  });
});
