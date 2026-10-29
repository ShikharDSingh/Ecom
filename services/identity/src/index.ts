import bcrypt from 'bcryptjs';
import express, { type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';

export type IdentityRole = 'customer' | 'staff' | 'warehouse_manager' | 'admin';
export type Permission =
  | 'catalog:read'
  | 'inventory:read'
  | 'inventory:write'
  | 'inventory:transfer'
  | 'inventory:adjust'
  | 'identity:manage';

export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  roles: IdentityRole[];
  warehouses: string[];
  createdAt: string;
  updatedAt: string;
};

export type RefreshSession = {
  refreshToken: string;
  userId: string;
  sessionId: string;
  warehouses: string[];
  revokedAt?: number;
  expiresAt: number;
  createdAt: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type RegisterInput = {
  email: string;
  password: string;
  roles?: IdentityRole[];
  warehouses?: string[];
};

export type LoginInput = {
  email: string;
  password: string;
};

export type JwtClaims = {
  sub: string;
  email: string;
  roles: IdentityRole[];
  warehouses: string[];
  sessionId: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
};

export class IdentityError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
    this.name = 'IdentityError';
  }
}

export class IdentityService {
  private readonly users = new Map<string, UserRecord>();
  private readonly usersByEmail = new Map<string, UserRecord>();
  private readonly refreshSessions = new Map<string, RefreshSession>();
  private readonly revokedRefreshTokens = new Set<string>();

  constructor(private readonly jwtSecret = process.env.JWT_SECRET ?? 'stockflow-dev-secret') {}

  public registerUser(input: RegisterInput): UserRecord {
    const email = input.email.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new IdentityError('A valid email is required', 400);
    }
    if (this.usersByEmail.has(email)) {
      throw new IdentityError('A user with this email already exists', 409);
    }
    if (!input.password || input.password.length < 8) {
      throw new IdentityError('Password must be at least 8 characters long', 400);
    }

    const now = new Date().toISOString();
    const user: UserRecord = {
      id: randomUUID(),
      email,
      passwordHash: bcrypt.hashSync(input.password, 10),
      roles: (input.roles ?? ['customer']).filter(Boolean),
      warehouses: input.warehouses ?? [],
      createdAt: now,
      updatedAt: now,
    };

