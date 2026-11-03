import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter.js';
import type { EnvironmentVariables } from './config/env.schema.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());

  const config = app.get(ConfigService<EnvironmentVariables, true>);
  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
