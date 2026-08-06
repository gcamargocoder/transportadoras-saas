import { slugify } from './slugify.util';

describe('slugify.util', () => {
  it('remove acentos e converte para minusculo', () => {
    expect(slugify('Transportadora São João & Cia. Ltda.')).toBe(
      'transportadora-sao-joao-cia-ltda',
    );
  });

  it('colapsa espacos/simbolos repetidos num unico hifen', () => {
    expect(slugify('Empresa   ---   Exemplo')).toBe('empresa-exemplo');
  });

  it('remove hifens nas pontas', () => {
    expect(slugify('  -Exemplo-  ')).toBe('exemplo');
  });
});
