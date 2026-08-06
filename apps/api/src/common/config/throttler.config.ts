import { ConfigService } from '@nestjs/config';
import { ThrottlerModuleOptions } from '@nestjs/throttler';
import { AppConfig } from '../../config/configuration';

// Limite global (aplicado a toda rota via APP_GUARD) -- rotas sensiveis
// sobrescrevem apenas o throttler 'default' com @Throttle(...) (ver
// common/constants/throttle.constants.ts), nunca adicionam um throttler novo.
const GLOBAL_TTL_MS = 60_000;
const GLOBAL_LIMIT = 100;

// Jest define NODE_ENV=test automaticamente quando a variavel nao esta
// setada no shell (comportamento nativo do jest-cli, anterior a qualquer
// bootstrap do Nest) e dotenv nunca sobrescreve uma env ja definida --
// logo, durante `test`/`test:e2e`, env sempre resolve para 'test' aqui,
// independente do valor de NODE_ENV no .env. Pular o throttling apenas em
// teste automatizado evita 429 espurio no volume de requisicoes de um
// e2e-spec (dezenas de logins/mutacoes em segundos) sem afetar dev/producao.
export function buildThrottlerOptions(
  configService: ConfigService<AppConfig, true>,
): ThrottlerModuleOptions {
  return {
    throttlers: [{ name: 'default', ttl: GLOBAL_TTL_MS, limit: GLOBAL_LIMIT }],
    skipIf: () => configService.get('env', { infer: true }) === 'test',
  };
}
