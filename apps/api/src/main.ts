import 'reflect-metadata';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { buildHelmetOptions } from './common/config/security-headers.config';
import { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  // Swagger UI/JSON documentam publicamente a superficie da API (rotas,
  // DTOs, exemplos) -- exposicao aceitavel em dev/test, mas informacao
  // interna desnecessaria para quem consome a API em producao.
  const isSwaggerEnabled = !isProduction;

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    logger: isProduction ? ['log', 'warn', 'error'] : ['log', 'debug', 'verbose', 'warn', 'error'],
  });

  const configService = app.get(ConfigService<AppConfig, true>);

  app.use(helmet(buildHelmetOptions(isProduction, isSwaggerEnabled)));

  // Prefixo + versionamento: toda rota de negocio fica em /api/v1/...
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableCors({
    origin: configService.get('cors.origin', { infer: true }),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  if (isSwaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Transportadoras SaaS — API')
      .setDescription(
        'API do sistema de monitoramento de frota e auditoria de pedagios para transportadoras.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, swaggerDocument);
  }

  const port = configService.get('port', { infer: true });
  await app.listen(port);
}

void bootstrap();
