import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InsightsController } from './insights.controller';
import { AiInsight, AiInsightSchema } from '../../database/schemas/ai-insight.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: AiInsight.name, schema: AiInsightSchema }]),
  ],
  controllers: [InsightsController],
})
export class InsightsModule {}
