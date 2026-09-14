import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { PasswordResetToken } from './entities/password-reset-token.entity.js';
import { UsersModule } from '../users/users.module.js';
import { MailModule } from '../mail/mail.module.js';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: (): JwtModuleOptions => {
        const secret = process.env.JWT_ACCESS_SECRET;
        if (!secret && process.env.NODE_ENV === 'production') {
          throw new Error('JWT_ACCESS_SECRET must be configured');
        }
        return {
          secret: secret ?? 'dev-only-jwt-secret-not-for-production-min32chars',
          signOptions: {
            expiresIn: (process.env.JWT_ACCESS_TTL ?? '15m') as NonNullable<
              JwtModuleOptions['signOptions']
            >['expiresIn'],
          },
        };
      },
    }),
    TypeOrmModule.forFeature([RefreshToken, PasswordResetToken]),
    UsersModule,
    MailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard, JwtModule, PassportModule],
})
export class AuthModule {}
