import express, { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';

export type InventoryStock = {
  sku: string;
  warehouseId: string;
  available: number;
  reserved: number;
  onHand: number;
  lowStockThreshold: number;
  updatedAt: string;
};

export type ReservationStatus = 'held' | 'confirmed' | 'released' | 'expired';

export type Reservation = {
  id: string;
  sku: string;
  warehouseId: string;
  orderId: string;
  quantity: number;
  status: ReservationStatus;
  createdAt: string;
  expiresAt: number;
};

export type InventoryMovement = {
  id: string;
  sku: string;
  warehouseId: string;
  delta: number;
  type: 'reservation' | 'confirmation' | 'release' | 'adjustment' | 'transfer_in' | 'transfer_out';
  reason: string;
  sourceWarehouseId?: string;
  targetWarehouseId?: string;
  createdAt: string;
  immutable: true;
};

export type OutboxEvent = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type ReserveInput = {
  sku: string;
  warehouseId: string;
  orderId: string;
  quantity: number;
  ttlMs?: number;
};

export type AdjustStockInput = {
  sku: string;
  warehouseId: string;
  delta: number;
  reason: string;
};

export type TransferInput = {
  sku: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  reason: string;
};

export type LowStockEventPayload = {
  sku: string;
  warehouseId: string;
  available: number;
  threshold: number;
};

export class InsufficientStockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientStockError';
  }
}

export class InventoryService {
  private readonly stocks = new Map<string, InventoryStock>();
  private readonly reservations = new Map<string, Reservation>();
  private readonly movements: InventoryMovement[] = [];
  private readonly outbox: OutboxEvent[] = [];
  private readonly listeners: Array<(event: OutboxEvent) => void> = [];
  private readonly lowStockFlags = new Set<string>();
  private queue = Promise.resolve();

  constructor(private defaultLowStockThreshold = 10) {}

  public setLowStockThreshold(value: number): void {
    this.defaultLowStockThreshold = value;
  }

  public upsertStock(input: { sku: string; warehouseId: string; available: number; lowStockThreshold?: number }): InventoryStock {
    const key = this.stockKey(input.sku, input.warehouseId);
    const current = this.stocks.get(key);
    const next: InventoryStock = {
      sku: input.sku,
      warehouseId: input.warehouseId,
      available: input.available,
      reserved: current?.reserved ?? 0,
      onHand: (input.available + (current?.reserved ?? 0)),
      lowStockThreshold: input.lowStockThreshold ?? this.defaultLowStockThreshold,
      updatedAt: new Date().toISOString(),
    };
    this.stocks.set(key, next);
    return { ...next };
  }

  public getStock(sku: string, warehouseId: string): InventoryStock | undefined {
    const stock = this.stocks.get(this.stockKey(sku, warehouseId));
    return stock ? { ...stock } : undefined;
  }

  public listStocks(warehouseId?: string): InventoryStock[] {
    const values = Array.from(this.stocks.values());
    if (!warehouseId) {
      return values.map((stock) => ({ ...stock }));
    }
    return values
      .filter((stock) => stock.warehouseId === warehouseId)
      .map((stock) => ({ ...stock }));
  }

  public reserveStock(input: ReserveInput): Promise<Reservation> {
    return this.runSerialized(async () => {
      const stock = this.stocks.get(this.stockKey(input.sku, input.warehouseId));
      if (!stock) {
        throw new InsufficientStockError(`No stock found for ${input.sku} in ${input.warehouseId}`);
      }
      if (stock.available < input.quantity) {
        throw new InsufficientStockError(`Insufficient stock for ${input.sku} in ${input.warehouseId}`);
      }

      const reservation: Reservation = {
        id: randomUUID(),
        sku: input.sku,
        warehouseId: input.warehouseId,
        orderId: input.orderId,
        quantity: input.quantity,
        status: 'held',
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() + (input.ttlMs ?? 60_000),
      };

      stock.available -= input.quantity;
      stock.reserved += input.quantity;
      stock.onHand = stock.available + stock.reserved;
      stock.updatedAt = new Date().toISOString();
      this.reservations.set(reservation.id, reservation);
      this.addMovement({
        id: randomUUID(),
        sku: input.sku,
        warehouseId: input.warehouseId,
        delta: -input.quantity,
        type: 'reservation',
        reason: `reserved for order ${input.orderId}`,
        createdAt: new Date().toISOString(),
        immutable: true,
      });
      this.emitOutbox('inventory.reserved', { reservationId: reservation.id, ...input, status: 'held' });
      this.checkLowStock(stock);
      return { ...reservation };
    });
  }

