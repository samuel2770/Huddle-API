// Pre-load .env file into process.env before evaluating any application modules
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch { }
}

import helmet from 'helmet';
import compression from 'compression';
import { join, resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(compression());

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.socket.io"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:", "*"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Serve static frontend assets
  app.useStaticAssets(join(process.cwd(), 'frontend'), {
    extensions: ['html'],
  });
  app.useStaticAssets(join(process.cwd(), 'frontend'), {
    prefix: '/frontend/',
    extensions: ['html'],
  });

  // Redirect root URL to signup/splash (splash is embedded in index.html)
  app.use('/', (req: any, res: any, next: any) => {
    if (req.path === '/' && req.method === 'GET') {
      return res.redirect('/index.html');
    }
    next();
  });

  // Serve uploaded images & files
  const rawUploadDir = process.env.LOCAL_UPLOAD_DIR || join(process.cwd(), 'uploads');
  const uploadDir = resolve(rawUploadDir);
  if (!existsSync(uploadDir)) {
    mkdirSync(uploadDir, { recursive: true });
  }
  app.useStaticAssets(uploadDir, {
    prefix: '/uploads/',
  });

  const frontendUrl = process.env.FRONTEND_URL;
  app.enableCors({
    origin:
      process.env.NODE_ENV === 'production' && frontendUrl
        ? [frontendUrl]
        : true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Huddle API')
    .setDescription('Huddle backend API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Huddle backend application listening on port ${port} (0.0.0.0)`);
}
await bootstrap();
