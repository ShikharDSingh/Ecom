import { z } from 'zod';

export const serviceConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.string().default('info'),
  PGHOST: z.string().default('localhost'),
  PGPORT: z.coerce.number().int().min(1).max(65535).default(5432),
  PGUSER: z.string().default('stockflow_app'),
  PGPASSWORD: z.string().default('stockflow_app'),
  PGDATABASE: z.string().default('identity_db'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  RABBITMQ_URL: z.string().url().default('amqp://localhost:5672'),
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().int().min(1).max(65535).default(9000),
  MINIO_ACCESS_KEY: z.string().default('stockflow'),
  MINIO_SECRET_KEY: z.string().default('stockflow123'),
  OTEL_ENABLED: z.coerce.boolean().default(false),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
});

export type ServiceConfig = z.infer<typeof serviceConfigSchema>;

export function parseServiceConfig(env: Record<string, string | undefined> = process.env): ServiceConfig {
  return serviceConfigSchema.parse(env);
}

