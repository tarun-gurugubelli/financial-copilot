import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { makeCounterProvider, makeHistogramProvider } from '@willsoto/nestjs-prometheus';

export const METRICS = {
  HTTP_REQUESTS_TOTAL: 'http_requests_total',
  HTTP_REQUEST_DURATION: 'http_request_duration_seconds',
  PIPELINE_JOBS_PROCESSED: 'pipeline_jobs_processed_total',
  PIPELINE_JOB_DURATION: 'pipeline_job_duration_seconds',
  SOCKET_CONNECTIONS: 'websocket_connections_active',
} as const;

@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: { enabled: true },
      path: '/metrics',
    }),
  ],
  providers: [
    makeCounterProvider({
      name: METRICS.HTTP_REQUESTS_TOTAL,
      help: 'Total HTTP requests by method and status',
      labelNames: ['method', 'route', 'status'],
    }),
    makeHistogramProvider({
      name: METRICS.HTTP_REQUEST_DURATION,
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route'],
      buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
    }),
    makeCounterProvider({
      name: METRICS.PIPELINE_JOBS_PROCESSED,
      help: 'Total AI pipeline jobs processed',
      labelNames: ['queue', 'status'],
    }),
    makeHistogramProvider({
      name: METRICS.PIPELINE_JOB_DURATION,
      help: 'AI pipeline job duration in seconds',
      labelNames: ['queue'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
    }),
    makeCounterProvider({
      name: METRICS.SOCKET_CONNECTIONS,
      help: 'WebSocket connection events',
      labelNames: ['event'],
    }),
  ],
  exports: [PrometheusModule],
})
export class MetricsModule {}
