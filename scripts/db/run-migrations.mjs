import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationDir = path.resolve(__dirname, 'migrations');

const connectionString = [
  'postgresql://',
  process.env.PGUSER ?? 'stockflow_app',
  ':',
  encodeURIComponent(process.env.PGPASSWORD ?? 'stockflow_app'),
  '@',
  process.env.PGHOST ?? 'localhost',
  ':',
  process.env.PGPORT ?? '5432',
  '/',
  process.env.PGDATABASE ?? 'identity_db'
].join('');

const result = spawnSync(
  process.execPath,
  [
    path.resolve(__dirname, '..', '..', 'node_modules', 'node-pg-migrate', 'bin', 'node-pg-migrate'),
    '--migrations-dir',
    migrationDir,
    '--database-url',
    connectionString,
    'up',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      PGHOST: process.env.PGHOST ?? 'localhost',
      PGUSER: process.env.PGUSER ?? 'stockflow_app',
      PGPASSWORD: process.env.PGPASSWORD ?? 'stockflow_app',
      PGDATABASE: process.env.PGDATABASE ?? 'identity_db',
      PGPORT: process.env.PGPORT ?? '5432',
    },
  }
);

process.exit(result.status ?? 1);
