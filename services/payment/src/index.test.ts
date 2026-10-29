import { describe, expect, it } from 'vitest';

import { PaymentService } from './index';

describe('PaymentService', () => {
  it('keeps payment operations idempotent across duplicate requests', async () => {
    const gateway = {
      invoke: async () => 'succeeded',
    };
    const service = new PaymentService(gateway, () => '2026-01-01T00:00:00.000Z');

    const first = service.createPayment({ orderId: 'o-1', amountMinor: 1200, idempotencyKey: 'key-1' });
    const second = service.createPayment({ orderId: 'o-1', amountMinor: 1200, idempotencyKey: 'key-1' });
    const processed = await service.processPayment(first.id);

    expect(second.id).toBe(first.id);
    expect(processed.status).toBe('succeeded');
    expect(service.getPayment(first.id)?.status).toBe('succeeded');
  });

  it('records timeout and unknown outcomes without treating them as confirmed failures', async () => {
    const gateway = {
      invoke: async () => 'timeout',
    };
    const service = new PaymentService(gateway, () => '2026-01-02T00:00:00.000Z');

    const payment = service.createPayment({ orderId: 'o-2', amountMinor: 2500, idempotencyKey: 'key-2' });
    const timeout = await service.processPayment(payment.id);
    expect(timeout.status).toBe('timeout');

    const unknown = await service.resolveUnknownOutcome(payment.id, 'unknown');
    expect(unknown.status).toBe('failed');
    expect(service.listOutbox().some((event) => event.type === 'payment.failed')).toBe(true);
  });

  it('supports compensation and refund flows after a successful payment', async () => {
    const gateway = {
      invoke: async () => 'succeeded',
    };
    const service = new PaymentService(gateway, () => '2026-01-03T00:00:00.000Z');

    const payment = service.createPayment({ orderId: 'o-3', amountMinor: 900, idempotencyKey: 'key-3' });
    const processed = await service.processPayment(payment.id);
    const refund = await service.refundPayment(processed.id, 'order_cancelled');

    expect(processed.status).toBe('succeeded');
    expect(refund.status).toBe('succeeded');
    expect(service.getRefund(refund.id)?.status).toBe('succeeded');
  });
});
