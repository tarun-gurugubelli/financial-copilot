import { Controller, Get, Query, Req, UseGuards, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import type { Request } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Transaction, TransactionDocument } from '../../database/schemas/transaction.schema';

@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
  ) {}

  @Get()
  async findAll(
    @Req() req: Request,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('category') category?: string,
    @Query('cardId') cardId?: string,
    @Query('search') search?: string,
  ) {
    const { userId } = req.user as { userId: string };
    const filter: Record<string, unknown> = { userId };

    if (category) filter['category'] = category;
    if (cardId) filter['cardId'] = new Types.ObjectId(cardId);
    if (search) filter['merchant'] = { $regex: search, $options: 'i' };

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.transactionModel
        .find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .populate('cardId', 'last4 bankName network nickname'),
      this.transactionModel.countDocuments(filter),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
