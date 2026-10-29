export type OutboxRecord<T> = {
  id: string;
  aggregateId: string;
  aggregateType: string;
  type: string;
  payload: T;
  createdAt: string;
};

export function createOutboxRecord<T>(
  aggregateId: string,
  aggregateType: string,
  type: string,
  payload: T,
): OutboxRecord<T> {
  return {
    id: crypto.randomUUID(),
    aggregateId,
    aggregateType,
    type,
    payload,
    createdAt: new Date().toISOString(),
  };
}

const crypto = globalThis.crypto ?? {
  randomUUID: () => `outbox-${Date.now()}-${Math.random().toString(16).slice(2)}`,
};
