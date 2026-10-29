CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'stockflow_app') THEN
    CREATE ROLE stockflow_app LOGIN PASSWORD 'stockflow_app';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'stockflow_admin') THEN
    CREATE ROLE stockflow_admin LOGIN PASSWORD 'stockflow_admin';
  END IF;
END $$;

SELECT 'CREATE DATABASE stockflow OWNER stockflow_admin'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'stockflow')\gexec

SELECT 'CREATE DATABASE identity_db OWNER stockflow_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'identity_db')\gexec

SELECT 'CREATE DATABASE catalog_db OWNER stockflow_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'catalog_db')\gexec

SELECT 'CREATE DATABASE inventory_db OWNER stockflow_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'inventory_db')\gexec

SELECT 'CREATE DATABASE orders_db OWNER stockflow_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'orders_db')\gexec

SELECT 'CREATE DATABASE payments_db OWNER stockflow_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'payments_db')\gexec

SELECT 'CREATE DATABASE notifications_db OWNER stockflow_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'notifications_db')\gexec

SELECT 'CREATE DATABASE audit_db OWNER stockflow_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'audit_db')\gexec;
