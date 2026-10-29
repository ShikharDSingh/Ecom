import express, { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';

export type AuditEvent = {
  id: string;
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AuditSummary = {
  total: number;
  byAction: Record<string, number>;
  byEntityType: Record<string, number>;
  stale: number;
};

export class AuditService {
  private readonly events: AuditEvent[] = [];
  private readonly seenIds = new Set<string>();

  public append(input: Omit<AuditEvent, 'id' | 'createdAt'> & { id?: string }): AuditEvent {
    const id = input.id ?? `aud_${randomUUID()}`;
    if (this.seenIds.has(id)) {
      const existing = this.events.find((event) => event.id === id);
      if (existing) {
        return { ...existing, metadata: { ...existing.metadata } };
      }
      return {
        id,
        actorId: input.actorId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        metadata: { ...input.metadata },
        createdAt: new Date().toISOString(),
      };
    }

    const createdAt = new Date().toISOString();
    const record: AuditEvent = {
      id,
      actorId: input.actorId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      metadata: { ...input.metadata },
      createdAt,
    };

    this.events.push(record);
    this.seenIds.add(id);
    return { ...record, metadata: { ...record.metadata } };
  }

  public list(): AuditEvent[] {
    return this.events.map((event) => ({ ...event, metadata: { ...event.metadata } }));
  }

  public appendFromDomainEvent(event: { type: string; payload: Record<string, unknown> }, actorId = 'system'): AuditEvent {
    return this.append({
      id: `aud_${randomUUID()}`,
      actorId,
      entityType: String(event.payload.entityType ?? event.type.split('.').at(0) ?? 'domain'),
      entityId: String(event.payload.entityId ?? event.payload.orderId ?? event.payload.paymentId ?? 'unknown'),
      action: event.type,
      metadata: { ...event.payload },
    });
  }

  public reconcile(now = Date.now()): AuditSummary {
    const byAction: Record<string, number> = {};
    const byEntityType: Record<string, number> = {};
    let stale = 0;

    for (const event of this.events) {
      byAction[event.action] = (byAction[event.action] ?? 0) + 1;
      byEntityType[event.entityType] = (byEntityType[event.entityType] ?? 0) + 1;
      const ageMs = now - new Date(event.createdAt).getTime();
      if (ageMs > 1000 * 60 * 60 * 24 * 30) {
        stale += 1;
      }
    }

    return {
      total: this.events.length,
      byAction,
      byEntityType,
      stale,
    };
  }

  public clear(): void {
    this.events.length = 0;
    this.seenIds.clear();
  }
}

export function createAuditApp(service = new AuditService()): express.Express {
  const app = express();
  app.use(express.json());

  app.post('/v1/audit/events', (req: Request, res: Response) => {
    const payload = req.body as Partial<AuditEvent>;
    if (!payload.actorId || !payload.entityType || !payload.entityId || !payload.action) {
      return res.status(400).json({ error: 'actorId, entityType, entityId, and action are required' });
    }
    const record = service.append({
      actorId: payload.actorId,
      entityType: payload.entityType,
      entityId: payload.entityId,
      action: payload.action,
      metadata: payload.metadata ?? {},
    });
    return res.status(201).json(record);
  });

  app.get('/v1/audit/events', (_req: Request, res: Response) => {
    return res.json(service.list());
  });

  return app;
}

export const serviceName = 'audit';
export const status = 'ready';

