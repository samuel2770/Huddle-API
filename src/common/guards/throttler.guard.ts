import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected override async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const { context, limit, ttl, throttler, blockDuration } = requestProps;
    const { req } = this.getRequestResponse(context);

    // Track by IP address
    const ipTracker = req.ips?.length
      ? req.ips[0]
      : (req.ip ?? req.socket?.remoteAddress ?? '127.0.0.1');
    const throttlerName = throttler.name ?? 'default';
    const ipKey = this.generateKey(context, ipTracker, throttlerName);
    const ipRecord = await this.storageService.increment(
      ipKey,
      ttl,
      limit,
      blockDuration,
      throttlerName,
    );

    if (ipRecord.totalHits > limit) {
      await this.throwThrottlingException(context, {
        limit,
        ttl,
        key: ipKey,
        tracker: ipTracker,
        totalHits: ipRecord.totalHits,
        timeToExpire: ipRecord.timeToExpire,
        isBlocked: ipRecord.isBlocked,
        timeToBlockExpire: ipRecord.timeToBlockExpire,
      });
    }

    // Rate-limit by email if email is in the request body
    const rawEmail = req.body?.email;
    if (
      rawEmail &&
      typeof rawEmail === 'string' &&
      rawEmail.trim().length > 0
    ) {
      const emailTracker = `email:${rawEmail.trim().toLowerCase()}`;
      const emailKey = this.generateKey(
        context,
        emailTracker,
        throttlerName,
      );
      const emailRecord = await this.storageService.increment(
        emailKey,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );

      if (emailRecord.totalHits > limit) {
        await this.throwThrottlingException(context, {
          limit,
          ttl,
          key: emailKey,
          tracker: emailTracker,
          totalHits: emailRecord.totalHits,
          timeToExpire: emailRecord.timeToExpire,
          isBlocked: emailRecord.isBlocked,
          timeToBlockExpire: emailRecord.timeToBlockExpire,
        });
      }
    }

    return true;
  }
}
