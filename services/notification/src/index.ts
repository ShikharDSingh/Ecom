import express, { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';

export type NotificationChannel = 'email' | 'sms' | 'push' | 'slack';

export type NotificationRequest = {
  channel: NotificationChannel;
  recipient: string;
  template: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
};

export type NotificationRecord = {
  id: string;
  channel: NotificationChannel;
  recipient: string;
  template: string;
  metadata: Record<string, string>;
  status: 'queued' | 'sent';
  createdAt: string;
  sentAt?: string;
  idempotencyKey?: string;
};

export type DomainEventNotification = {
  type: string;
  payload: Record<string, unknown>;
};

export class NotificationService {
  private readonly notifications = new Map<string, NotificationRecord>();
  private readonly dedupeKeys = new Set<string>();

  public send(input: NotificationRequest): NotificationRecord {
    const key = input.idempotencyKey ?? this.deriveDedupKey(input);
    const existing = this.findByDedupKey(key);
    if (existing) {
      return { ...existing, metadata: { ...existing.metadata } };
    }

    const now = new Date().toISOString();
    const record: NotificationRecord = {
      id: `ntf_${randomUUID()}`,
      channel: input.channel,
      recipient: input.recipient,
      template: input.template,
      metadata: { ...(input.metadata ?? {}) },
      status: 'sent',
      createdAt: now,
      sentAt: now,
      idempotencyKey: key,
    };

    this.notifications.set(record.id, record);
    this.dedupeKeys.add(key);
    return { ...record, metadata: { ...record.metadata } };
  }

  public processDomainEvent(event: DomainEventNotification): NotificationRecord[] {
    const rules: Array<{
      channel: NotificationChannel;
      recipient: string;
      template: string;
      metadata: Record<string, string>;
    }> = [];

    switch (event.type) {
      case 'order.confirmed':
        rules.push({
          channel: 'email',
          recipient: String((event.payload.customerEmail as string) ?? 'ops@stockflow.local'),
          template: 'order-confirmed',
          metadata: {
            orderId: String(event.payload.orderId ?? ''),
            status: 'confirmed',
          },
        });
        break;
      case 'order.failed':
        rules.push({
          channel: 'email',
          recipient: String((event.payload.customerEmail as string) ?? 'ops@stockflow.local'),
          template: 'order-failed',
          metadata: {
            orderId: String(event.payload.orderId ?? ''),
            reason: String(event.payload.reason ?? 'unknown'),
          },
        });
        break;
      case 'inventory.low_stock':
        rules.push({
          channel: 'slack',
          recipient: '#stockflow-alerts',
          template: 'inventory-low-stock',
          metadata: {
            sku: String(event.payload.sku ?? ''),
            warehouseId: String(event.payload.warehouseId ?? ''),
            available: String(event.payload.available ?? '0'),
          },
        });
        break;
      default:
        return [];
    }

    return rules.map((rule) => this.send({ ...rule, idempotencyKey: `${event.type}:${rule.recipient}:${rule.template}:${rule.metadata.orderId ?? rule.metadata.sku ?? 'default'}` }));
  }

  public listNotifications(recipient?: string): NotificationRecord[] {
    const values = [...this.notifications.values()];
    const filtered = recipient ? values.filter((notification) => notification.recipient === recipient) : values;
    return filtered.map((notification) => ({ ...notification, metadata: { ...notification.metadata } }));
  }

  public getNotification(notificationId: string): NotificationRecord | undefined {
    const record = this.notifications.get(notificationId);
    return record ? { ...record, metadata: { ...record.metadata } } : undefined;
  }

  public clear(): void {
    this.notifications.clear();
    this.dedupeKeys.clear();
  }

  private deriveDedupKey(input: NotificationRequest): string {
    return `${input.channel}:${input.recipient}:${input.template}:${JSON.stringify(input.metadata ?? {})}`;
  }

  private findByDedupKey(dedupeKey: string): NotificationRecord | undefined {
    for (const notification of this.notifications.values()) {
      if (notification.idempotencyKey === dedupeKey) {
        return { ...notification, metadata: { ...notification.metadata } };
      }
    }
    return undefined;
  }
}

export function createNotificationApp(service = new NotificationService()): express.Express {
  const app = express();
  app.use(express.json());

  app.post('/v1/notifications', (req: Request, res: Response) => {
    const payload = req.body as Partial<NotificationRequest>;
    if (!payload.channel || !payload.recipient || !payload.template) {
      return res.status(400).json({ error: 'channel, recipient, and template are required' });
    }
    const record = service.send({
      channel: payload.channel as NotificationChannel,
      recipient: payload.recipient,
      template: payload.template,
      metadata: payload.metadata ?? {},
      ...(payload.idempotencyKey !== undefined ? { idempotencyKey: payload.idempotencyKey } : {}),
    });
    return res.status(202).json(record);
  });

  app.get('/v1/notifications', (req: Request, res: Response) => {
    const recipient = typeof req.query.recipient === 'string' ? req.query.recipient : undefined;
    return res.json(service.listNotifications(recipient));
  });

  return app;
}

export const serviceName = 'notification';
export const status = 'ready';

