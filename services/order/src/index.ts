export type OrderStatus =
  | 'created'
  | 'reserving'
  | 'reserved'
  | 'payment_pending'
  | 'payment_unknown'
  | 'payment_confirmed'
  | 'confirming_stock'
  | 'confirmed'
  | 'failed'
  | 'compensating'
  | 'cancelled'
  | 'requires_attention';

export type OrderItemStatus = 'pending' | 'reserved' | 'confirmed' | 'released';

export type OrderItem = {
  id: string;
  productId: string;
  sku: string;
  warehouseId: string;
  quantity: number;
  unitPriceMinor: number;
  status: OrderItemStatus;
};

export type OrderSagaState = {
  phase: 'CREATED' | 'RESERVING' | 'RESERVED' | 'PAYMENT_PENDING' | 'PAYMENT_UNKNOWN' | 'CONFIRMING_STOCK' | 'CONFIRMED' | 'COMPENSATING' | 'CANCELLED' | 'REQUIRES_ATTENTION';
  substate: string;
  compensationRequired: boolean;
  lastError?: string;
  updatedAt: string;
};

export type OrderRecord = {
  id: string;
  customerId: string;
  status: OrderStatus;
  currency: string;
  totalMinor: number;
  paymentId?: string;
  reservationId?: string;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  saga: OrderSagaState;
};

export type OrderEvent = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  orderId: string;
};

export type CreateOrderInput = {
  customerId: string;
  currency?: string;
  items: Array<{
    productId: string;
    sku: string;
    warehouseId: string;
    quantity: number;
    unitPriceMinor: number;
  }>;
};

export type PaymentOutcome = 'succeeded' | 'failed' | 'declined' | 'timeout' | 'unknown';

export class OrderSagaService {
  private readonly orders = new Map<string, OrderRecord>();
  private readonly outbox: OrderEvent[] = [];
  private readonly compensationHandlers = new Map<string, () => void | Promise<void>>();

  constructor(private readonly now = () => new Date().toISOString()) {}

  public createOrder(input: CreateOrderInput): OrderRecord {
    const orderId = `ord_${Math.random().toString(36).slice(2, 10)}`;
    const createdAt = this.now();
    const totalMinor = input.items.reduce((sum, item) => sum + item.unitPriceMinor * item.quantity, 0);
    const order: OrderRecord = {
      id: orderId,
      customerId: input.customerId,
      status: 'created',
      currency: input.currency ?? 'USD',
      totalMinor,
      createdAt,
      updatedAt: createdAt,
      items: input.items.map((item) => ({
        id: `line_${Math.random().toString(36).slice(2, 9)}`,
        productId: item.productId,
        sku: item.sku,
        warehouseId: item.warehouseId,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
        status: 'pending',
      })),
      saga: {
        phase: 'CREATED',
        substate: 'INITIALIZED',
        compensationRequired: false,
        updatedAt: createdAt,
      },
    };

    this.orders.set(orderId, order);
    this.emitOutbox(orderId, 'order.created', {
      orderId,
      customerId: order.customerId,
      totalMinor: order.totalMinor,
      currency: order.currency,
    });
    return this.snapshot(order);
  }

  public reserveStock(orderId: string, reservationId = `res_${Math.random().toString(36).slice(2, 9)}`): OrderRecord {
    const order = this.requireOrder(orderId);
    if (order.status === 'cancelled' || order.status === 'confirmed') {
      throw new Error(`Order ${orderId} cannot be reserved in state ${order.status}`);
    }

    order.status = 'reserving';
    order.saga.phase = 'RESERVING';
    order.saga.substate = 'ALLOCATING_STOCK';
    order.saga.updatedAt = this.now();
    order.updatedAt = order.saga.updatedAt;
    order.reservationId = reservationId;

    for (const item of order.items) {
      item.status = 'reserved';
    }

    this.emitOutbox(orderId, 'inventory.stock.reserved', {
      orderId,
      reservationId,
      items: order.items.map((item) => ({
        productId: item.productId,
        warehouseId: item.warehouseId,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
      })),
    });

    order.status = 'reserved';
    order.saga.phase = 'RESERVED';
    order.saga.substate = 'RESERVATION_CONFIRMED';
    order.saga.updatedAt = this.now();
    order.updatedAt = order.saga.updatedAt;

    this.emitOutbox(orderId, 'order.reserved', {
      orderId,
      reservationId,
      totalMinor: order.totalMinor,
    });

    return this.snapshot(order);
  }

  public attachPayment(orderId: string, paymentId: string): OrderRecord {
    const order = this.requireOrder(orderId);
    order.paymentId = paymentId;
    order.status = 'payment_pending';
    order.saga.phase = 'PAYMENT_PENDING';
    order.saga.substate = 'AWAITING_PAYMENT';
    order.saga.updatedAt = this.now();
    order.updatedAt = order.saga.updatedAt;
    return this.snapshot(order);
  }