  public confirmReservation(reservationId: string): Promise<Reservation> {
    return this.runSerialized(async () => {
      const reservation = this.reservations.get(reservationId);
      if (!reservation) {
        throw new Error(`Reservation ${reservationId} not found`);
      }
      if (reservation.status !== 'held') {
        throw new Error(`Reservation ${reservationId} is already ${reservation.status}`);
      }

      const stock = this.stocks.get(this.stockKey(reservation.sku, reservation.warehouseId));
      if (!stock) {
        throw new Error(`Stock record missing for ${reservation.sku}`);
      }

      stock.reserved -= reservation.quantity;
      stock.updatedAt = new Date().toISOString();
      reservation.status = 'confirmed';
      this.addMovement({
        id: randomUUID(),
        sku: reservation.sku,
        warehouseId: reservation.warehouseId,
        delta: -reservation.quantity,
        type: 'confirmation',
        reason: `confirmed reservation ${reservationId}`,
        createdAt: new Date().toISOString(),
        immutable: true,
      });
      this.emitOutbox('inventory.confirmed', { reservationId, sku: reservation.sku, quantity: reservation.quantity });
      return { ...reservation };
    });
  }

  public releaseReservation(reservationId: string): Promise<Reservation> {
    return this.runSerialized(async () => {
      const reservation = this.reservations.get(reservationId);
      if (!reservation) {
        throw new Error(`Reservation ${reservationId} not found`);
      }
      if (reservation.status === 'released' || reservation.status === 'confirmed') {
        return { ...reservation };
      }

      const stock = this.stocks.get(this.stockKey(reservation.sku, reservation.warehouseId));
      if (!stock) {
        throw new Error(`Stock record missing for ${reservation.sku}`);
      }

      stock.available += reservation.quantity;
      stock.reserved -= reservation.quantity;
      stock.onHand = stock.available + stock.reserved;
      stock.updatedAt = new Date().toISOString();
      reservation.status = 'released';
      this.addMovement({
        id: randomUUID(),
        sku: reservation.sku,
        warehouseId: reservation.warehouseId,
        delta: reservation.quantity,
        type: 'release',
        reason: `released reservation ${reservationId}`,
        createdAt: new Date().toISOString(),
        immutable: true,
      });
      this.emitOutbox('inventory.released', { reservationId, sku: reservation.sku, quantity: reservation.quantity });
      return { ...reservation };
    });
  }

  public adjustStock(input: AdjustStockInput): Promise<InventoryStock> {
    return this.runSerialized(async () => {
      const stock = this.stocks.get(this.stockKey(input.sku, input.warehouseId));
      if (!stock) {
        throw new Error(`Stock record missing for ${input.sku}`);
      }

      stock.available += input.delta;
      stock.onHand = stock.available + stock.reserved;
      stock.updatedAt = new Date().toISOString();
      this.addMovement({
        id: randomUUID(),
        sku: input.sku,
        warehouseId: input.warehouseId,
        delta: input.delta,
        type: 'adjustment',
        reason: input.reason,
        createdAt: new Date().toISOString(),
        immutable: true,
      });
      this.checkLowStock(stock);
      return { ...stock };
    });
  }

