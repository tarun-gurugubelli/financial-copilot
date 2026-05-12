export const QUEUES = {
  EMAIL_FETCH: 'email-fetch-queue',
  CLASSIFICATION: 'classification-queue',
  EXTRACTION: 'extraction-queue',
  CATEGORIZATION: 'categorization-queue',
  FRAUD: 'fraud-queue',
  NOTIFICATION: 'notification-queue',
  INSIGHTS: 'insights-queue',
} as const;

export const QUEUE_DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: 100,
  removeOnFail: 200,
};
