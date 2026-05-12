export type NotificationType =
  | 'transaction_new'
  | 'fraud_alert'
  | 'extraction_failed'
  | 'insight_generated'
  | 'utilization_warning'
  | 'due_date_reminder'
  | 'sync_error';

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface Notification {
  _id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  severity: NotificationSeverity;
  relatedId?: string;
  relatedCollection?: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
}
