import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

@Injectable()
export class MockAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // Allow tests or callers to pass X-User-Id, X-User-Email, X-User-Role
    const userId =
      (request.headers['x-user-id'] as string) ??
      '00000000-0000-0000-0000-000000000001';
    const email =
      (request.headers['x-user-email'] as string) ?? 'user@example.com';
    const role = (request.headers['x-user-role'] as string) ?? 'member';

    request.user = {
      id: userId,
      email,
      role,
    };

    return true;
  }
}
