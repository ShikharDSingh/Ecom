import { createHash } from 'node:crypto';

export type IdempotencyRecord<T> = {
  key: string;
  value: T;
  createdAt: number;
  expiresAt: number;
};

export class InMemoryIdempotencyStore<T> {
  private readonly records = new Map<string, IdempotencyRecord<T>>();

  constructor(private readonly ttlMs = 1000 * 60 * 60 * 24) {}

  public put(key: string, value: T) {
    const now = Date.now();
    this.records.set(key, {
      key,
      value,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    });
  }

  public get(key: string): T | undefined {
    const record = this.records.get(key);
    if (!record) {
      return undefined;
    }

    if (record.expiresAt <= Date.now()) {
      this.records.delete(key);
      return undefined;
    }

    return record.value;
  }

  public has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  public delete(key: string) {
    this.records.delete(key);
  }
}

export function createIdempotencyKey(parts: string[]): string {
  return createHash('sha256').update(parts.join(':')).digest('hex');
}
