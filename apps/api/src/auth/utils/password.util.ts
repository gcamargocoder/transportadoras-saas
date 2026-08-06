import * as argon2 from 'argon2';

// Parametros alinhados com a recomendacao minima da OWASP para Argon2id
// (m=19MB, t=2, p=1). Argon2id e o hash de senha recomendado atualmente
// (resistente tanto a ataques de GPU quanto a side-channel).
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plainPassword: string): Promise<string> {
  return argon2.hash(plainPassword, ARGON2_OPTIONS);
}

// argon2.verify faz comparacao segura (o hash guarda seus proprios
// parametros/salt) -- nao precisa de nenhuma logica extra de constant-time.
export function verifyPassword(passwordHash: string, plainPassword: string): Promise<boolean> {
  return argon2.verify(passwordHash, plainPassword);
}
