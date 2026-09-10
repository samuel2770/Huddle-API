import { Module } from '@nestjs/common';
import { UploadsService } from './uploads.service.js';
import { UploadsController } from './uploads.controller.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [UploadsController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
