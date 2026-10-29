# StockFlow Monorepo Skeleton

This repository captures the PRD-driven architecture for the StockFlow inventory and order management platform. The current state is intentionally a skeleton only: no business logic has been implemented yet.

## Included architecture

- API Gateway (Express 5)
- Identity service
- Catalog service
- Inventory service
- Order service
- Payment service
- Notification service
- Audit service
- Shared contracts, platform, and config packages
- PostgreSQL service databases and migration runner
- Redis, RabbitMQ, and MinIO infrastructure
- Protobuf contract generation via Buf

## Tooling baseline

- Node.js 24 LTS
- TypeScript 5.9+
- pnpm workspaces
- Turbo monorepo orchestration
- tsup for package builds
- Buf + Protobuf for contract generation
- Docker Compose for local integration services

## Repository layout

```text
apps/
  gateway/
services/
  identity/
  catalog/
  inventory/
  order/
  payment/
  notification/
  audit/
packages/
  contracts/
  platform/
  shared-config/
docs/
  stockflow/
```

## Validation

Run:

```bash
pnpm install
pnpm build
pnpm test
pnpm proto:generate
```

If Docker is available locally, you can also start the backing services:

```bash
docker compose up -d
```

This verifies the workspace, contract pipeline, and infrastructure scaffolding before business logic is added.
