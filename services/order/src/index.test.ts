import { describe, expect, it } from 'vitest';

import { OrderSagaService } from './index';

describe('OrderSagaService', () => {
  it('tracks the reservation and payment flow without treating unknown outcomes as failures', () => {
    const service = new OrderSagaService(() => '2026-01-01T00:00:00.000Z');

    const created = service.createOrder({
      customerId: 'customer-1',
      items: [
        { productId: 'p-1', sku: 'SKU-1', warehouseId: 'w-1', quantity: 2, unitPriceMinor: 500 },
      ],
    });

    const reserved = service.reserveStock(created.id, 'res-1');
    expect(reserved.status).toBe('reserved');
    expect(reserved.saga.phase).toBe('RESERVED');

    const unknown = service.applyPaymentOutcome(created.id, 'unknown', 'pay-1');
    expect(unknown.status).toBe('payment_unknown');
    expect(unknown.saga.phase).toBe('PAYMENT_UNKNOWN');

    const confirmed = service.applyPaymentOutcome(created.id, 'succeeded', 'pay-1');
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.saga.phase).toBe('CONFIRMED');
    expect(service.drainOutbox().some((event) => event.type === 'order.confirmed')).toBe(true);
  });

  it('compensates the order and escalates if a compensation hook fails', async () => {
    const service = new OrderSagaService(() => '2026-01-02T00:00:00.000Z');
    const order = service.createOrder({
      customerId: 'customer-2',
      items: [{ productId: 'p-2', sku: 'SKU-2', warehouseId: 'w-2', quantity: 1, unitPriceMinor: 700 }],
    });
    service.attachPayment(order.id, 'pay-2');
    service.registerCompensationHandler(order.id, async () => {
      throw new Error('compensator failed');
    });

    const failed = service.failOrder(order.id, 'payment_declined');
    expect(failed.status).toBe('requires_attention');
    expect(failed.saga.phase).toBe('REQUIRES_ATTENTION');
    expect(failed.saga.lastError).toContain('compensator failed');
  });

  it('supports saga persistence and lock-stealing style pending-order selection', () => {
    const service = new OrderSagaService(() => '2026-01-03T00:00:00.000Z');
    const a = service.createOrder({ customerId: 'customer-3', items: [{ productId: 'p-3', sku: 'SKU-3', warehouseId: 'w-3', quantity: 1, unitPriceMinor: 300 }] });
    const b = service.createOrder({ customerId: 'customer-4', items: [{ productId: 'p-4', sku: 'SKU-4', warehouseId: 'w-4', quantity: 2, unitPriceMinor: 800 }] });

    service.attachPayment(a.id, 'pay-a');
    service.applyPaymentOutcome(b.id, 'timeout', 'pay-b');

    const selected = service.claimPendingOrdersForUpdateSkipLocked(10);
    expect(selected).toContain(a.id);
    expect(selected).toContain(b.id);
    expect(service.exportState().orders).toHaveLength(2);
  });
});
