import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // ─── Security ────────────────────────────────────────────────
  app.use(helmet());
  app.enableCors({
    origin: process.env.CLIENT_URL ?? '*',
    credentials: true,
  });

  // ─── Global pipes, filters, interceptors ─────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // strip unknown fields
      forbidNonWhitelisted: true,
      transform: true,           // auto-transform to DTO types
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // ─── API prefix ───────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ─── Swagger ─────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('AI Personal Planner API')
    .setDescription(
      'Backend for an AI-powered Personal Planning Assistant designed for people with ADHD and executive function difficulties.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication — register, login, refresh, logout')
    .addTag('users', 'User profile & working hours preferences')
    .addTag('tasks', 'Task management (CRUD, complete, today, overdue)')
    .addTag('calendar', 'Calendar events & weekly availability templates')
    .addTag('ai', 'AI task extraction from free text + chat assistant')
    .addTag('scheduling', 'Smart scheduling engine — suggests & confirms slots')
    .addTag('notifications', 'In-app notifications and reminders')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Application running on: http://localhost:${port}/api/v1`);
  logger.log(`Swagger docs at: http://localhost:${port}/api/docs`);
}

bootstrap();