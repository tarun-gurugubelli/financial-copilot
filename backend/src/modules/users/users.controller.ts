import { Controller, Get, Put, Body, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User, UserDocument } from '../../database/schemas/user.schema';

class UpdateProfileDto {
  @IsString() @IsOptional() @MinLength(2) @MaxLength(100) name?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
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

    return { ...(user.toObject() as unknown as Record<string, unknown>), imapAccounts: safeAccounts, connectedAccounts: safeAccounts.length };
  }
}
