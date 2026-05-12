import * as Sentry from '@sentry/node';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

// Initialise Sentry before anything else so it can intercept errors from startup
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
  });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Use Winston as the NestJS logger
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  // Security
  app.use(helmet());
  app.use(cookieParser());

  // CORS — origin from env; credentials required for HttpOnly cookie auth
  app.enableCors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type'],
  });

  // Global validation — strips unknown fields, validates all DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global prefix — /metrics excluded so Prometheus scrapes it without the prefix
  app.setGlobalPrefix('api', { exclude: ['/metrics'] });

  // Graceful shutdown
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
