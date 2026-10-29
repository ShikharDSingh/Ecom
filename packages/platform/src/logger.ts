import pino from 'pino';

export type LoggerOptions = {
  service: string;
  level?: string;
};

export function createLogger({ service, level = process.env.LOG_LEVEL ?? 'info' }: LoggerOptions) {
  return pino({
    name: service,
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  } satisfies pino.LoggerOptions);
}

export function withCorrelationId(logger: pino.Logger, correlationId?: string) {
  if (!correlationId) {
    return logger;
  }

  return logger.child({ correlationId });
}
