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
- Shared contracts and platform packages

## Tooling baseline

- Node.js 24 LTS
- TypeScript 5.9+
- pnpm workspaces
- Turbo monorepo orchestration
- tsup for package builds

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
pnpm exec turbo run build
```

This verifies the workspace, TS config, and build tooling work before business logic is added.
