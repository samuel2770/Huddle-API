import { Global, Module } from '@nestjs/common';
import { MockAuthGuard } from './guards/mock-auth.guard.js';
import { ChannelMembershipGuard } from './guards/channel-membership.guard.js';
import { TransformInterceptor } from './interceptors/transform.interceptor.js';
import { HttpExceptionFilter } from './filters/http-exception.filter.js';

@Global()
@Module({
  providers: [
    MockAuthGuard,
    ChannelMembershipGuard,
    TransformInterceptor,
    HttpExceptionFilter,
  ],
  exports: [
    MockAuthGuard,
    ChannelMembershipGuard,
    TransformInterceptor,
    HttpExceptionFilter,
  ],
})
export class CommonModule {}