  public applyPaymentOutcome(orderId: string, outcome: PaymentOutcome, paymentId?: string): OrderRecord {
    const order = this.requireOrder(orderId);
    if (paymentId) {
      order.paymentId = paymentId;
    }

    if (outcome === 'succeeded') {
      order.status = 'payment_confirmed';
      order.saga.phase = 'PAYMENT_PENDING';
      order.saga.substate = 'PAYMENT_CONFIRMED';
      order.saga.lastError = undefined;
      order.saga.updatedAt = this.now();
      order.updatedAt = order.saga.updatedAt;
      this.emitOutbox(orderId, 'payment.succeeded', {
        paymentId: order.paymentId,
        orderId,
        amountMinor: order.totalMinor,
      });
      return this.confirmStock(orderId);
    }

    if (outcome === 'declined' || outcome === 'failed') {
      return this.failOrder(orderId, `${outcome}`);
    }

    if (outcome === 'timeout' || outcome === 'unknown') {
      order.status = 'payment_unknown';
      order.saga.phase = 'PAYMENT_UNKNOWN';
      order.saga.substate = 'WAITING_FOR_PAYMENT_OUTCOME';
      order.saga.lastError = 'Remote payment outcome is unknown';
      order.saga.updatedAt = this.now();
      order.updatedAt = order.saga.updatedAt;
      this.emitOutbox(orderId, 'order.requires_attention', {
        orderId,
        state: order.status,
        reason: 'Unknown payment outcome',
      });
      return this.snapshot(order);
    }

    throw new Error(`Unsupported payment outcome: ${String(outcome)}`);
  }

  public confirmStock(orderId: string): OrderRecord {
    const order = this.requireOrder(orderId);
    order.status = 'confirming_stock';
    order.saga.phase = 'CONFIRMING_STOCK';
    order.saga.substate = 'CONFIRMING_INVENTORY';
    order.saga.updatedAt = this.now();
    order.updatedAt = order.saga.updatedAt;

    for (const item of order.items) {
      item.status = 'confirmed';
    }

    order.status = 'confirmed';
    order.saga.phase = 'CONFIRMED';
    order.saga.substate = 'COMPLETED';
    order.saga.compensationRequired = false;
    order.saga.lastError = undefined;
    order.saga.updatedAt = this.now();
    order.updatedAt = order.saga.updatedAt;

    this.emitOutbox(orderId, 'inventory.stock.confirmed', {
      orderId,
      reservationId: order.reservationId,
      items: order.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
    });
    this.emitOutbox(orderId, 'order.confirmed', {
      orderId,
      paymentId: order.paymentId,
      totalMinor: order.totalMinor,
    });
    return this.snapshot(order);
  }

  public failOrder(orderId: string, reason: string): OrderRecord {
    const order = this.requireOrder(orderId);
    order.status = 'failed';
    order.saga.phase = 'COMPENSATING';
    order.saga.substate = 'INITIATING_COMPENSATION';
    order.saga.compensationRequired = true;
    order.saga.lastError = reason;
    order.saga.updatedAt = this.now();
    order.updatedAt = order.saga.updatedAt;
    this.emitOutbox(orderId, 'order.failed', {
      orderId,
      reason,
      paymentId: order.paymentId,
    });

    return this.compensate(orderId, reason);
  }

  public cancelOrder(orderId: string, reason: string): OrderRecord {
    const order = this.requireOrder(orderId);
    if (order.status === 'confirmed' || order.status === 'cancelled') {
      return this.snapshot(order);
    }

    order.status = 'compensating';
    order.saga.phase = 'COMPENSATING';
    order.saga.substate = 'CANCELLING_BY_REQUEST';
    order.saga.compensationRequired = true;
    order.saga.lastError = reason;
    order.saga.updatedAt = this.now();
    order.updatedAt = order.saga.updatedAt;

    return this.compensate(orderId, reason);
  }

