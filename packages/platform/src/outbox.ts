import { randomUUID } from 'node:crypto';

export type OutboxEnvelope<T> = {
  eventId: string;
  type: string;
  schemaVersion: number;
  occurredAt: string;
  producer: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string;
  actor: { type: 'user' | 'service' | 'system'; id: string };
  data: T;
};

export function createOutboxEnvelope<T>(input: {
  type: string;
  producer: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  correlationId?: string;
  actor?: { type: 'user' | 'service' | 'system'; id: string };
  data: T;
  schemaVersion?: number;
}): OutboxEnvelope<T> {
  return {
    eventId: randomUUID(),
    type: input.type,
    schemaVersion: input.schemaVersion ?? 1,
    occurredAt: new Date().toISOString(),
    producer: input.producer,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    aggregateVersion: input.aggregateVersion,
    correlationId: input.correlationId ?? randomUUID(),
    actor: input.actor ?? { type: 'service', id: input.producer },
    data: input.data,
  };
}
