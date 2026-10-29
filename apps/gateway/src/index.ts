import express, { type Request, type Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

export function createGatewayApp(config: {
  identityUrl?: string;
  catalogUrl?: string;
  inventoryUrl?: string;
} = {}): express.Express {
  const app = express();

  app.use('/identity', createProxyMiddleware({
    target: config.identityUrl ?? 'http://localhost:4001',
    changeOrigin: true,
    pathRewrite: { '^/identity': '' },
  }));

  app.use('/catalog', createProxyMiddleware({
    target: config.catalogUrl ?? 'http://localhost:4002',
    changeOrigin: true,
    pathRewrite: { '^/catalog': '' },
  }));

  app.use('/inventory', createProxyMiddleware({
    target: config.inventoryUrl ?? 'http://localhost:4003',
    changeOrigin: true,
    pathRewrite: { '^/inventory': '' },
  }));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'gateway' });
  });

  return app;
}

export const serviceName = 'gateway';
export const status = 'ready';