    this.users.set(user.id, user);
    this.usersByEmail.set(email, user);
    return { ...user };
  }

  public authenticate(input: LoginInput): AuthTokens {
    const user = this.usersByEmail.get(input.email.trim().toLowerCase());
    if (!user) {
      throw new IdentityError('Invalid email or password', 401);
    }
    const valid = bcrypt.compareSync(input.password, user.passwordHash);
    if (!valid) {
      throw new IdentityError('Invalid email or password', 401);
    }

    const sessionId = randomUUID();
    const accessToken = this.signToken({
      sub: user.id,
      email: user.email,
      roles: user.roles,
      warehouses: user.warehouses,
      sessionId,
      type: 'access',
    }, 60 * 60);
    const refreshToken = this.signToken(
      {
        sub: user.id,
        email: user.email,
        roles: user.roles,
        warehouses: user.warehouses,
        sessionId,
        type: 'refresh',
      },
      60 * 60 * 24 * 7,
    );

    const record: RefreshSession = {
      refreshToken,
      userId: user.id,
      sessionId,
      warehouses: user.warehouses,
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
      createdAt: new Date().toISOString(),
    };
    this.refreshSessions.set(refreshToken, record);

    return { accessToken, refreshToken, expiresIn: 60 * 60 };
  }

  public refreshToken(token: string): AuthTokens {
    const existing = this.refreshSessions.get(token);
    if (!existing || this.revokedRefreshTokens.has(token)) {
      throw new IdentityError('Refresh token is invalid or revoked', 401);
    }
    if (existing.expiresAt <= Date.now()) {
      this.refreshSessions.delete(token);
      this.revokedRefreshTokens.add(token);
      throw new IdentityError('Refresh token has expired', 401);
    }

    const user = this.users.get(existing.userId);
    if (!user) {
      throw new IdentityError('User no longer exists', 401);
    }

    const oldToken = token;
    this.revokedRefreshTokens.add(oldToken);
    this.refreshSessions.delete(oldToken);

    const newSessionId = randomUUID();
    const nextRefreshToken = this.signToken(
      {
        sub: user.id,
        email: user.email,
        roles: user.roles,
        warehouses: user.warehouses,
        sessionId: newSessionId,
        type: 'refresh',
      },
      60 * 60 * 24 * 7,
    );

    const nextRecord: RefreshSession = {
      refreshToken: nextRefreshToken,
      userId: user.id,
      sessionId: newSessionId,
      warehouses: user.warehouses,
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
      createdAt: new Date().toISOString(),
    };
    this.refreshSessions.set(nextRefreshToken, nextRecord);

    return {
      accessToken: this.signToken(
        {
          sub: user.id,
          email: user.email,
          roles: user.roles,
          warehouses: user.warehouses,
          sessionId: newSessionId,
          type: 'access',
        },
        60 * 60,
      ),
      refreshToken: nextRefreshToken,
      expiresIn: 60 * 60,
    };
  }

  public revokeSession(refreshToken: string): void {
    if (!refreshToken) {
      throw new IdentityError('A refresh token is required', 400);
    }
    this.revokedRefreshTokens.add(refreshToken);
    this.refreshSessions.delete(refreshToken);
  }

  public revokeAllUserSessions(userId: string): void {
    for (const [token, record] of this.refreshSessions.entries()) {
      if (record.userId === userId) {
        this.revokedRefreshTokens.add(token);
        this.refreshSessions.delete(token);
      }
    }
  }

  public verifyAccessToken(token: string): JwtClaims {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as JwtClaims;
      if (payload.type !== 'access') {
        throw new IdentityError('Token type is not access', 401);
      }
      return payload;
    } catch (error) {
      throw new IdentityError('Access token is invalid', 401);
    }
  }

  public verifyRefreshToken(token: string): JwtClaims {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as JwtClaims;
      if (payload.type !== 'refresh') {
        throw new IdentityError('Token type is not refresh', 401);
      }
      return payload;
    } catch (error) {
      throw new IdentityError('Refresh token is invalid', 401);
    }
  }

  public getUserById(userId: string): UserRecord | undefined {
    return this.users.get(userId) ? { ...this.users.get(userId)! } : undefined;
  }

  public getUserByEmail(email: string): UserRecord | undefined {
    const user = this.usersByEmail.get(email.trim().toLowerCase());
    return user ? { ...user } : undefined;
  }

  public requirePermission(claims: Pick<JwtClaims, 'roles'>, permission: Permission): void {
    const permissionsByRole: Record<IdentityRole, Permission[]> = {
      customer: ['catalog:read'],
      staff: ['catalog:read', 'inventory:read'],
      warehouse_manager: ['catalog:read', 'inventory:read', 'inventory:write', 'inventory:transfer', 'inventory:adjust'],
      admin: ['catalog:read', 'inventory:read', 'inventory:write', 'inventory:transfer', 'inventory:adjust', 'identity:manage'],
    };

    const granted = new Set<string>();
    for (const role of claims.roles) {
      for (const p of permissionsByRole[role] ?? []) {
        granted.add(p);
      }
    }

    if (!granted.has(permission)) {
      throw new IdentityError(`Permission '${permission}' is required`, 403);
    }
  }

  public requireWarehouseScope(claims: Pick<JwtClaims, 'warehouses'>, warehouseId?: string): void {
    if (!warehouseId) {
      return;
    }
    if (!claims.warehouses || claims.warehouses.length === 0) {
      throw new IdentityError('This account is not authorized for the requested warehouse', 403);
    }
    if (!claims.warehouses.includes(warehouseId)) {
      throw new IdentityError(`Warehouse '${warehouseId}' is not in your authorized scope`, 403);
    }
  }

  private signToken(claims: Omit<JwtClaims, 'iat' | 'exp'>, expiresSeconds: number) {
    return jwt.sign({ ...claims, iat: Math.floor(Date.now() / 1000) }, this.jwtSecret, {
      expiresIn: expiresSeconds,
      subject: claims.sub,
    });
  }
}

