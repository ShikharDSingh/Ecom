import { describe, expect, it } from 'vitest';

import { AuditService } from './index';

describe('AuditService', () => {
  it('stores append-only audit events and reconciles stale entries', () => {
    const service = new AuditService();

    const created = service.append({
      actorId: 'user-1',
      entityType: 'inventory',
      entityId: 'sku-1',
      action: 'stock.adjusted',
      metadata: { delta: 5 },
    });

    const duplicate = service.append({
      id: created.id,
      actorId: 'user-1',
      entityType: 'inventory',
      entityId: 'sku-1',
      action: 'stock.adjusted',
      metadata: { delta: 5 },
    });

    service.appendFromDomainEvent({
      type: 'order.cancelled',
      payload: { orderId: 'ord_999', entityType: 'order', entityId: 'ord_999' },
    });

    expect(duplicate.id).toBe(created.id);
    expect(service.list()).toHaveLength(2);
    expect(service.reconcile(Date.now() + 1000 * 60 * 60 * 24 * 40).stale).toBeGreaterThanOrEqual(1);
  });
});
