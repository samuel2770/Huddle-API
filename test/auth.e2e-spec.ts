import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  Controller,
  Get,
  UseGuards,
  Req,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { Request } from 'express';
import { AuthController } from '../src/auth/auth.controller.js';
import { AuthService } from '../src/auth/auth.service.js';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy.js';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { UsersController } from '../src/users/users.controller.js';
import { UsersService } from '../src/users/users.service.js';
import { User, UserStatus } from '../src/users/entities/user.entity.js';
import { RefreshToken } from '../src/auth/entities/refresh-token.entity.js';
import { PasswordResetToken } from '../src/auth/entities/password-reset-token.entity.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor.js';
import { CustomThrottlerGuard } from '../src/common/guards/throttler.guard.js';

// Throwaway controller to explicitly verify JwtAuthGuard and req.user shape
@Controller('test-guard')
class TestGuardController {
  @Get()
  @UseGuards(JwtAuthGuard)
  testGuard(@Req() req: Request) {
    return req.user;
  }
}

describe('Auth & Users Endpoints (e2e)', () => {
  let app: INestApplication;
  const usersDb: User[] = [];
  const refreshTokensDb: RefreshToken[] = [];
  const resetTokensDb: PasswordResetToken[] = [];

  const mockUserRepository = {
    create: (data: Partial<User>) => ({
      id: crypto.randomUUID(),
      created_at: new Date(),
      updated_at: new Date(),
      avatar_url: null,
      is_email_verified: false,
      status: UserStatus.OFFLINE,
      channelMemberships: [],
      messages: [],
      ...data,
    }),
    save: async (user: User) => {
      const idx = usersDb.findIndex((u) => u.id === user.id);
      if (idx >= 0) {
        usersDb[idx] = { ...usersDb[idx], ...user };
        return usersDb[idx];
      }
      usersDb.push(user);
      return user;
    },
    findOne: async (options: { where: { id?: string; email?: string } }) => {
      if (options?.where?.id) {
        return usersDb.find((u) => u.id === options.where.id) ?? null;
      }
      if (options?.where?.email) {
        return (
          usersDb.find(
            (u) => u.email.toLowerCase() === options.where.email?.toLowerCase(),
          ) ?? null
        );
      }
      return null;
    },
    update: async (id: string, partial: Partial<User>) => {
      const user = usersDb.find((u) => u.id === id);
      if (user) {
        Object.assign(user, partial);
      }
      return { affected: user ? 1 : 0 };
    },
    createQueryBuilder: () => ({
      where: function (_query: string, params: { email: string }) {
        this.email = params.email;
        return this;
      },
      getOne: async function () {
        return (
          usersDb.find(
            (u) => u.email.toLowerCase() === this.email.toLowerCase(),
          ) ?? null
        );
      },
    }),
  };

  const mockRefreshTokenRepository = {
    create: (data: Partial<RefreshToken>) => ({
      id: crypto.randomUUID(),
      created_at: new Date(),
      updated_at: new Date(),
      is_revoked: false,
      ...data,
    }),
    save: async (token: RefreshToken) => {
      const idx = refreshTokensDb.findIndex((t) => t.id === token.id);
      if (idx >= 0) {
        refreshTokensDb[idx] = { ...refreshTokensDb[idx], ...token };
        return refreshTokensDb[idx];
      }
      refreshTokensDb.push(token);
      return token;
    },
    findOne: async (options: {
      where: { id?: string; is_revoked?: boolean };
    }) => {
      return (
        refreshTokensDb.find(
          (t) =>
            t.id === options?.where?.id &&
            (options?.where?.is_revoked === undefined ||
              t.is_revoked === options.where.is_revoked),
        ) ?? null
      );
    },
    update: async (criteria: any, partial: Partial<RefreshToken>) => {
      let count = 0;
      for (const t of refreshTokensDb) {
        if (criteria?.user_id && t.user_id === criteria.user_id) {
          Object.assign(t, partial);
          count++;
        }
      }
      return { affected: count };
    },
  };

  const mockPasswordResetTokenRepository = {
    create: (data: Partial<PasswordResetToken>) => ({
      id: crypto.randomUUID(),
      created_at: new Date(),
      is_used: false,
      ...data,
    }),
    save: async (token: PasswordResetToken) => {
      resetTokensDb.push(token);
      return token;
    },
    findOne: async (options: { where: { id?: string; is_used?: boolean } }) => {
      return (
        resetTokensDb.find(
          (t) =>
            t.id === options?.where?.id &&
            (options?.where?.is_used === undefined ||
              t.is_used === options.where.is_used),
        ) ?? null
      );
    },
    update: async (id: string, partial: Partial<PasswordResetToken>) => {
      const token = resetTokensDb.find((t) => t.id === id);
      if (token) {
        Object.assign(token, partial);
      }
      return { affected: token ? 1 : 0 };
    },
  };

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = 'test-e2e-jwt-secret-key-12345';
    process.env.JWT_ACCESS_TTL = '15m';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({
          secret: process.env.JWT_ACCESS_SECRET,
          signOptions: { expiresIn: '15m' },
        }),
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 50 }]),
      ],
      controllers: [AuthController, UsersController, TestGuardController],
      providers: [
        AuthService,
        UsersService,
        JwtStrategy,
        JwtAuthGuard,
        CustomThrottlerGuard,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: mockRefreshTokenRepository,
        },
        {
          provide: getRepositoryToken(PasswordResetToken),
          useValue: mockPasswordResetTokenRepository,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/auth/signup & /auth/signup', () => {
    it('should successfully register a user (returns 201 with success envelope, no password_hash)', async () => {
      const res = await request(app.getHttpServer()).post('/auth/signup').send({
        fullName: 'Alice Johnson',
        email: 'alice.johnson@example.com',
        password: 'SecurePassword123!',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.fullName).toBe('Alice Johnson');
      expect(res.body.data.email).toBe('alice.johnson@example.com');
      expect(res.body.data.status).toBe('offline');
      expect(res.body.data.password_hash).toBeUndefined();
      expect(res.body.data.passwordHash).toBeUndefined();
    });

    it('should reject duplicate email (case-insensitive) with 409 Conflict', async () => {
      const res = await request(app.getHttpServer()).post('/auth/signup').send({
        fullName: 'Alice Clone',
        email: 'ALICE.JOHNSON@EXAMPLE.COM',
        password: 'SecurePassword123!',
      });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.statusCode).toBe(409);
      expect(res.body.error).toBe('Conflict');
      expect(res.body.message).toBe('EMAIL_TAKEN');
      expect(res.body.path).toBe('/auth/signup');
      expect(res.body.timestamp).toBeDefined();
    });

    it('should reject weak password with 400 Bad Request and field-level validation detail', async () => {
      const res = await request(app.getHttpServer()).post('/auth/signup').send({
        fullName: 'Bob Smith',
        email: 'bob@example.com',
        password: 'weak',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.statusCode).toBe(400);
      expect(res.body.error).toBe('Bad Request');
      expect(Array.isArray(res.body.message)).toBe(true);
      expect(
        res.body.message.some((msg: string) =>
          msg.includes('Password must be at least 8 characters long'),
        ),
      ).toBe(true);
    });
  });

  describe('POST /api/v1/auth/login & /auth/login', () => {
    it('should return byte-for-byte identical error response bodies for unknown email and wrong password at 401', async () => {
      // 1. Unknown email
      const resUnknown = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'unknown-nonexistent@example.com',
          password: 'WrongPassword123!',
        });

      // 2. Existing email but wrong password
      const resWrongPassword = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'alice.johnson@example.com',
          password: 'WrongPassword123!',
        });

      expect(resUnknown.status).toBe(401);
      expect(resWrongPassword.status).toBe(401);

      // Verify identical envelope shape and messages
      expect(resUnknown.body.success).toBe(false);
      expect(resWrongPassword.body.success).toBe(false);
      expect(resUnknown.body.statusCode).toBe(401);
      expect(resWrongPassword.body.statusCode).toBe(401);
      expect(resUnknown.body.message).toBe(
        'Invalid email or password, please try again',
      );
      expect(resWrongPassword.body.message).toBe(
        'Invalid email or password, please try again',
      );
      expect(resUnknown.body.error).toBe('Unauthorized');
      expect(resWrongPassword.body.error).toBe('Unauthorized');
      expect(resUnknown.body.path).toBe('/auth/login');
      expect(resWrongPassword.body.path).toBe('/auth/login');

      // Byte-for-byte identical comparison (ignoring slight timestamp diff by aligning timestamp)
      const normalizedUnknown = {
        ...resUnknown.body,
        timestamp: 'STATIC_TIME',
      };
      const normalizedWrong = {
        ...resWrongPassword.body,
        timestamp: 'STATIC_TIME',
      };
      expect(JSON.stringify(normalizedUnknown)).toBe(
        JSON.stringify(normalizedWrong),
      );
    });

    it('should successfully login with correct credentials, return tokens and user', async () => {
      const res = await request(app.getHttpServer()).post('/auth/login').send({
        email: 'alice.johnson@example.com',
        password: 'SecurePassword123!',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.accessTokenExpiresIn).toBe(900);
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe('alice.johnson@example.com');
      expect(res.body.data.user.status).toBe('online');
    });
  });

  describe('Protected endpoints: /users/me and Throwaway JwtAuthGuard', () => {
    let validAccessToken: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer()).post('/auth/login').send({
        email: 'alice.johnson@example.com',
        password: 'SecurePassword123!',
      });
      validAccessToken = res.body.data.accessToken;
    });

    it('GET /users/me should fail with 401 when no token is provided', async () => {
      const res = await request(app.getHttpServer()).get('/users/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.statusCode).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('GET /users/me should succeed with valid access token and return user profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${validAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.email).toBe('alice.johnson@example.com');
      expect(res.body.data.fullName).toBe('Alice Johnson');
      expect(res.body.data.isEmailVerified).toBe(false);
      expect(res.body.data.password_hash).toBeUndefined();
    });

    it('should verify throwaway controller with JwtAuthGuard produces req.user { id, email, role? }', async () => {
      const res = await request(app.getHttpServer())
        .get('/test-guard')
        .set('Authorization', `Bearer ${validAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.email).toBe('alice.johnson@example.com');
      expect(res.body.data.role).toBeDefined();
    });
  });

  describe('Supporting flows: refresh, logout, forgot-password, reset-password', () => {
    it('POST /auth/forgot-password should return 200 with generic message', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'alice.johnson@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBeDefined();
    });

    it('POST /auth/logout behind JwtAuthGuard should succeed', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'alice.johnson@example.com',
          password: 'SecurePassword123!',
        });

      const token = loginRes.body.data.accessToken;

      const res = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toBe('Logged out successfully');
    });
  });
});