export function createIdentityApp(service = new IdentityService()): express.Express {
  const app = express();
  app.use(express.json());

  app.post('/v1/auth/register', (req: Request, res: Response) => {
    try {
      const user = service.registerUser(req.body ?? {});
      res.status(201).json({ user });
    } catch (error) {
      const e = error as Error & { statusCode?: number };
      res.status(e.statusCode ?? 500).json({ error: e.message });
    }
  });

  app.post('/v1/auth/login', (req: Request, res: Response) => {
    try {
      res.json(service.authenticate(req.body ?? {}));
    } catch (error) {
      const e = error as Error & { statusCode?: number };
      res.status(e.statusCode ?? 500).json({ error: e.message });
    }
  });

  app.post('/v1/auth/refresh', (req: Request, res: Response) => {
    try {
      const token = String(req.body?.refreshToken ?? '');
      res.json(service.refreshToken(token));
    } catch (error) {
      const e = error as Error & { statusCode?: number };
      res.status(e.statusCode ?? 500).json({ error: e.message });
    }
  });

  app.post('/v1/auth/logout', (req: Request, res: Response) => {
    try {
      const token = String(req.body?.refreshToken ?? '');
      service.revokeSession(token);
      res.status(204).send();
    } catch (error) {
      const e = error as Error & { statusCode?: number };
      res.status(e.statusCode ?? 500).json({ error: e.message });
    }
  });

  app.get('/v1/me', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization ?? '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!bearer) {
      return res.status(401).json({ error: 'Missing bearer token' });
    }

    try {
      const claims = service.verifyAccessToken(bearer);
      const user = service.getUserById(claims.sub);
      return res.json({ user, claims });
    } catch (error) {
      const e = error as Error & { statusCode?: number };
      return res.status(e.statusCode ?? 500).json({ error: e.message });
    }
  });

  return app;
}

export function requireIdentityAuth(service: IdentityService) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization ?? '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!bearer) {
      return res.status(401).json({ error: 'Missing bearer token' });
    }

    try {
      const claims = service.verifyAccessToken(bearer);
      (req as Request & { auth?: JwtClaims }).auth = claims;
      return next();
    } catch (error) {
      const e = error as Error & { statusCode?: number };
      return res.status(e.statusCode ?? 500).json({ error: e.message });
    }
  };
}

export function requirePermission(permission: Permission, service: IdentityService) {
  return (req: Request, res: Response, next: NextFunction) => {
    const claims = (req as Request & { auth?: JwtClaims }).auth;
    if (!claims) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    try {
      service.requirePermission(claims, permission);
      next();
    } catch (error) {
      const e = error as Error & { statusCode?: number };
      res.status(e.statusCode ?? 500).json({ error: e.message });
    }
  };
}

export function requireWarehouseScope(service: IdentityService) {
  return (req: Request, res: Response, next: NextFunction) => {
    const claims = (req as Request & { auth?: JwtClaims }).auth;
    const warehouseId = String(req.params.warehouseId ?? req.query.warehouseId ?? '');
    if (!claims) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    try {
      service.requireWarehouseScope(claims, warehouseId || undefined);
      next();
    } catch (error) {
      const e = error as Error & { statusCode?: number };
      res.status(e.statusCode ?? 500).json({ error: e.message });
    }
  };
}

export const serviceName = 'identity';
export const status = 'ready';

