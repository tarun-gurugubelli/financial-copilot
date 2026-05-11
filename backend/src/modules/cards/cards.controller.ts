import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Card, CardDocument } from '../../database/schemas/card.schema';

class CreateCardDto {
  @IsString() last4: string;
  @IsString() bankName: string;
  @IsString() @IsOptional() network?: string;
  @IsString() @IsOptional() nickname?: string;
  @IsNumber() @Min(0) creditLimit: number;
  @IsNumber() @IsOptional() @Min(1) @Max(31) billingCycleDay?: number;
}

@UseGuards(JwtAuthGuard)
@Controller('cards')
export class CardsController {
  constructor(
    @InjectModel(Card.name) private readonly cardModel: Model<CardDocument>,
  ) {}

  @Get()
  async findAll(@Req() req: Request) {
    const { userId } = req.user as { userId: string };
    return this.cardModel.find({ userId, isActive: true }).sort({ createdAt: -1 });
  }

  @Post()
  async create(@Body() dto: CreateCardDto, @Req() req: Request) {
    const { userId } = req.user as { userId: string };
    return this.cardModel.create({ ...dto, userId });
  }
}
