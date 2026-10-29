import { describe, expect, it } from 'vitest';

import { NotificationService } from './index';

describe('NotificationService', () => {
  it('deduplicates notifications and processes domain events', () => {
    const service = new NotificationService();

    const first = service.send({
      channel: 'email',
      recipient: 'customer@example.com',
      template: 'order-confirmed',
      metadata: { orderId: 'ord_123' },
      idempotencyKey: 'dedupe-key',
    });

    const second = service.send({
      channel: 'email',
      recipient: 'customer@example.com',
      template: 'order-confirmed',
      metadata: { orderId: 'ord_123' },
      idempotencyKey: 'dedupe-key',
    });

    const domain = service.processDomainEvent({
      type: 'inventory.low_stock',
      payload: { sku: 'SKU-42', warehouseId: 'wh-7', available: 3 },
    });

    expect(first.id).toBe(second.id);
    expect(domain).toHaveLength(1);
    expect(service.listNotifications('customer@example.com')).toHaveLength(1);
    expect(service.listNotifications('#stockflow-alerts')).toHaveLength(1);
  });
});
