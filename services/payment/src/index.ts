export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'declined' | 'timeout' | 'unknown' | 'refunded';

export type PaymentRecord = {
  id: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  idempotencyKey: string;
  providerReference?: string;
  attemptCount: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

export type PaymentAttempt = {
  id: string;
  paymentId: string;
  attemptNumber: number;
  status: PaymentStatus;
  errorCode?: string;
  createdAt: string;
};

export type RefundRecord = {
  id: string;
  paymentId: string;
  orderId: string;
  amountMinor: number;
  status: 'pending' | 'succeeded' | 'failed';
  reason?: string;
  createdAt: string;
};

export type PaymentEvent = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  orderId: string;
};

export type PaymentRequest = {
  orderId: string;
  amountMinor: number;
  currency?: string;
  idempotencyKey?: string;
};

export type PaymentOutcome = 'succeeded' | 'failed' | 'declined' | 'timeout' | 'unknown';

export type SimulatedGateway = {
  invoke: (paymentId: string, amountMinor: number, currency: string) => Promise<PaymentOutcome>;
};

export class PaymentService {
  private readonly payments = new Map<string, PaymentRecord>();
  private readonly attempts = new Map<string, PaymentAttempt[]>();
  private readonly refunds = new Map<string, RefundRecord>();
  private readonly outbox: PaymentEvent[] = [];
  private readonly idempotency = new Map<string, string>();

  constructor(
    private readonly gateway: SimulatedGateway,
    private readonly now = () => new Date().toISOString(),
  ) {}

  public createPayment(input: PaymentRequest): PaymentRecord {
    const key = input.idempotencyKey ?? `${input.orderId}:${input.amountMinor}`;
    const existingId = this.idempotency.get(key);
    if (existingId) {
      return this.snapshot(this.payments.get(existingId)!);
    }

    const paymentId = `pay_${Math.random().toString(36).slice(2, 10)}`;
    const createdAt = this.now();
    const payment: PaymentRecord = {
      id: paymentId,
      orderId: input.orderId,
      amountMinor: input.amountMinor,
      currency: input.currency ?? 'USD',
      status: 'pending',
      idempotencyKey: key,
      attemptCount: 0,
      createdAt,
      updatedAt: createdAt,
    };

    this.payments.set(paymentId, payment);
    this.idempotency.set(key, paymentId);
    this.attempts.set(paymentId, []);
    this.emitOutbox(paymentId, 'payment.pending', {
      paymentId,
      orderId: payment.orderId,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
    });
    return this.snapshot(payment);
  }

  public async processPayment(paymentId: string): Promise<PaymentRecord> {
    const payment = this.requirePayment(paymentId);
    if (payment.status === 'succeeded' || payment.status === 'failed' || payment.status === 'declined' || payment.status === 'refunded') {
      return this.snapshot(payment);
    }

    payment.attemptCount += 1;
    const attempt: PaymentAttempt = {
      id: `attempt_${Math.random().toString(36).slice(2, 9)}`,
      paymentId,
      attemptNumber: payment.attemptCount,
      status: 'pending',
      createdAt: this.now(),
    };
    this.attempts.get(paymentId)?.push(attempt);

    let outcome: PaymentOutcome;
    try {
      outcome = await this.gateway.invoke(payment.id, payment.amountMinor, payment.currency);
    } catch (error) {
      outcome = 'timeout';
      payment.lastError = error instanceof Error ? error.message : String(error);
    }

    if (outcome === 'succeeded') {
      payment.status = 'succeeded';
      payment.providerReference = `prov_${Math.random().toString(36).slice(2, 10)}`;
      payment.updatedAt = this.now();
      this.emitOutbox(paymentId, 'payment.succeeded', {
        paymentId,
        orderId: payment.orderId,
        amountMinor: payment.amountMinor,
        providerReference: payment.providerReference,
      });
      return this.snapshot(payment);
    }

    if (outcome === 'declined' || outcome === 'failed') {
      payment.status = outcome === 'declined' ? 'declined' : 'failed';
      payment.lastError = outcome;
      payment.updatedAt = this.now();
      this.emitOutbox(paymentId, 'payment.failed', {
        paymentId,
        orderId: payment.orderId,
        declineCode: outcome,
        amountMinor: payment.amountMinor,
      });
      return this.snapshot(payment);
    }

    if (outcome === 'timeout') {
      payment.status = 'timeout';
      payment.updatedAt = this.now();
      this.emitOutbox(paymentId, 'payment.timeout', {
        paymentId,
        orderId: payment.orderId,
        amountMinor: payment.amountMinor,
      });
      return this.snapshot(payment);
    }

    payment.status = 'unknown';
    payment.updatedAt = this.now();
    this.emitOutbox(paymentId, 'payment.unknown', {
      paymentId,
      orderId: payment.orderId,
      amountMinor: payment.amountMinor,
    });
    return this.snapshot(payment);
  }

