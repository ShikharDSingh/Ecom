export const platformVersion = '0.1.0';

export function createCorrelationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `corr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function buildHealthCheck(ok: boolean, details: Record<string, unknown> = {}): Record<string, unknown> {
  return { ok, details, timestamp: new Date().toISOString() };
}

