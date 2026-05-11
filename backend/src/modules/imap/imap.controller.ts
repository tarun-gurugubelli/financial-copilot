import { Body, Controller, Post, Req, UseGuards, BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ImapService } from './imap.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../database/schemas/user.schema';

class ConnectImapDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(4)
  appPassword: string;
}

@Controller('imap')
export class ImapController {
  constructor(
    private readonly imapService: ImapService,
    private readonly crypto: CryptoService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('connect')
  async connect(@Body() dto: ConnectImapDto, @Req() req: Request) {
    const { userId } = req.user as { userId: string };

    try {
      await this.imapService.testConnection(dto.email, dto.appPassword);
    } catch {
      throw new BadRequestException(
        'Could not connect to Yahoo Mail. Check your email and App Password.',
      );
    }

    const encrypted = this.crypto.encrypt(dto.appPassword);
    await this.userModel.findByIdAndUpdate(userId, {
      imapCredentials: { email: dto.email, ...encrypted },
      syncStatus: 'syncing',
    });

    // Trigger initial sync immediately (fire-and-forget)
    this.imapService.fetchEmailsForUser(userId).catch(() => {});

    return { message: 'Connected successfully', syncStatus: 'syncing' };
  }
}