  public async resolveUnknownOutcome(paymentId: string, outcome: PaymentOutcome): Promise<PaymentRecord> {
    const payment = this.requirePayment(paymentId);
    if (payment.status === 'succeeded' || payment.status === 'failed' || payment.status === 'declined' || payment.status === 'refunded') {
      return this.snapshot(payment);
    }

    if (outcome === 'succeeded') {
      payment.status = 'succeeded';
      payment.updatedAt = this.now();
      this.emitOutbox(paymentId, 'payment.succeeded', {
        paymentId,
        orderId: payment.orderId,
        amountMinor: payment.amountMinor,
      });
      return this.snapshot(payment);
    }

    payment.status = outcome === 'declined' ? 'declined' : 'failed';
    payment.updatedAt = this.now();
    this.emitOutbox(paymentId, 'payment.failed', {
      paymentId,
      orderId: payment.orderId,
      amountMinor: payment.amountMinor,
      declineCode: outcome,
    });
    return this.snapshot(payment);
  }

  public async refundPayment(paymentId: string, reason = 'order_cancelled'): Promise<RefundRecord> {
    const payment = this.requirePayment(paymentId);
    const refund: RefundRecord = {
      id: `ref_${Math.random().toString(36).slice(2, 10)}`,
      paymentId,
      orderId: payment.orderId,
      amountMinor: payment.amountMinor,
      status: 'pending',
      reason,
      createdAt: this.now(),
    };

    if (payment.status !== 'succeeded') {
      refund.status = 'failed';
      this.refunds.set(refund.id, refund);
      return refund;
    }

    payment.status = 'refunded';
    payment.updatedAt = this.now();
    refund.status = 'succeeded';
    this.refunds.set(refund.id, refund);
    this.emitOutbox(paymentId, 'payment.refunded', {
      refundId: refund.id,
      paymentId,
      amountMinor: payment.amountMinor,
      orderId: payment.orderId,
      reason,
    });
    return refund;
  }

  public listOutbox(): PaymentEvent[] {
    return [...this.outbox];
  }

  public drainOutbox(): PaymentEvent[] {
    const events = [...this.outbox];
    this.outbox.length = 0;
    return events;
  }

  public exportState(): { payments: PaymentRecord[]; outbox: PaymentEvent[] } {
    return {
      payments: [...this.payments.values()].map((payment) => this.snapshot(payment)),
      outbox: [...this.outbox],
    };
  }

  public hydrate(snapshot: { payments: PaymentRecord[]; outbox?: PaymentEvent[] }): void {
    this.payments.clear();
    this.outbox.length = 0;
    for (const payment of snapshot.payments) {
      this.payments.set(payment.id, { ...payment });
    }
    if (snapshot.outbox) {
      this.outbox.push(...snapshot.outbox.map((event) => ({ ...event, payload: { ...event.payload } })));
    }
  }

  public getPayment(paymentId: string): PaymentRecord | undefined {
    const payment = this.payments.get(paymentId);
    return payment ? this.snapshot(payment) : undefined;
  }

  public getRefund(refundId: string): RefundRecord | undefined {
    return this.refunds.get(refundId);
  }

  private requirePayment(paymentId: string): PaymentRecord {
    const payment = this.payments.get(paymentId);
    if (!payment) {
      throw new Error(`Payment ${paymentId} not found`);
    }
    return payment;
  }

  private snapshot(payment: PaymentRecord): PaymentRecord {
    return { ...payment };
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
}

export const serviceName = 'payment';
export const status = 'ready';

