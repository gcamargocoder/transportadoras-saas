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
  tollImport: {
    // Diretorio privado (fora de qualquer path servido estaticamente) onde
    // os arquivos de extrato ficam armazenados -- nunca acessivel por URL
    // publica (ver docs/SECURITY_AND_DEVELOPMENT_STANDARDS.md, secao 10).
    storageDir: string;
    maxFileSizeMb: number;
  };
  // Fase 39 -- evidencia de checklist (foto/assinatura). Mesmo padrao de
  // tollImport (disco privado, nunca servido estaticamente) -- storage
  // separado por dominio, nunca compartilhado com tollImport.
  checklistEvidence: {
    storageDir: string;
    maxFileSizeMb: number;
  };
  // Fase 52 -- documentos fiscais/documentais (upload direto + importacao de
  // XML). Mesmo padrao de tollImport/checklistEvidence (disco privado,
  // storage separado por dominio).
  fiscalDocuments: {
    storageDir: string;
    maxFileSizeMb: number;
  };
  routing: {
    // Nunca logar/expor esta chave (nem para o frontend, nem em erro) -- ver
    // GoogleRoutingProvider. Ausente = feature desabilitada (ver
    // NotConfiguredRoutingProvider), nunca um erro de boot: rotas de
    // pedagio/rota geografica sao um adicional sobre o TMS, nao um
    // requisito para o resto do sistema funcionar.
    googleRoutesApiKey: string | undefined;
    // Raio (metros) de tolerancia para casar uma praca descoberta na rota
    // com uma TollPlaza do catalogo (Fase 26) -- parametro tecnico/geometrico
    // (nao uma politica de negocio por tenant), por isso fica aqui e nao em
    // TenantSettings.
    tollMatchRadiusMeters: number;
    requestTimeoutMs: number;
  };
  tollDataSync: {
    // Fase 33 -- desligado por padrao em dev/test (nunca queremos um teste
    // rodando `npx jest` disparar uma chamada de rede real para a ANTT sem
    // querer). Cada execucao (manual ou agendada) e idempotente por si so
    // (ver TollDataSyncService), entao habilitar nao arrisca duplicar dados.
    enabled: boolean;
    // Expressao cron padrao: uma vez por dia, 03:00 (fuso do processo) --
    // nunca polling agressivo da fonte oficial (secao 10 da fase).
    cronExpression: string;
  };
  // Fase 70 -- processamento periodico do Centro de Notificacoes (tira a
  // geracao do caminho sincrono de GET /notifications/unread-count). Ligado
  // por padrao (diferente de tollDataSync): nunca faz chamada de rede
  // externa, so leitura/escrita interna idempotente (createMany
  // skipDuplicates) -- mesmo criterio de seguranca de
  // TenantLifecycleScheduler/BillingLifecycleScheduler (sempre ligados,
  // @Cron estatico), so que configuravel por precisar de um intervalo
  // (nao uma vez ao dia).
  notificationsProcessing: {
    enabled: boolean;
    cronExpression: string;
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
  tollImport: {
    storageDir: process.env.TOLL_IMPORT_STORAGE_DIR ?? './storage/toll-imports',
    maxFileSizeMb: parseInt(process.env.TOLL_IMPORT_MAX_FILE_SIZE_MB ?? '10', 10),
  },
  checklistEvidence: {
    storageDir: process.env.CHECKLIST_EVIDENCE_STORAGE_DIR ?? './storage/checklist-evidence',
    maxFileSizeMb: parseInt(process.env.CHECKLIST_EVIDENCE_MAX_FILE_SIZE_MB ?? '8', 10),
  },
  fiscalDocuments: {
    storageDir: process.env.FISCAL_DOCUMENTS_STORAGE_DIR ?? './storage/fiscal-documents',
    maxFileSizeMb: parseInt(process.env.FISCAL_DOCUMENTS_MAX_FILE_SIZE_MB ?? '15', 10),
  },
  routing: {
    googleRoutesApiKey: process.env.GOOGLE_ROUTES_API_KEY || undefined,
    tollMatchRadiusMeters: parseInt(process.env.ROUTING_TOLL_MATCH_RADIUS_METERS ?? '300', 10),
    requestTimeoutMs: parseInt(process.env.ROUTING_REQUEST_TIMEOUT_MS ?? '8000', 10),
  },
  tollDataSync: {
    enabled: (process.env.TOLL_DATA_SYNC_ENABLED ?? 'false').toLowerCase() === 'true',
    cronExpression: process.env.TOLL_DATA_SYNC_CRON ?? '0 3 * * *',
  },
  notificationsProcessing: {
    enabled: (process.env.NOTIFICATIONS_PROCESS_ENABLED ?? 'true').toLowerCase() === 'true',
    // A cada 5 minutos por padrao (secao 13 do pedido) -- nunca polling
    // agressivo, e sempre ajustavel por env var sem precisar de deploy de
    // codigo.
    cronExpression: process.env.NOTIFICATIONS_PROCESS_CRON ?? '*/5 * * * *',
  },
});
