import { TenantModule } from '@prisma/client';
import { isModuleEnabled } from './tenant-module.util';

describe('tenant-module.util', () => {
  it('retorna true quando o modulo esta na lista de habilitados', () => {
    expect(isModuleEnabled({ enabledModules: [TenantModule.TRIPS, TenantModule.TOLLS] }, TenantModule.TRIPS)).toBe(
      true,
    );
  });

  it('retorna false quando o modulo nao esta na lista', () => {
    expect(isModuleEnabled({ enabledModules: [TenantModule.TRIPS] }, TenantModule.CHECKLIST)).toBe(false);
  });

  it('retorna false (nunca lanca) quando o plano e null/undefined', () => {
    expect(isModuleEnabled(null, TenantModule.TRIPS)).toBe(false);
    expect(isModuleEnabled(undefined, TenantModule.TRIPS)).toBe(false);
  });

  it('retorna false quando a lista de modulos esta vazia', () => {
    expect(isModuleEnabled({ enabledModules: [] }, TenantModule.TRIPS)).toBe(false);
  });
});
