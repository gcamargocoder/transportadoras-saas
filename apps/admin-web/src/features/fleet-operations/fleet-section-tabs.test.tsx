import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';
import { FleetSectionTabs } from './fleet-section-tabs';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

describe('FleetSectionTabs', () => {
  it('renderiza uma aba para cada dashboard da frota', () => {
    vi.mocked(usePathname).mockReturnValue('/operations/fleet');
    render(<FleetSectionTabs />);

    expect(screen.getByRole('link', { name: 'Visão geral' })).toHaveAttribute('href', '/operations/fleet');
    expect(screen.getByRole('link', { name: 'Pedágios' })).toHaveAttribute('href', '/operations/fleet/tolls');
    expect(screen.getByRole('link', { name: 'Pneus' })).toHaveAttribute('href', '/operations/fleet/tires');
    expect(screen.getByRole('link', { name: 'Manutenção' })).toHaveAttribute('href', '/operations/fleet/maintenance');
    expect(screen.getByRole('link', { name: 'Abastecimento' })).toHaveAttribute('href', '/operations/fleet/fuel');
    expect(screen.getByRole('link', { name: 'Composição' })).toHaveAttribute('href', '/operations/fleet/compositions');
  });

  it('marca a aba "Visão geral" como ativa em /operations/fleet, e nenhuma outra', () => {
    vi.mocked(usePathname).mockReturnValue('/operations/fleet');
    render(<FleetSectionTabs />);

    expect(screen.getByRole('link', { name: 'Visão geral' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Pedágios' })).not.toHaveAttribute('aria-current');
  });

  it('marca a aba correspondente como ativa em uma subrota (ex: /operations/fleet/tolls)', () => {
    vi.mocked(usePathname).mockReturnValue('/operations/fleet/tolls');
    render(<FleetSectionTabs />);

    expect(screen.getByRole('link', { name: 'Pedágios' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Visão geral' })).not.toHaveAttribute('aria-current');
  });
});
