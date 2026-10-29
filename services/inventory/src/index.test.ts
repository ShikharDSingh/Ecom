import { describe, expect, it } from 'vitest';

import { InventoryService } from './index';

describe('Inventory acceptance tests', () => {
  it('blocks oversell under concurrent order pressure and preserves zero negative stock', async () => {
    const service = new InventoryService();
    service.upsertStock({ sku: 'SKU-50', warehouseId: 'wh-1', available: 50 });

    const runs = Array.from({ length: 200 }, (_, index) =>
      service.reserveStock({
        sku: 'SKU-50',
        warehouseId: 'wh-1',
        orderId: `ord-${index}`,
        quantity: 1,
      }),
    );

    const results = await Promise.allSettled(runs);
    const successes = results.filter((result) => result.status === 'fulfilled').length;
    const failures = results.filter((result) => result.status === 'rejected').length;

    expect(successes).toBe(50);
    expect(failures).toBe(150);
    expect(service.getStock('SKU-50', 'wh-1')?.available).toBe(0);
    expect(service.getStock('SKU-50', 'wh-1')?.reserved).toBe(50);
    expect(service.getStock('SKU-50', 'wh-1')?.onHand).toBe(50);
  });
});
