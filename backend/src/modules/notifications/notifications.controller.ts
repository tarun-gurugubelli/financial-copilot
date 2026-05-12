import { Controller, Get, Patch, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Notification, NotificationDocument } from '../../database/schemas/notification.schema';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  /** GET /api/notifications?limit=50&unreadOnly=true */
  @Get()
  async list(
    @Req() req: Request,
    @Query('limit') limit = '50',
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const { userId } = req.user as { userId: string };
    const userObjId = new Types.ObjectId(userId);

    const filter: Record<string, unknown> = { userId: userObjId };
    if (unreadOnly === 'true') filter['readAt'] = null;

    const [notifications, unreadCount] = await Promise.all([
      this.notificationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(Math.min(parseInt(limit, 10) || 50, 100))
        .lean(),
      this.notificationModel.countDocuments({ userId: userObjId, readAt: null }),
    ]);

    return { notifications, unreadCount };
  }

  /** PATCH /api/notifications/read-all */
  @Patch('read-all')
  async markAllRead(@Req() req: Request) {
    const { userId } = req.user as { userId: string };
    const result = await this.notificationModel.updateMany(
      { userId: new Types.ObjectId(userId), readAt: null },
      { readAt: new Date() },
    );
    return { ok: true, updated: result.modifiedCount };
  }

  /** PATCH /api/notifications/:id/read */
  @Patch(':id/read')
  async markRead(@Req() req: Request, @Param('id') id: string) {
    const { userId } = req.user as { userId: string };
    await this.notificationModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) },
      { readAt: new Date() },
    );
    return { ok: true };
  }
}