  public transferStock(input: TransferInput): Promise<{ from: InventoryStock; to: InventoryStock }> {
    return this.runSerialized(async () => {
      const source = this.stocks.get(this.stockKey(input.sku, input.fromWarehouseId));
      const target = this.stocks.get(this.stockKey(input.sku, input.toWarehouseId));

      if (!source || !target) {
        throw new Error(`Stock missing for transfer of ${input.sku}`);
      }
      if (source.available < input.quantity) {
        throw new InsufficientStockError(`Insufficient stock to transfer ${input.sku}`);
      }

      source.available -= input.quantity;
      source.onHand = source.available + source.reserved;
      source.updatedAt = new Date().toISOString();

      target.available += input.quantity;
      target.onHand = target.available + target.reserved;
      target.updatedAt = new Date().toISOString();

      this.addMovement({
        id: randomUUID(),
        sku: input.sku,
        warehouseId: input.fromWarehouseId,
        delta: -input.quantity,
        type: 'transfer_out',
        reason: input.reason,
        sourceWarehouseId: input.fromWarehouseId,
        targetWarehouseId: input.toWarehouseId,
        createdAt: new Date().toISOString(),
        immutable: true,
      });
      this.addMovement({
        id: randomUUID(),
        sku: input.sku,
        warehouseId: input.toWarehouseId,
        delta: input.quantity,
        type: 'transfer_in',
        reason: input.reason,
        sourceWarehouseId: input.fromWarehouseId,
        targetWarehouseId: input.toWarehouseId,
        createdAt: new Date().toISOString(),
        immutable: true,
      });
      this.emitOutbox('inventory.transferred', { sku: input.sku, fromWarehouseId: input.fromWarehouseId, toWarehouseId: input.toWarehouseId, quantity: input.quantity });
      this.checkLowStock(source);
      this.checkLowStock(target);
      return { from: { ...source }, to: { ...target } };
    });
  }

  public getReservation(reservationId: string): Reservation | undefined {
    return this.reservations.get(reservationId) ? { ...this.reservations.get(reservationId)! } : undefined;
  }

  public listReservations(orderId?: string): Reservation[] {
    const values = Array.from(this.reservations.values()).map((reservation) => ({ ...reservation }));
    if (!orderId) {
      return values;
    }
    return values.filter((reservation) => reservation.orderId === orderId);
  }

  public listMovements(sku?: string, warehouseId?: string): InventoryMovement[] {
    return this.movements.filter((movement) => (sku ? movement.sku === sku : true) && (warehouseId ? movement.warehouseId === warehouseId : true));
  }

  public listLowStock(): LowStockEventPayload[] {
    const result: LowStockEventPayload[] = [];
    for (const stock of this.stocks.values()) {
      if (stock.available <= stock.lowStockThreshold) {
        result.push({
          sku: stock.sku,
          warehouseId: stock.warehouseId,
          available: stock.available,
          threshold: stock.lowStockThreshold,
        });
      }
    }
    return result;
  }

  public relayOutbox(): OutboxEvent[] {
    const drained = [...this.outbox];
    this.outbox.length = 0;
    for (const listener of this.listeners) {
      for (const event of drained) {
        listener(event);
      }
    }
    return drained;
  }

  public onOutbox(eventHandler: (event: OutboxEvent) => void): void {
    this.listeners.push(eventHandler);
  }

  public runExpiryWorker(intervalMs = 5_000): () => void {
    const timer = setInterval(() => this.expireReservations(), intervalMs);
    return () => clearInterval(timer);
  }

  public expireReservations(): Reservation[] {
    const expired: Reservation[] = [];
    for (const reservation of this.reservations.values()) {
      if (reservation.status === 'held' && reservation.expiresAt <= Date.now()) {
        reservation.status = 'expired';
        const stock = this.stocks.get(this.stockKey(reservation.sku, reservation.warehouseId));
        if (stock) {
          stock.available += reservation.quantity;
          stock.reserved -= reservation.quantity;
          stock.onHand = stock.available + stock.reserved;
          stock.updatedAt = new Date().toISOString();
        }
        expired.push({ ...reservation });
        this.emitOutbox('inventory.expired', { reservationId: reservation.id, sku: reservation.sku, quantity: reservation.quantity });
      }
    }
    return expired;
  }

