import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  FRONTEND_URL: Joi.string().uri().required(),
  MONGO_URI: Joi.string().required(),
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().optional().allow(''),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRY: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRY: Joi.string().default('7d'),
  BCRYPT_SALT_ROUNDS: Joi.number().default(12),
  AES_SECRET_KEY: Joi.string().length(64).required(),
  OPENAI_API_KEY: Joi.string().optional(),
  BULLMQ_CONCURRENCY: Joi.number().default(2),
  IMAP_FETCH_INTERVAL: Joi.string().default('*/5 * * * *'),
});
