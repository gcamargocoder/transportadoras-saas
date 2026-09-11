import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from './theme-toggle';
import { useTheme } from '../../hooks/use-theme';

vi.mock('../../hooks/use-theme', () => ({
  useTheme: vi.fn(),
}));

describe('ThemeToggle', () => {
  it('abre o menu e mostra as 3 opções de tema, marcando a atual', () => {
    vi.mocked(useTheme).mockReturnValue({ theme: 'system', resolvedTheme: 'light', setTheme: vi.fn() });
    render(<ThemeToggle />);

    fireEvent.click(screen.getByLabelText('Alternar tema'));

    expect(screen.getByText('Claro')).toBeInTheDocument();
    expect(screen.getByText('Escuro')).toBeInTheDocument();
    expect(screen.getByText('Sistema ✓')).toBeInTheDocument();
  });

  it('chama setTheme com o valor escolhido', () => {
    const setTheme = vi.fn();
    vi.mocked(useTheme).mockReturnValue({ theme: 'light', resolvedTheme: 'light', setTheme });
    render(<ThemeToggle />);

    fireEvent.click(screen.getByLabelText('Alternar tema'));
    fireEvent.click(screen.getByText('Escuro'));

    expect(setTheme).toHaveBeenCalledWith('dark');
  });

  it('usa o icone de lua quando o tema resolvido e escuro', () => {
    vi.mocked(useTheme).mockReturnValue({ theme: 'dark', resolvedTheme: 'dark', setTheme: vi.fn() });
    const { container } = render(<ThemeToggle />);
    expect(container.querySelector('svg.lucide-moon')).toBeInTheDocument();
  });
});
