import 'reflect-metadata';
import { validate } from './env.validation';

function baseValidConfig(): Record<string, unknown> {
  return {
    NODE_ENV: 'development',
    PORT: '3333',
    DATABASE_URL: 'postgresql://user:password@localhost:5432/db',
    CORS_ORIGIN: 'http://localhost:3000',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    JWT_REFRESH_EXPIRES_IN: '7d',
  };
}

describe('env.validation', () => {
  it('aceita uma configuracao valida', () => {
    expect(() => validate(baseValidConfig())).not.toThrow();
  });

  it('rejeita quando DATABASE_URL esta ausente', () => {
    const config = baseValidConfig();
    delete config.DATABASE_URL;
    expect(() => validate(config)).toThrow(/Variaveis de ambiente invalidas/);
  });

  it('rejeita JWT_ACCESS_SECRET com menos de 32 caracteres', () => {
    const config = baseValidConfig();
    config.JWT_ACCESS_SECRET = 'muito-curto';
    expect(() => validate(config)).toThrow(/Variaveis de ambiente invalidas/);
  });

  it('rejeita CORS_ORIGIN igual a "*"', () => {
    const config = baseValidConfig();
    config.CORS_ORIGIN = '*';
    expect(() => validate(config)).toThrow(/CORS_ORIGIN invalido/);
  });

  it('rejeita CORS_ORIGIN contendo "*" entre outras origens', () => {
    const config = baseValidConfig();
    config.CORS_ORIGIN = 'https://app.exemplo.com,*';
    expect(() => validate(config)).toThrow(/CORS_ORIGIN invalido/);
  });
});
