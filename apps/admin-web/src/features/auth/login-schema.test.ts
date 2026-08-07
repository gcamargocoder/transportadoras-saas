import { describe, expect, it } from 'vitest';
import { loginSchema } from './login-schema';

describe('loginSchema', () => {
  it('aceita credenciais válidas', () => {
    const result = loginSchema.safeParse({
      tenantId: '123e4567-e89b-12d3-a456-426614174000',
      email: 'usuario@empresa.com.br',
      password: 'SenhaForte123!',
    });
    expect(result.success).toBe(true);
  });

  it('rejeita tenantId que não seja um UUID', () => {
    const result = loginSchema.safeParse({
      tenantId: 'not-a-uuid',
      email: 'usuario@empresa.com.br',
      password: 'SenhaForte123!',
    });
    expect(result.success).toBe(false);
  });

  it('rejeita e-mail inválido', () => {
    const result = loginSchema.safeParse({
      tenantId: '123e4567-e89b-12d3-a456-426614174000',
      email: 'nao-e-um-email',
      password: 'SenhaForte123!',
    });
    expect(result.success).toBe(false);
  });

  it('rejeita senha com menos de 8 caracteres', () => {
    const result = loginSchema.safeParse({
      tenantId: '123e4567-e89b-12d3-a456-426614174000',
      email: 'usuario@empresa.com.br',
      password: '1234567',
    });
    expect(result.success).toBe(false);
  });
});
