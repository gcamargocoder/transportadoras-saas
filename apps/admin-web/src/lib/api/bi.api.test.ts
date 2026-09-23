import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
vi.mock('./http', () => ({ api: { get: (...args: unknown[]) => get(...args) } }));

import { getKpiCatalog, getKpiEvidence, getKpiSummary } from './bi.api';

describe('bi.api', () => {
  beforeEach(() => get.mockReset());

  it('catalogo e resumo usam as rotas da camada oficial de KPIs', () => {
    getKpiCatalog();
    getKpiSummary({ startDate: '2026-01-01', endDate: '2026-01-31', comparison: 'PREVIOUS_YEAR', kpis: 'revenue' });
    expect(get).toHaveBeenNthCalledWith(1, '/bi/kpis', {}, undefined);
    expect(get).toHaveBeenNthCalledWith(
      2,
      '/bi/kpis/summary',
      { startDate: '2026-01-01', endDate: '2026-01-31', comparison: 'PREVIOUS_YEAR', kpis: 'revenue' },
      undefined,
    );
  });

  it('evidencias escapam o id do KPI no path', () => {
    getKpiEvidence('cost/per km', { startDate: '2026-01-01', endDate: '2026-01-31', source: 'FUEL_SUPPLY' });
    expect(get).toHaveBeenCalledWith(
      '/bi/kpis/cost%2Fper%20km/evidence',
      { startDate: '2026-01-01', endDate: '2026-01-31', source: 'FUEL_SUPPLY' },
      undefined,
    );
  });
});