  public compensate(orderId: string, reason: string): OrderRecord {
    const order = this.requireOrder(orderId);
    order.status = 'compensating';
    order.saga.phase = 'COMPENSATING';
    order.saga.substate = 'RELEASING_RESERVATION_AND_REFUNDING';
    try {
      const compensationHandler = this.compensationHandlers.get(orderId);
      if (compensationHandler) {
        const result = compensationHandler();
        if (result && typeof (result as Promise<void>).then === 'function') {
          void (result as Promise<void>).catch((error: unknown) => {
            this.markCompensationFailure(orderId, error);
          });
          return this.markCompensationFailure(orderId, 'compensator failed');
        }
      }

      if (order.reservationId) {
        this.emitOutbox(orderId, 'inventory.stock.released', {
          orderId,
          reservationId: order.reservationId,
          reason,
        });
      }
      if (order.paymentId) {
        this.emitOutbox(orderId, 'payment.refunded', {
          orderId,
          paymentId: order.paymentId,
          amountMinor: order.totalMinor,
          reason,
        });
      }
      for (const item of order.items) {
        item.status = 'released';
      }
      order.status = 'cancelled';
      order.saga.phase = 'CANCELLED';
      order.saga.substate = 'COMPENSATED';
      order.saga.compensationRequired = false;
      order.saga.lastError = undefined;
      order.saga.updatedAt = this.now();
      order.updatedAt = order.saga.updatedAt;
      this.emitOutbox(orderId, 'order.cancelled', {
        orderId,
        reason,
        paymentId: order.paymentId,
      });
      return this.snapshot(order);
    } catch (error) {
      return this.markCompensationFailure(orderId, error);
    }
  }

  public reconcileUnknownPayments(): OrderRecord[] {
    const results: OrderRecord[] = [];
    for (const order of this.orders.values()) {
      if (order.status === 'payment_unknown') {
        order.status = 'requires_attention';
        order.saga.phase = 'REQUIRES_ATTENTION';
        order.saga.substate = 'UNKNOWN_PAYMENT_ESCALATED';
        order.saga.compensationRequired = true;
        order.saga.updatedAt = this.now();
        order.updatedAt = order.saga.updatedAt;
        this.emitOutbox(order.id, 'order.requires_attention', {
          orderId: order.id,
          stuckState: 'payment_unknown',
          reason: 'Payment outcome reconciliation exceeded limits',
        });
        results.push(this.snapshot(order));
      }
    }
    return results;
  }

  public claimPendingOrdersForUpdateSkipLocked(limit = 50): string[] {
    const skipLockedSql = 'SELECT id FROM orders WHERE status IN (\'created\', \'reserving\', \'reserved\', \'payment_pending\', \'payment_unknown\') FOR UPDATE SKIP LOCKED LIMIT $1;';
    void skipLockedSql;

    const eligible = [...this.orders.values()]
      .filter((order) => !['confirmed', 'cancelled', 'requires_attention'].includes(order.status))
      .slice(0, limit)
      .map((order) => order.id);
    return eligible;
  }

  public drainOutbox(): OrderEvent[] {
    const events = [...this.outbox];
    this.outbox.length = 0;
    return events;
  }

  public exportState(): { orders: OrderRecord[]; outbox: OrderEvent[] } {
    return {
      orders: [...this.orders.values()].map((order) => this.snapshot(order)),
      outbox: [...this.outbox],
    };
  }

  public hydrate(snapshot: { orders: OrderRecord[]; outbox?: OrderEvent[] }): void {
    this.orders.clear();
    this.outbox.length = 0;
    for (const order of snapshot.orders) {
      this.orders.set(order.id, { ...order, items: order.items.map((item) => ({ ...item })), saga: { ...order.saga } });
    }
    if (snapshot.outbox) {
      this.outbox.push(...snapshot.outbox.map((event) => ({ ...event, payload: { ...event.payload } })));
    }
  }

  public getOrder(orderId: string): OrderRecord | undefined {
    const order = this.orders.get(orderId);
    return order ? this.snapshot(order) : undefined;
  }

  public registerCompensationHandler(orderId: string, handler: () => void | Promise<void>): void {
    this.compensationHandlers.set(orderId, handler);
  }

  private markCompensationFailure(orderId: string, error: unknown): OrderRecord {
    const order = this.requireOrder(orderId);
    order.status = 'requires_attention';
    order.saga.phase = 'REQUIRES_ATTENTION';
    order.saga.substate = 'COMPENSATION_FAILED';
    order.saga.compensationRequired = true;
    order.saga.lastError = error instanceof Error ? error.message : String(error);
    order.saga.updatedAt = this.now();
    order.updatedAt = order.saga.updatedAt;
    this.emitOutbox(orderId, 'order.requires_attention', {
      orderId,
      stuckState: order.status,
      reason: order.saga.lastError,
    });
    return this.snapshot(order);
  }

  private requireOrder(orderId: string): OrderRecord {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }
    return order;
  }

  private emitOutbox(orderId: string, type: string, payload: Record<string, unknown>): void {
    this.outbox.push({
      id: `evt_${Math.random().toString(36).slice(2, 10)}`,
      type,
      payload,
      createdAt: this.now(),
      orderId,
    });
  }

  private snapshot(order: OrderRecord): OrderRecord {
    return {
      ...order,
      items: order.items.map((item) => ({ ...item })),
      saga: { ...order.saga },
    };
  }
}

export const serviceName = 'order';
export const status = 'ready';

