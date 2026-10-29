export type IdempotencyKey = {
  key: string;
  requestHash: string;
  ttlMs: number;
};

export function makeIdempotencyKey(request: unknown, ttlMs = 60000): IdempotencyKey {
  const payload = JSON.stringify(request ?? {});
  return {
    key: `idem-${Buffer.from(payload).toString('base64url')}`,
    requestHash: payload,
    ttlMs,
  };
}
