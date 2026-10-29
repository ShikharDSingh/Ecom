# StockFlow implementation plan

## Scope and working assumptions

This is a design-only plan derived from the PRD, not a business-logic implementation. The platform is a TypeScript monorepo with eight independently deployable services, a single external REST API at the gateway, internal gRPC calls, and RabbitMQ-based domain events.

## Phase 0 — foundation and contract authoring

1. Finalize the shared contract package: proto definitions, event schemas, and OpenAPI contracts.
2. Establish the monorepo, workspace rules, neutral package boundaries, and CI gate definitions.
3. Define service bootstrap conventions, health endpoints, log and tracing metadata, and environment variables.
4. Freeze key PRD decisions: Node 24/TypeScript 5.9+, Express 5, PostgreSQL 17, Redis 7.4+, RabbitMQ 4.1+, Buf, and pnpm/Turbo.

## Phase 1 — core identity and security

1. Build the Identity service and PostgreSQL schema for users, sessions, refresh-token families, roles, and role assignments.
2. Implement Argon2id password hashing, refresh-token rotation, reuse detection, session revocation, and Redis-backed hot-session state.
3. Add JWT signing keys, JWKS, permission claims, and middleware for session validation and authorization checks.
4. Implement account lockout, rate limiting, and admin role/warehouse management flows.

## Phase 2 — catalog and inventory correctness

1. Create Catalog service with products, categories, imaging, search, and Redis cache-aside invalidation.
2. Create Inventory service with warehouses, balance ledger, reservation records, movement ledger, and reservation sweeper.
3. Add atomic reservation logic using conditional PostgreSQL updates and `CHECK (available >= 0)`.
4. Add transfer processing and manual adjustments with mandatory reason codes.

## Phase 3 — orchestrated order flow

1. Implement Order service as the saga orchestrator and state machine owner.
2. Add order creation, cancellation, and status APIs with idempotency keys and event-driven reconciliation.
3. Integrate Catalog, Inventory, and Payment through gRPC with strict deadlines, retries, and unknown-outcome handling.
4. Implement stock confirmation and release compensation flows and reconciler jobs.

## Phase 4 — payment and notification path

1. Build Payment service with simulated authorize-and-capture flow, idempotent payment records, and refund handling.
2. Add notification fan-out for order, payment, low-stock, and session events.
3. Ensure all outbox and MQ semantics satisfy at-least-once delivery and consumer deduplication rules.

## Phase 5 — audit and observability

1. Implement Audit service and durable event logging.
2. Add Redis/session expiry reconciliation, audit summaries, and administered reports.
3. Add Prometheus metrics, traces, and structured logs for gateway, gRPC, and MQ.
4. Configure Semgrep, image scanning, and CI gating.

## Phase 6 — resilience, QA, and release gates

1. Run Testcontainers-based integration tests for PostgreSQL, Redis, and RabbitMQ.
2. Execute contract, unit, and end-to-end failure scenarios.
3. Validate concurrency, retry, compensation, and session-revocation behavior.
4. Gate all production merges behind automated security, contract, and reliability checks.

## Critical design constraints to preserve

- PostgreSQL remains the source of truth for transactional correctness.
- Redis is never authoritative for inventory or security decisions.
- Outbox + publisher confirms is mandatory for all domain events.
- Every command carries an idempotency key.
- Gateway logic stays thin; business decisions live in service logic.
