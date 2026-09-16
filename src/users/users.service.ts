import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from './entities/user.entity.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) { }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async findByIdOrThrow(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.email) = LOWER(:email)', { email: email.trim() })
      .getOne();
  }

  async findByUsername(username: string): Promise<User | null> {
    const clean = username.trim().toLowerCase().replace(/^@/, '');
    return this.userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.username) = LOWER(:username)', { username: clean })
      .getOne();
  }

  async searchUsers(query: string, limit = 20): Promise<User[]> {
    const clean = query.trim().toLowerCase().replace(/^@/, '');
    if (!clean) return [];

    return this.userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.username) LIKE :pattern', { pattern: `%${clean}%` })
      .orWhere('LOWER(user.full_name) LIKE :pattern', { pattern: `%${clean}%` })
      .orWhere('LOWER(user.email) LIKE :pattern', { pattern: `%${clean}%` })
      .take(limit)
      .getMany();
  }

  async generateUniqueUsername(baseString: string): Promise<string> {
    let base = baseString
      .toLowerCase()
      .trim()
      .replace(/^@/, '')
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    if (base.length < 3) {
      base = base ? `${base}_user` : 'user';
    }
    if (base.length > 25) {
      base = base.substring(0, 25);
    }

    let candidate = base;
    let counter = 1;

    while (counter < 100) {
      const existing = await this.findByUsername(candidate);
      if (!existing) {
        return candidate;
      }
      candidate = `${base}${counter++}`;
    }

    return `${base}_${Date.now().toString(36)}`;
  }

  async create(userData: Partial<User>): Promise<User> {
    if (!userData.username) {
      const seed = userData.full_name || userData.email || 'user';
      userData.username = await this.generateUniqueUsername(seed);
    }
    const user = this.userRepository.create(userData);
    return this.userRepository.save(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    const user = await this.findByIdOrThrow(userId);

    if (dto.username) {
      const cleanUsername = dto.username.toLowerCase().trim().replace(/^@/, '');
      if (cleanUsername !== (user.username || '').toLowerCase()) {
        const existing = await this.findByUsername(cleanUsername);
        if (existing && existing.id !== userId) {
          throw new ConflictException(
            `Username "@${cleanUsername}" is already taken by another user`,
          );
        }
        user.username = cleanUsername;
      }
    }

    if (dto.fullName) {
      user.full_name = dto.fullName.trim();
    }

    if (dto.avatarUrl !== undefined) {
      user.avatar_url = dto.avatarUrl ? dto.avatarUrl.trim() : null;
    }

    return this.userRepository.save(user);
  }

  async updateStatus(id: string, status: UserStatus): Promise<void> {
    await this.userRepository.update(id, { status });
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.userRepository.update(id, { password_hash: passwordHash });
  }
}

