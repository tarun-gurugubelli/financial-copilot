import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Req,
  Res,
  UseGuards,
  Inject,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import Redis from 'ioredis';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User, UserDocument } from '../../database/schemas/user.schema';
import { Transaction, TransactionDocument } from '../../database/schemas/transaction.schema';
import { Card, CardDocument } from '../../database/schemas/card.schema';
import { EmailRaw, EmailRawDocument } from '../../database/schemas/email-raw.schema';
import { Notification, NotificationDocument } from '../../database/schemas/notification.schema';
import { AiInsight, AiInsightDocument } from '../../database/schemas/ai-insight.schema';
import { REDIS_CLIENT } from '../../common/redis/redis.module';

class UpdateProfileDto {
  @IsString() @IsOptional() @MinLength(2) @MaxLength(100) name?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Transaction.name) private readonly transactionModel: Model<TransactionDocument>,
    @InjectModel(Card.name) private readonly cardModel: Model<CardDocument>,
    @InjectModel(EmailRaw.name) private readonly emailRawModel: Model<EmailRawDocument>,
    @InjectModel(Notification.name) private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(AiInsight.name) private readonly aiInsightModel: Model<AiInsightDocument>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get('me')
  async getMe(@Req() req: Request) {
    const { userId } = req.user as { userId: string };
    const user = await this.userModel.findById(userId).select('-passwordHash');
    if (!user) return null;

    const obj = user.toObject() as unknown as Record<string, unknown>;

    // Strip encrypted credential fields — expose only safe metadata
    const safeAccounts = (user.imapAccounts ?? []).map((a) => ({
      email: a.email,
      provider: a.provider,
      lastSyncAt: a.lastSyncAt,
    }));

    return {
      ...obj,
      imapAccounts: safeAccounts,
      connectedAccounts: safeAccounts.length,
    };
  }

  @Put('me')
  async updateMe(@Body() dto: UpdateProfileDto, @Req() req: Request) {
    const { userId } = req.user as { userId: string };
    const user = await this.userModel
      .findByIdAndUpdate(userId, dto, { new: true })
      .select('-passwordHash');
    if (!user) return null;

    const safeAccounts = (user.imapAccounts ?? []).map((a) => ({
      email: a.email,
      provider: a.provider,
      lastSyncAt: a.lastSyncAt,
    }));

    return {
      ...(user.toObject() as unknown as Record<string, unknown>),
      imapAccounts: safeAccounts,
      connectedAccounts: safeAccounts.length,
    };
  }

  /**
   * DELETE /api/users/me
   *
   * Permanently removes the authenticated user and ALL their data:
   *   transactions · cards · raw emails · notifications · AI insights · user record
   *
   * Also invalidates every refresh token stored in Redis so existing sessions
   * can no longer be extended.
   */
  @Delete('me')
  async deleteMe(@Req() req: Request, @Res() res: Response) {
    const { userId } = req.user as { userId: string };

    // Match both string userId (Phase-1 legacy) and ObjectId userId (new data)
    const userFilter = {
      $or: [
        { userId: userId },
        { userId: new Types.ObjectId(userId) },
      ],
    };

    const [tx, cards, emails, notifs, insights] = await Promise.all([
      this.transactionModel.deleteMany(userFilter),
      this.cardModel.deleteMany(userFilter),
      this.emailRawModel.deleteMany(userFilter),
      this.notificationModel.deleteMany(userFilter),
      this.aiInsightModel.deleteMany(userFilter),
    ]);

    // Remove the user record itself
    await this.userModel.findByIdAndDelete(userId);

    // Invalidate all refresh tokens in Redis
    await this.redis.del(`refresh:${userId}`);

    // Clear the auth cookies so the browser session ends immediately
    res.clearCookie('accessToken', { httpOnly: true, sameSite: 'strict', path: '/' });
    res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'strict', path: '/' });

    this.logger.log(
      `[deleteAccount] userId=${userId} — ` +
      `tx:${tx.deletedCount} cards:${cards.deletedCount} ` +
      `emails:${emails.deletedCount} notifs:${notifs.deletedCount} insights:${insights.deletedCount}`,
    );

    return res.status(200).json({
      message: 'Account and all associated data have been permanently deleted.',
    });
  }
}
