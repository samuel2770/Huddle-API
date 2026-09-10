import { Injectable, Inject } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.module.js';

const PRESENCE_PREFIX = 'presence:';
const PRESENCE_TTL_SECONDS = 300; // 5 minutes — refreshed on activity

@Injectable()
export class PresenceService {
  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  /**
   * Mark a user as online. Called on socket connect.
   * Uses a Redis key with TTL so stale entries auto-expire.
   */
  async setOnline(userId: string): Promise<void> {
    try {
      await this.redis.set(
        `${PRESENCE_PREFIX}${userId}`,
        'online',
        'EX',
        PRESENCE_TTL_SECONDS,
      );
    } catch {
      // Redis unavailable — silently degrade
    }
  }

  /**
   * Mark a user as offline. Called on socket disconnect
   * (only when all sockets for that user are gone).
   */
  async setOffline(userId: string): Promise<void> {
    try {
      await this.redis.del(`${PRESENCE_PREFIX}${userId}`);
    } catch {
      // Redis unavailable — silently degrade
    }
  }

  /**
   * Refresh TTL for a user (call on activity to prevent expiry).
   */
  async refreshPresence(userId: string): Promise<void> {
    try {
      await this.redis.expire(
        `${PRESENCE_PREFIX}${userId}`,
        PRESENCE_TTL_SECONDS,
      );
    } catch {
      // Redis unavailable — silently degrade
    }
  }

  /**
   * Bulk lookup presence for a list of user IDs.
   * Returns a map of userId -> 'online' | 'offline'.
   * Used by GET /workspaces/:id/members to drive the status dots.
   */
  async getPresence(
    userIds: string[],
  ): Promise<Map<string, 'online' | 'offline'>> {
    const result = new Map<string, 'online' | 'offline'>();

    if (userIds.length === 0) return result;

    try {
      const keys = userIds.map((id) => `${PRESENCE_PREFIX}${id}`);
      const values = await this.redis.mget(...keys);

      for (let i = 0; i < userIds.length; i++) {
        result.set(userIds[i], values[i] === 'online' ? 'online' : 'offline');
      }
    } catch {
      // Redis unavailable — default everyone to offline
      for (const id of userIds) {
        result.set(id, 'offline');
      }
    }

    return result;
  }

  /**
   * Check if a single user is online.
   */
  async isOnline(userId: string): Promise<boolean> {
    try {
      const val = await this.redis.get(`${PRESENCE_PREFIX}${userId}`);
      return val === 'online';
    } catch {
      return false;
    }
  }
}
