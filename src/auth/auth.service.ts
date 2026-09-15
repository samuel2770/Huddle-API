import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { JwtService, type JwtModuleOptions } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service.js';
import { UserStatus } from '../users/entities/user.entity.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { SignupDto } from './dto/signup.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { MailService } from '../mail/mail.service.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';

// Pre-computed argon2 hash for constant-time comparison on unknown email
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQxMjM0NTY3OA$9lJ51PjPsk+0Zg86aW7nIuR5O6n9h8f0b7v5d4c3b2a';

type JwtExpiresIn = NonNullable<
  JwtModuleOptions['signOptions']
>['expiresIn'];

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly workspacesService: WorkspacesService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  onModuleInit() {
    this.cleanupExpiredTokens().catch(() => {});
    setInterval(() => {
      this.cleanupExpiredTokens().catch(() => {});
    }, 12 * 60 * 60 * 1000);
  }

  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.refreshTokenRepository
      .createQueryBuilder()
      .delete()
      .where('expires_at < :now OR revoked = true', { now: new Date() })
      .execute();
    return result.affected ?? 0;
  }

  async signup(dto: SignupDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('EMAIL_TAKEN');
    }

    const password_hash = await argon2.hash(dto.password);

    const username = await this.usersService.generateUniqueUsername(
      dto.fullName || dto.email.split('@')[0],
    );

    const user = await this.usersService.create({
      full_name: dto.fullName,
      email: dto.email.toLowerCase().trim(),
      username,
      password_hash,
      status: UserStatus.OFFLINE,
      is_email_verified: false,
    });

    // Automatically create a default workspace & channel for the user
    try {
      const slug = (username || 'workspace').toLowerCase().replace(/[^a-z0-9]/g, '-');
      await this.workspacesService.create(user.id, {
        name: `${dto.fullName.split(' ')[0]}'s Workspace`,
        slug: slug.length < 3 ? `${slug}-team` : slug,
      });
    } catch (e) {
      // If workspace creation hits conflict, try fallback slug
      try {
        await this.workspacesService.create(user.id, {
          name: `${dto.fullName.split(' ')[0]}'s Workspace`,
          slug: `workspace-${Date.now().toString(36)}`,
        });
      } catch {}
    }

    // Send verification email (non-blocking)
    this.mailService.sendVerificationEmail(user.email, 'verify-token-placeholder').catch(() => {});

    return {
      id: user.id,
      fullName: user.full_name,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatar_url,
      status: user.status,
      createdAt: user.created_at,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      await argon2.verify(DUMMY_HASH, dto.password).catch(() => false);
      throw new UnauthorizedException(
        'Invalid email or password, please try again',
      );
    }

    const isPasswordValid = await argon2.verify(
      user.password_hash,
      dto.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException(
        'Invalid email or password, please try again',
      );
    }

    // Access token (15m default)
    const accessTtl = process.env.JWT_ACCESS_TTL ?? '15m';
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email },
      { expiresIn: accessTtl as JwtExpiresIn },
    );
    const accessTokenExpiresIn = 900; // 15 minutes in seconds

    // Refresh token (~7 days)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const rawSecret = crypto.randomUUID();

    const refreshTokenEntity = this.refreshTokenRepository.create({
      user_id: user.id,
      token_hash: 'placeholder',
      expires_at: expiresAt,
      revoked: false,
    });
    const savedToken =
      await this.refreshTokenRepository.save(refreshTokenEntity);

    const rawRefreshToken = `${savedToken.id}.${rawSecret}`;
    savedToken.token_hash = await argon2.hash(rawRefreshToken);
    await this.refreshTokenRepository.save(savedToken);

    await this.usersService.updateStatus(user.id, UserStatus.ONLINE);

    return {
      accessToken,
      accessTokenExpiresIn,
      refreshToken: rawRefreshToken,
      user: {
        id: user.id,
        fullName: user.full_name,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatar_url,
        status: UserStatus.ONLINE,
      },
    };
  }

  async refresh(dto: RefreshTokenDto) {
    let tokenId = dto.refreshToken;
    if (dto.refreshToken.includes('.')) {
      tokenId = dto.refreshToken.split('.')[0];
    }

    let token: RefreshToken | null = null;
    try {
      token = await this.refreshTokenRepository.findOne({
        where: {
          id: tokenId,
          revoked: false,
          expires_at: MoreThan(new Date()),
        },
      });
    } catch {
      token = null;
    }

    if (!token) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const isValid = await argon2
      .verify(token.token_hash, dto.refreshToken)
      .catch(() => false);

    if (!isValid) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.usersService.findById(token.user_id);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    const accessTtl = process.env.JWT_ACCESS_TTL ?? '15m';
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email },
      { expiresIn: accessTtl as JwtExpiresIn },
    );

    return {
      accessToken,
      accessTokenExpiresIn: 900,
    };
  }

  async logout(userId: string) {
    await this.refreshTokenRepository.update(
      { user_id: userId, revoked: false },
      { revoked: true },
    );
    await this.usersService.updateStatus(userId, UserStatus.OFFLINE);
    return { message: 'Logged out successfully' };
  }
}
