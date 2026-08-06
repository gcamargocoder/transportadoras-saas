import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

const DURATION_PATTERN = /^\d+(s|m|h|d)$/i;

// Contrato das variaveis de ambiente exigidas pela API. Validado uma unica vez
// no bootstrap (via ConfigModule.forRoot({ validate })) -- a aplicacao falha
// rapido (fail fast) se alguma variavel obrigatoria estiver ausente/invalida.
class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  // @Type explicito: nao depende da metadata implicita de design:type do
  // TypeScript (emitDecoratorMetadata), que se mostrou inconsistente entre
  // o build real (tsc/nest build) e a transpilacao do ts-jest em testes.
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(65535)
  PORT = 3333;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  CORS_ORIGIN = 'http://localhost:3000';

  // Minimo de 32 caracteres para ter entropia razoavel para HMAC-SHA256.
  // Access e refresh usam segredos DIFERENTES de proposito: um refresh token
  // nunca deve poder ser aceito onde um access token e esperado (e vice-versa).
  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET deve ter no minimo 32 caracteres.' })
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @Matches(DURATION_PATTERN, {
    message: 'JWT_ACCESS_EXPIRES_IN deve seguir o formato "15m", "1h", "7d".',
  })
  JWT_ACCESS_EXPIRES_IN = '15m';

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET deve ter no minimo 32 caracteres.' })
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @Matches(DURATION_PATTERN, {
    message: 'JWT_REFRESH_EXPIRES_IN deve seguir o formato "15m", "1h", "7d".',
  })
  JWT_REFRESH_EXPIRES_IN = '7d';
}

export function validate(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(
      `Variaveis de ambiente invalidas:\n${errors
        .map((error) => Object.values(error.constraints ?? {}).join(', '))
        .join('\n')}`,
    );
  }

  // CORS_ORIGIN e uma lista separada por virgula de origens explicitas --
  // "*" (qualquer origem) nunca e aceitavel, em nenhum ambiente, quando
  // combinado com credentials:true (app.enableCors em main.ts), sob risco
  // de permitir qualquer site ler respostas autenticadas via credenciais.
  const corsOrigins = validatedConfig.CORS_ORIGIN.split(',').map((origin) => origin.trim());
  if (corsOrigins.includes('*')) {
    throw new Error(
      'CORS_ORIGIN invalido: "*" nao e permitido. Informe uma lista explicita de origens (ex: "https://app.exemplo.com,https://admin.exemplo.com").',
    );
  }

  return validatedConfig;
}
