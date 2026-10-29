import express, { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';

export type CatalogProduct = {
  id: string;
  sku: string;
  name: string;
  description: string;
  priceCents: number;
  warehouseIds: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export class CatalogService {
  private readonly products = new Map<string, CatalogProduct>();
  private readonly cache = new Map<string, CacheEntry<CatalogProduct[]>>();
  private readonly skuIndex = new Map<string, CatalogProduct>();

  constructor(private readonly cacheTtlMs = 60_000) {}

  public upsertProduct(input: Omit<CatalogProduct, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): CatalogProduct {
    const now = new Date().toISOString();
    const existing = this.skuIndex.get(input.sku);
    const product: CatalogProduct = {
      id: input.id ?? existing?.id ?? randomUUID(),
      sku: input.sku,
      name: input.name,
      description: input.description,
      priceCents: input.priceCents,
      warehouseIds: input.warehouseIds ?? [],
      active: input.active ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.products.set(product.id, product);
    this.skuIndex.set(product.sku, product);
    this.cache.clear();
    return { ...product };
  }

  public listProducts(warehouseId?: string): CatalogProduct[] {
    const cacheKey = warehouseId ?? '__all__';
    const cached = this.cache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.value.map((item) => ({ ...item }));
    }

    const list = Array.from(this.products.values())
      .filter((product) => product.active)
      .filter((product) => !warehouseId || product.warehouseIds.length === 0 || product.warehouseIds.includes(warehouseId))
      .map((product) => ({ ...product }));

    this.cache.set(cacheKey, { value: list, expiresAt: now + this.cacheTtlMs });
    return list;
  }

  public getProductBySku(sku: string): CatalogProduct | undefined {
    const product = this.skuIndex.get(sku);
    return product ? { ...product } : undefined;
  }

  public getProductById(id: string): CatalogProduct | undefined {
    const product = this.products.get(id);
    return product ? { ...product } : undefined;
  }

  public invalidateCache(): void {
    this.cache.clear();
  }
}

export function createCatalogApp(service = new CatalogService()): express.Express {
  const app = express();
  app.use(express.json());

  app.get('/v1/products', (req: Request, res: Response) => {
    const warehouseId = typeof req.query.warehouseId === 'string' ? req.query.warehouseId : undefined;
    res.json(service.listProducts(warehouseId));
  });

  app.get('/v1/products/:sku', (req: Request, res: Response) => {
    const sku = typeof req.params.sku === 'string' ? req.params.sku : '';
    if (!sku) {
      return res.status(400).json({ error: 'Product SKU is required' });
    }
    const product = service.getProductBySku(sku);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    return res.json(product);
  });

  return app;
}

export const serviceName = 'catalog';
export const status = 'ready';