  private checkLowStock(stock: InventoryStock): void {
    const key = `${stock.warehouseId}:${stock.sku}`;
    const thresholdReached = stock.available <= stock.lowStockThreshold;
    if (thresholdReached && !this.lowStockFlags.has(key)) {
      this.lowStockFlags.add(key);
      this.emitOutbox('inventory.low_stock', {
        sku: stock.sku,
        warehouseId: stock.warehouseId,
        available: stock.available,
        threshold: stock.lowStockThreshold,
      });
      return;
    }
    if (!thresholdReached) {
      this.lowStockFlags.delete(key);
    }
  }

  private addMovement(movement: Omit<InventoryMovement, 'immutable'> & { immutable: true }): void {
    this.movements.push({ ...movement, immutable: true });
  }

  private emitOutbox(type: string, payload: Record<string, unknown>): void {
    this.outbox.push({
      id: randomUUID(),
      type,
      payload,
      createdAt: new Date().toISOString(),
    });
  }

  private async runSerialized<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }

  private stockKey(sku: string, warehouseId: string): string {
    return `${warehouseId}:${sku}`;
  }
}

export function createInventoryApp(service = new InventoryService()): express.Express {
  const app = express();
  app.use(express.json());

  app.get('/v1/stock', (req: Request, res: Response) => {
    const warehouseId = typeof req.query.warehouseId === 'string' ? req.query.warehouseId : undefined;
    res.json(service.listStocks(warehouseId));
  });

  app.get('/v1/stock/:sku/:warehouseId', (req: Request, res: Response) => {
    const sku = typeof req.params.sku === 'string' ? req.params.sku : '';
    const warehouseId = typeof req.params.warehouseId === 'string' ? req.params.warehouseId : '';
    if (!sku || !warehouseId) {
      return res.status(400).json({ error: 'SKU and warehouse ID are required' });
    }
    const stock = service.getStock(sku, warehouseId);
    if (!stock) {
      return res.status(404).json({ error: 'Stock not found' });
    }
    return res.json(stock);
  });

  app.post('/v1/stock/reserve', async (req: Request, res: Response) => {
    try {
      const reservation = await service.reserveStock(req.body ?? {});
      return res.status(201).json({ reservation });
    } catch (error) {
      const e = error as Error & { statusCode?: number };
      return res.status(e.name === 'InsufficientStockError' ? 409 : 500).json({ error: e.message });
    }
  });

  app.post('/v1/stock/confirm', async (req: Request, res: Response) => {
    try {
      const reservation = await service.confirmReservation(String(req.body?.reservationId ?? ''));
      return res.json({ reservation });
    } catch (error) {
      const e = error as Error & { statusCode?: number };
      return res.status(400).json({ error: e.message });
    }
  });

  app.post('/v1/stock/release', async (req: Request, res: Response) => {
    try {
      const reservation = await service.releaseReservation(String(req.body?.reservationId ?? ''));
      return res.json({ reservation });
    } catch (error) {
      const e = error as Error & { statusCode?: number };
      return res.status(400).json({ error: e.message });
    }
  });

  app.post('/v1/stock/adjust', async (req: Request, res: Response) => {
    try {
      const stock = await service.adjustStock(req.body ?? {});
      return res.json({ stock });
    } catch (error) {
      const e = error as Error;
      return res.status(400).json({ error: e.message });
    }
  });

  app.post('/v1/stock/transfer', async (req: Request, res: Response) => {
    try {
      const result = await service.transferStock(req.body ?? {});
      return res.json(result);
    } catch (error) {
      const e = error as Error;
      return res.status(400).json({ error: e.message });
    }
  });

  app.get('/v1/reservations', (req: Request, res: Response) => {
    const orderId = typeof req.query.orderId === 'string' ? req.query.orderId : undefined;
    res.json(service.listReservations(orderId));
  });

  app.get('/v1/low-stock', (_req: Request, res: Response) => {
    res.json(service.listLowStock());
  });

  return app;
}

export const serviceName = 'inventory';
export const status = 'ready';

