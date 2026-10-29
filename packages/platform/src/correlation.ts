import { randomUUID } from 'node:crypto';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

export type CorrelationContext = {
  correlationId: string;
};

export function getCorrelationId(input?: string | string[] | null): string {
  if (Array.isArray(input)) {
    return input[0] ?? randomUUID();
  }

  return input && input.length > 0 ? input : randomUUID();
}

export function withCorrelationIdHeader<T extends Record<string, unknown>>(context: T, correlationId?: string): T & CorrelationContext {
  return {
    ...context,
    correlationId: correlationId ?? randomUUID(),
  };
}

export function correlationMiddleware(req: { headers?: Record<string, string | string[] | undefined> }, res: { setHeader: (name: string, value: string) => void }, next: () => void) {
  const incoming = req.headers?.[CORRELATION_ID_HEADER] ?? req.headers?.['X-Correlation-Id'];
  const correlationId = getCorrelationId(Array.isArray(incoming) ? incoming : incoming ?? undefined);

  res.setHeader(CORRELATION_ID_HEADER, correlationId);

  (req as { correlationId?: string }).correlationId = correlationId;
  next();
}
