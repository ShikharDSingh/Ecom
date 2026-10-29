exports.shorthands = undefined;

exports.up = async (pgm) => {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
  pgm.createSchema('identity', { ifNotExists: true });
  pgm.createSchema('catalog', { ifNotExists: true });
  pgm.createSchema('inventory', { ifNotExists: true });
  pgm.createSchema('orders', { ifNotExists: true });
  pgm.createSchema('payments', { ifNotExists: true });
  pgm.createSchema('notifications', { ifNotExists: true });
  pgm.createSchema('audit', { ifNotExists: true });

  pgm.createTable({ schema: 'identity', name: 'users' }, {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email: { type: 'text', notNull: true, unique: true },
    password_hash: { type: 'text', notNull: true },
    role: { type: 'text', notNull: true, default: 'customer' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable({ schema: 'catalog', name: 'products' }, {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    sku: { type: 'text', notNull: true, unique: true },
    name: { type: 'text', notNull: true },
    unit_price_cents: { type: 'bigint', notNull: true },
    status: { type: 'text', notNull: true, default: 'active' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable({ schema: 'inventory', name: 'stock_items' }, {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    sku: { type: 'text', notNull: true, unique: true },
    available_quantity: { type: 'bigint', notNull: true, default: 0 },
    reserved_quantity: { type: 'bigint', notNull: true, default: 0 },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable({ schema: 'orders', name: 'orders' }, {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true },
    status: { type: 'text', notNull: true, default: 'pending' },
    total_cents: { type: 'bigint', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable({ schema: 'orders', name: 'order_items' }, {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    order_id: { type: 'uuid', notNull: true },
    sku: { type: 'text', notNull: true },
    quantity: { type: 'bigint', notNull: true },
    unit_price_cents: { type: 'bigint', notNull: true },
  });

  pgm.createTable({ schema: 'payments', name: 'payments' }, {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    order_id: { type: 'uuid', notNull: true },
    status: { type: 'text', notNull: true, default: 'initialized' },
    amount_cents: { type: 'bigint', notNull: true },
    provider: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable({ schema: 'notifications', name: 'outbox_events' }, {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    aggregate_type: { type: 'text', notNull: true },
    aggregate_id: { type: 'uuid', notNull: true },
    event_type: { type: 'text', notNull: true },
    payload: { type: 'jsonb', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable({ schema: 'audit', name: 'audit_log' }, {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    actor_id: { type: 'uuid' },
    entity_type: { type: 'text', notNull: true },
    entity_id: { type: 'uuid', notNull: true },
    action: { type: 'text', notNull: true },
    metadata: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

exports.down = async (pgm) => {
  pgm.dropTable({ schema: 'audit', name: 'audit_log' });
  pgm.dropTable({ schema: 'notifications', name: 'outbox_events' });
  pgm.dropTable({ schema: 'payments', name: 'payments' });
  pgm.dropTable({ schema: 'orders', name: 'order_items' });
  pgm.dropTable({ schema: 'orders', name: 'orders' });
  pgm.dropTable({ schema: 'inventory', name: 'stock_items' });
  pgm.dropTable({ schema: 'catalog', name: 'products' });
  pgm.dropTable({ schema: 'identity', name: 'users' });
  pgm.dropSchema('audit', { cascade: true });
  pgm.dropSchema('notifications', { cascade: true });
  pgm.dropSchema('payments', { cascade: true });
  pgm.dropSchema('orders', { cascade: true });
  pgm.dropSchema('inventory', { cascade: true });
  pgm.dropSchema('catalog', { cascade: true });
  pgm.dropSchema('identity', { cascade: true });
};
