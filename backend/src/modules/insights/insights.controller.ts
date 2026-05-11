import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AiInsight, AiInsightDocument } from '../../database/schemas/ai-insight.schema';

@UseGuards(JwtAuthGuard)
@Controller('insights')
export class InsightsController {
  constructor(
    @InjectModel(AiInsight.name) private readonly aiInsightModel: Model<AiInsightDocument>,
  ) {}

  /** GET /api/insights — last 12 months for the authenticated user */
  @Get()
  async list(@Req() req: Request) {
    const { userId } = req.user as { userId: string };
    const insights = await this.aiInsightModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ period: -1 })
      .limit(12)
      .lean();
    return { insights };
  }

  /** GET /api/insights/:period — e.g. /api/insights/2026-05 */
  @Get(':period')
  async getByPeriod(@Req() req: Request, @Param('period') period: string) {
    const { userId } = req.user as { userId: string };
    const insight = await this.aiInsightModel
      .findOne({ userId: new Types.ObjectId(userId), period })
      .lean();
    return { insight };
  }
}
