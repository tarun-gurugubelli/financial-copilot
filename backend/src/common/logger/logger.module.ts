import { Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

const isProduction = process.env.NODE_ENV === 'production';

export const winstonTransports: winston.transport[] = [
  new winston.transports.Console({
    format: isProduction
      ? winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        )
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({ format: 'HH:mm:ss' }),
          winston.format.printf(({ level, message, timestamp, context, ...meta }) => {
            const ctx = context ? ` [${context}]` : '';
            const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
            return `${timestamp} ${level}${ctx}: ${message}${extra}`;
          }),
        ),
  }),
];

@Module({
  imports: [
    WinstonModule.forRoot({
      transports: winstonTransports,
    }),
  ],
  exports: [WinstonModule],
})
export class LoggerModule {}
