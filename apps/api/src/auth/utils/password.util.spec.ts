import { hashPassword, verifyPassword } from './password.util';

describe('password.util', () => {
  it('nunca retorna a senha em texto puro no hash', async () => {
    const hash = await hashPassword('SenhaForte123!');
    expect(hash).not.toContain('SenhaForte123!');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verifyPassword aceita a senha correta', async () => {
    const hash = await hashPassword('SenhaForte123!');
    await expect(verifyPassword(hash, 'SenhaForte123!')).resolves.toBe(true);
  });

  it('verifyPassword rejeita senha incorreta', async () => {
    const hash = await hashPassword('SenhaForte123!');
    await expect(verifyPassword(hash, 'outra-senha')).resolves.toBe(false);
  });

  it('dois hashes da mesma senha sao diferentes (salt aleatorio)', async () => {
    const [hashA, hashB] = await Promise.all([
      hashPassword('SenhaForte123!'),
      hashPassword('SenhaForte123!'),
    ]);
    expect(hashA).not.toBe(hashB);
  });
});
