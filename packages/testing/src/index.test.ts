import { describe, expect, it } from 'vitest';
import { expectContractShape } from './index.js';

describe('StockFlow contract smoke tests', () => {
  it('accepts a valid payload contract', () => {
    const payload = {
      id: 'order-123',
      status: 'accepted',
      totalCents: 12500,
    };

    expect(expectContractShape(payload, { status: 'accepted' })).toEqual(payload);
  });

  it('rejects a mismatched contract', () => {
    expect(() => expectContractShape({ id: 'bad', status: 'failed' }, { status: 'accepted' })).toThrow(
      'Contract mismatch for status'
    );
  });
});
