import { Module } from '@nestjs/common';
import { LogsController } from './logs.controller.js';
import { LogsService } from './logs.service.js';

@Module({
  controllers: [LogsController],
  providers: [LogsService],
})
export class LogsModule {}
