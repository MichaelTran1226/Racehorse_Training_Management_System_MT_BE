import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const apiPrefix = configService.get<string>('API_PREFIX', '/api');
  const frontendUrl = configService.get<string>('FRONTEND_URL', 'http://localhost:5173');

  // Security Middleware
  app.use(helmet());

  // CORS Configuration
  app.enableCors({
    origin: [frontendUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  // Global Prefix
  app.setGlobalPrefix(apiPrefix.replace(/^\//, ''));

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger OpenAPI Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('EquiFlow - Racehorse Training & Stable Management API')
    .setDescription(
      'RESTful API Contract for EquiFlow Racehorse Management System supporting 5 roles: Club Manager, Head Trainer, Veterinarian, Groom, and Horse Owner.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter your JWT Bearer token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Health & System', 'System health checks, database probes and metrics')
    .addTag('Authentication', 'Login, registration, password reset and invitation APIs')
    .addTag('Horses', 'Horse identification, profile and ownership management')
    .addTag('Stalls & Facility', 'Barn layout, stalls, and groom allocation')
    .addTag('Training & Workouts', 'Phased training plans and daily workouts')
    .addTag('Veterinary & Medical', 'Medical records, 2D injuries and Medical Lock enforcement')
    .addTag('Tournaments', 'Race registrations and official results')
    .addTag('Financials', 'Owner invoicing and prize distribution')
    .addTag('AI Services', 'AI training recommendation and assistant queries')
    .addTag('Audit Logs', 'Immutable governance audit trails')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'EquiFlow API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(port);
  logger.log(`=======================================================`);
  logger.log(` EquiFlow Backend is running on: http://localhost:${port}`);
  logger.log(` API Endpoints: http://localhost:${port}/${apiPrefix.replace(/^\//, '')}`);
  logger.log(` Swagger OpenAPI Documentation: http://localhost:${port}/api/docs`);
  logger.log(
    ` Health Check Probe: http://localhost:${port}/${apiPrefix.replace(/^\//, '')}/health`,
  );
  logger.log(`=======================================================`);
}

bootstrap();
