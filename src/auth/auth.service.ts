import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service.js';
import { UserStatus } from '../users/entities/user.entity.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { PasswordResetToken } from './entities/password-reset-token.entity.js';
import { SignupDto } from './dto/signup.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';

// Pre-computed argon2 hash for constant-time comparison on unknown email to prevent timing-based user enumeration
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQxMjM0NTY3OA$9lJ51PjPsk+0Zg86aW7nIuR5O6n9h8f0b7v5d4c3b2a';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetTokenRepository: Repository<PasswordResetToken>,
  ) {}

  async signup(dto: SignupDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('EMAIL_TAKEN');
    }

    const password_hash = await argon2.hash(dto.password);

    const user = await this.usersService.create({
      full_name: dto.fullName,
      email: dto.email.toLowerCase().trim(),
      password_hash,
      status: UserStatus.OFFLINE,
      is_email_verified: false,
    });

    return {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      avatarUrl: user.avatar_url,
      status: user.status,
      createdAt: user.created_at,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      // Execute dummy argon2 verification to keep response timing identical
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
      { expiresIn: accessTtl },
    );
    const accessTokenExpiresIn = 900; // 15 minutes in seconds

    // Refresh token (~7 days)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const rawSecret = crypto.randomUUID();

    const refreshTokenEntity = this.refreshTokenRepository.create({
      user_id: user.id,
      token_hash: 'placeholder',
      expires_at: expiresAt,
      is_revoked: false,
    });
    const savedToken =
      await this.refreshTokenRepository.save(refreshTokenEntity);

    const rawRefreshToken = `${savedToken.id}.${rawSecret}`;
    savedToken.token_hash = await argon2.hash(rawRefreshToken);
    await this.refreshTokenRepository.save(savedToken);

    // Optionally set status to online
    await this.usersService.updateStatus(user.id, UserStatus.ONLINE);

    return {
      accessToken,
      accessTokenExpiresIn,
      refreshToken: rawRefreshToken,
      user: {
        id: user.id,
        fullName: user.full_name,
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
          is_revoked: false,
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
      { expiresIn: accessTtl },
    );

    return {
      accessToken,
      accessTokenExpiresIn: 900,
    };
  }

  async logout(userId: string) {
    await this.refreshTokenRepository.update(
      { user_id: userId, is_revoked: false },
      { is_revoked: true },
    );
    await this.usersService.updateStatus(userId, UserStatus.OFFLINE);
    return { message: 'Logged out successfully' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);

    if (user) {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour TTL
      const rawSecret = crypto.randomUUID();

      const resetTokenEntity = this.passwordResetTokenRepository.create({
        user_id: user.id,
        token_hash: 'placeholder',
        expires_at: expiresAt,
        is_used: false,
      });
      const saved =
        await this.passwordResetTokenRepository.save(resetTokenEntity);

      const publicToken = `${saved.id}.${rawSecret}`;
      saved.token_hash = await argon2.hash(publicToken);
      await this.passwordResetTokenRepository.save(saved);

      // Stubbed mailer interface
      console.log(
        `[Mailer Stub] Password reset token for ${user.email}: ${publicToken}`,
      );
    }

    // Always 200 with generic message to prevent user enumeration
    return {
      message:
        'If an account exists with that email, a password reset link has been sent',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    let tokenId = dto.token;
    if (dto.token.includes('.')) {
      tokenId = dto.token.split('.')[0];
    }

    let token: PasswordResetToken | null = null;
    try {
      token = await this.passwordResetTokenRepository.findOne({
        where: {
          id: tokenId,
          is_used: false,
          expires_at: MoreThan(new Date()),
        },
      });
    } catch {
      token = null;
    }

    if (!token) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const isValid = await argon2
      .verify(token.token_hash, dto.token)
      .catch(() => false);

    if (!isValid) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const newPasswordHash = await argon2.hash(dto.password);
    await this.usersService.updatePasswordHash(token.user_id, newPasswordHash);

    // Mark token used
    await this.passwordResetTokenRepository.update(token.id, { is_used: true });

    // Revoke all existing refresh tokens for this user
    await this.refreshTokenRepository.update(
      { user_id: token.user_id, is_revoked: false },
      { is_revoked: true },
    );

    return { message: 'Password has been reset successfully' };
  }
}
