import { Global, Module, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { PresenceService } from './presence.service.js';
import { REDIS_CLIENT } from './redis.constants.js';

export { REDIS_CLIENT } from './redis.constants.js';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const host = process.env.REDIS_HOST ?? 'localhost';
        const port = parseInt(process.env.REDIS_PORT ?? '6379', 10);
        const password = process.env.REDIS_PASSWORD || undefined;
        const username = process.env.REDIS_USERNAME || undefined;

        const redis = new Redis({
          host,
          port,
          password,
          username,
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number) => {
            if (times > 3) return null; // Stop retrying
            return Math.min(times * 200, 2000);
          },
          lazyConnect: true,
        });

        // Attempt connection, but don't crash if Redis is unavailable
        redis.connect().catch((err: Error) => {
          console.warn(
            `[Redis] Could not connect to ${host}:${port} — presence tracking will be unavailable. Error: ${err.message}`,
          );
        });

        return redis;
      },
    },
    PresenceService,
  ],
  exports: [REDIS_CLIENT, PresenceService],
})
export class RedisModule implements OnModuleDestroy {
  constructor() {}

  async onModuleDestroy() {
    // Redis client cleanup is handled by the factory
  }
}
