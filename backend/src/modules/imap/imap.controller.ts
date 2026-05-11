import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ImapService, IMAP_PROVIDERS } from './imap.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { User, UserDocument } from '../../database/schemas/user.schema';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

class ConnectImapDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(4)
  appPassword: string;

  @IsIn(['yahoo', 'gmail', 'outlook'])
  provider: 'yahoo' | 'gmail' | 'outlook';
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('imap')
@UseGuards(JwtAuthGuard)
export class ImapController {
  constructor(
    private readonly imapService: ImapService,
    private readonly crypto: CryptoService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * GET /api/imap/accounts
   * Returns the list of connected email accounts (no credentials).
   */
  @Get('accounts')
  async listAccounts(@Req() req: Request) {
    const { userId } = req.user as { userId: string };
    const user = await this.userModel.findById(userId).select('imapAccounts syncStatus lastSyncAt');
    const accounts = (user?.imapAccounts ?? []).map((a) => ({
      email: a.email,
      provider: a.provider,
      lastSyncAt: a.lastSyncAt,
    }));
    return { accounts, syncStatus: user?.syncStatus, lastSyncAt: user?.lastSyncAt };
  }

  /**
   * POST /api/imap/connect
   * Test connectivity, then add (or update) an account.
   * If the email is already in the list, the stored password is updated.
   */
  @Post('connect')
  async connect(@Body() dto: ConnectImapDto, @Req() req: Request) {
    const { userId } = req.user as { userId: string };
    const providerName = dto.provider ?? 'yahoo';
    const { host } = IMAP_PROVIDERS[providerName];

    // Verify credentials before saving
    try {
      await this.imapService.testConnection(dto.email, dto.appPassword, providerName);
    } catch {
      throw new BadRequestException(
        `Could not connect to ${providerName} IMAP. Check your email and App Password.`,
      );
    }

    const encrypted = this.crypto.encrypt(dto.appPassword);
    const accountEntry = {
      email: dto.email.toLowerCase(),
      provider: providerName,
      host,
      ...encrypted,
      lastSyncAt: null,
    };

    const user = await this.userModel.findById(userId).select('imapAccounts');
    const existingIdx = user?.imapAccounts?.findIndex(
      (a) => a.email.toLowerCase() === dto.email.toLowerCase(),
    );

    if (existingIdx !== undefined && existingIdx >= 0) {
      // Update the existing entry's encrypted password
      await this.userModel.findByIdAndUpdate(userId, {
        [`imapAccounts.${existingIdx}.iv`]: encrypted.iv,
        [`imapAccounts.${existingIdx}.authTag`]: encrypted.authTag,
        [`imapAccounts.${existingIdx}.ciphertext`]: encrypted.ciphertext,
        syncStatus: 'syncing',
      });
    } else {
      // Append new account
      await this.userModel.findByIdAndUpdate(userId, {
        $push: { imapAccounts: accountEntry },
        syncStatus: 'syncing',
      });
    }

    // Trigger initial sync immediately (fire-and-forget)
    this.imapService.fetchEmailsForUser(userId).catch(() => {});

    return { message: 'Connected successfully', syncStatus: 'syncing', provider: providerName };
  }

  /**
   * DELETE /api/imap/accounts/:email
   * Removes a connected email account.
   */
  @Delete('accounts/:email')
  async disconnectAccount(@Req() req: Request, @Param('email') email: string) {
    const { userId } = req.user as { userId: string };
    const decodedEmail = decodeURIComponent(email).toLowerCase();

    const user = await this.userModel.findById(userId).select('imapAccounts');
    const exists = user?.imapAccounts?.some(
      (a) => a.email.toLowerCase() === decodedEmail,
    );
    if (!exists) throw new NotFoundException(`Account ${decodedEmail} not found`);

    await this.userModel.findByIdAndUpdate(userId, {
      $pull: { imapAccounts: { email: decodedEmail } },
    });

    return { message: 'Account disconnected', email: decodedEmail };
  }

  /**
   * POST /api/imap/sync
   * Manually trigger a sync for the authenticated user.
   */
  @Post('sync')
  async sync(@Req() req: Request) {
    const { userId } = req.user as { userId: string };

    const user = await this.userModel.findById(userId).select('imapAccounts');
    if (!user?.imapAccounts?.length) {
      throw new BadRequestException('No email accounts connected. Add an account first.');
    }

    // Fire-and-forget — client polls syncStatus
    this.imapService.fetchEmailsForUser(userId).catch((err: Error) => {
      // Log but don't crash — client will see syncStatus: 'error'
      console.error(`Manual sync error for ${userId}: ${err.message}`);
    });

    return { message: 'Sync started', syncStatus: 'syncing' };
  }
}
