import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import Redis from 'ioredis';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { REDIS_CLIENT } from '../../common/redis/redis.module';

const REFRESH_TTL = 60 * 60 * 24 * 7; // 7 days

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.userModel.findOne({ email: dto.email.toLowerCase() });
    if (exists) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(
      dto.password,
      this.config.get<number>('BCRYPT_SALT_ROUNDS')!,
    );
    const user = await this.userModel.create({
      name: dto.name,
      email: dto.email.toLowerCase(),
      passwordHash,
    });
    return this.issueTokens(user);
  }

  async login(dto: LoginDto) {
    const user = await this.userModel
      .findOne({ email: dto.email.toLowerCase() })
      .select('+passwordHash');

    // Identical error for wrong email or wrong password — prevents enumeration
    const INVALID_MSG = 'Invalid credentials';
    if (!user) throw new UnauthorizedException(INVALID_MSG);

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException(INVALID_MSG);

    return this.issueTokens(user);
  }

  async refresh(userId: string, incomingToken: string) {
    const hash = this.hashToken(incomingToken);
    const exists = await this.redis.sismember(`refresh:${userId}`, hash);
    if (!exists) throw new UnauthorizedException('Invalid refresh token');

    const user = await this.userModel.findById(userId);
    if (!user || !user.isActive) throw new UnauthorizedException();

    await this.redis.srem(`refresh:${userId}`, hash);
    return this.issueTokens(user);
  }

  async logout(userId: string, refreshToken: string) {
    const hash = this.hashToken(refreshToken);
    await this.redis.srem(`refresh:${userId}`, hash);
  }

  private async issueTokens(user: UserDocument) {
    const payload = { sub: user._id.toString(), email: user.email };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get('JWT_SECRET'),
      expiresIn: this.config.get('JWT_EXPIRY'),
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRY'),
    });

    const hash = this.hashToken(refreshToken);
    await this.redis.sadd(`refresh:${user._id}`, hash);
    await this.redis.expire(`refresh:${user._id}`, REFRESH_TTL);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        connectedAccounts: user.imapAccounts?.length ?? 0,
        syncStatus: user.syncStatus,
      },
    };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
