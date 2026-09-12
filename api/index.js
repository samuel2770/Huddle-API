import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from '../dist/app.module.js';
import express from 'express';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from '../dist/common/filters/http-exception.filter.js';
import { TransformInterceptor } from '../dist/common/interceptors/transform.interceptor.js';

const server = express();
let isInitialized = false;

async function bootstrapServer() {
  if (!isInitialized) {
    const app = await NestFactory.create(AppModule, new ExpressAdapter(server));
    app.enableCors({ origin: true, credentials: true });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      })
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    isInitialized = true;
  }
  return server;
}

export default async function handler(req, res) {
  await bootstrapServer();
  server(req, res);
}
