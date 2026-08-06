export interface AppConfig {
  env: string;
  port: number;
  cors: {
    origin: string[];
  };
  database: {
    url: string;
  };
  jwt: {
    // Segredo unico ativo por token. Preparado para rotacao futura: quando
    // for necessario suportar rotacao sem derrubar sessoes, este ponto passa
    // a ler uma lista (ex: JWT_ACCESS_SECRET_PREVIOUS) e validar contra
    // varios segredos antes de rejeitar o token.
    accessSecret: string;
    accessExpiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
}

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3333', 10),
  cors: {
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  },
  database: {
    url: process.env.DATABASE_URL ?? '',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
});
