import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({
      transports: [
        new winston.transports.Console({
          level: 'debug',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.ms(),
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, context, ms }) => {
              return `${new Date(timestamp as string).toLocaleString()} - [Nest] ${process.pid}     ${level} [${context}] ${message} ${ms}`;
            }),
          ),
        }),
        new winston.transports.DailyRotateFile({
          level: 'debug',
          filename: 'logs/application-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '14d',
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.printf(({ timestamp, level, message, context }) => {
              return `${new Date(timestamp as string).toLocaleString()} ${level.toUpperCase()} [${context}] ${message}`;
            }),
          ),
        }),
      ],
    }),
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Enable CORS
  app.enableCors();

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Cinema Ticket API')
    .setDescription(
      `
## Sistema de Venda de Ingressos para Cinema

API RESTful para gestão de sessões de cinema, reservas de assentos e vendas de ingressos.

### Funcionalidades Principais

- **Sessões**: Criar e gerenciar sessões de cinema
- **Reservas**: Reservar assentos com proteção contra race conditions
- **Pagamentos**: Confirmar pagamentos e converter reservas em vendas
- **Concorrência**: Locks distribuídos via Redis para evitar vendas duplicadas

### Fluxo de Reserva

1. Criar usuário (POST /users)
2. Criar sessão com assentos (POST /sessions)
3. Verificar disponibilidade (GET /sessions/:id/seats)
4. Reservar assento(s) (POST /reservations)
5. Confirmar pagamento em até 30 segundos (POST /reservations/:id/confirm)

### Tratamento de Concorrência

- Locks distribuídos impedem que dois usuários reservem o mesmo assento
- Reservas expiram automaticamente após 30 segundos
- Idempotência via header X-Idempotency-Key
    `,
    )
    .setVersion('1.0.0')
    .addTag('users', 'User management')
    .addTag('sessions', 'Cinema sessions management')
    .addTag('reservations', 'Seat reservations')
    .addTag('sales', 'Sales and payment confirmation')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  // Custom headers to identify instance (Load Balancer Debugging)
  const instanceId = process.env.HOSTNAME || 'localhost';

  // Global Interceptor for logging Worker ID
  app.useGlobalInterceptors(new LoggingInterceptor());
  SwaggerModule.setup('api-docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`API running on: http://localhost:${port}`);
  console.log(`Swagger docs available at: http://localhost:${port}/api-docs`);
  console.log('Kafka UI running on: http://localhost:8080 ');
}

bootstrap();
