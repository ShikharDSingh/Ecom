export type MessageEnvelope<T> = {
  eventId: string;
  type: string;
  payload: T;
  occurredAt: string;
};

export function createMessageEnvelope<T>(type: string, payload: T): MessageEnvelope<T> {
  return {
    eventId: crypto.randomUUID(),
    type,
    payload,
    occurredAt: new Date().toISOString(),
  };
}

const crypto = globalThis.crypto ?? {
  randomUUID: () => `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
};
