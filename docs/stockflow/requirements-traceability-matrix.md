# Requirements traceability matrix

This matrix is derived from the PRD and validates the requirement IDs and acceptance-criterion references in Section 5 onward against Section 19 (acceptance criteria).

## FR requirements

| ID | Requirement | Priority | Owner | AC refs |
| --- | --- | --- | --- | --- |
| FR-001 | Register user with email + password and case-insensitive uniqueness | Must | Identity | AC-001 |
| FR-002 | Login issues access JWT + rotating refresh token | Must | Identity | AC-001 |
| FR-003 | Refresh rotates token family; family lifetime 30 days | Must | Identity | AC-002 |
| FR-004 | Token reuse revokes entire family and emits session revoked event | Must | Identity | AC-003 |
| FR-005 | Users list and revoke active sessions; admin revokes any session | Must | Identity | AC-004, AC-005 |
| FR-006 | Revoked/expired sessions rejected on next protected request | Must | Identity, Gateway | AC-004 |
| FR-007 | Session expiry audited within 5 minutes | Must | Identity, Audit | AC-006 |
| FR-008 | Login throttling with progressive backoff and IP rate limits | Must | Identity, Gateway | AC-029 |
| FR-009 | Role and warehouse changes are audited and revoke affected sessions | Must | Identity | AC-030, AC-039 |
| FR-010 | MFA for staff roles | Could | Identity | — |
| FR-011 | CRUD products with SKU, price, status, threshold | Must | Catalog | AC-007 |
| FR-012 | CRUD categories with archive semantics and product guard | Must | Catalog | AC-007 |
| FR-013 | Product search, filter, sort, cursor pagination | Must | Catalog | AC-009, AC-045 |
| FR-014 | Cache-aside invalidation for product reads | Must | Catalog | AC-008 |
| FR-015 | Private media upload with presigned PUT and content sniffing | Should | Catalog | AC-040 |
| FR-016 | Price changes never mutate historical orders | Must | Catalog, Order | AC-046 |
| FR-017 | CRUD warehouses with status and priority | Must | Inventory | AC-012 |
| FR-018 | Per-warehouse SKU balance with generated `available` and no negative values | Must | Inventory | AC-010 |
| FR-019 | Reserve stock atomically across one or more warehouses | Must | Inventory | AC-010 |
| FR-020 | Confirm reservation decrements on_hand and reserved, writes SALE movement | Must | Inventory | AC-016 |
| FR-021 | Release reservation is idempotent and decrements reserved | Must | Inventory | AC-011, AC-017 |
| FR-022 | Reservation TTL sweeper releases expired reservations and emits release event | Must | Inventory | AC-011 |
| FR-023 | Manual adjustments require reason codes and cannot drive available below zero | Must | Inventory | AC-012 |
| FR-024 | Transfers are single-transaction paired movement entries | Must | Inventory | AC-013 |
| FR-025 | Immutable movement ledger for all balance changes | Must | Inventory | AC-014 |
| FR-026 | Inventory service validates catalog product existence before writing balances | Must | Inventory, Catalog | AC-015 |
| FR-027 | Low-stock threshold fairness and alerting | Must | Inventory | AC-015 |
| FR-028 | Order can include multiple warehouses and priority-based allocations | Must | Order | AC-010 |
| FR-029 | Customer can create order and receive `202 Accepted` flow | Must | Order | AC-018 |
| FR-030 | Order status polling exists and final state is visible after saga resolution | Must | Order | AC-018 |
| FR-031 | Order cancel request is idempotent and respects state transitions | Must | Order | AC-019 |
| FR-032 | Orders are immutable after confirmation; cancellations require refund or release logic | Must | Order | AC-017 |
| FR-033 | Multiple warehouse order items hold allocation metadata | Must | Order | AC-020 |
| FR-034 | Payment is simulated, authorize-and-capture in a single call | Must | Payment | AC-016 |
| FR-035 | Payment idempotency prevents duplicate charges | Must | Payment | AC-018 |
| FR-036 | Refunds are processed as a separate operation with policy checks | Must | Payment | AC-021 |
| FR-037 | Payment failures emit domain events and trigger order failure path | Must | Payment, Order | AC-022 |
| FR-038 | Notification sends user-visible updates for lifecycle events | Must | Notification | AC-023 |
| FR-039 | Audit records believe all key actions and security events | Must | Audit | AC-024 |
| FR-040 | Daily summaries and reconciliation for expired sessions and stale data | Must | Audit | AC-025 |
| FR-041 | API gateway handles auth, routing, rate limits, and correlation IDs | Must | Gateway | AC-026 |
| FR-042 | All services implement health, readiness, and metrics | Must | All services | AC-027 |
| FR-043 | Cross-service dependencies use gRPC + mTLS with deadlines and explicit routing | Must | Architecture | AC-028 |
| FR-044 | Domain events use RabbitMQ outbox + idempotent consumers | Must | MQ | AC-032 |
| FR-045 | Background jobs and sweeps are resilient, lock-safe, and idempotent | Must | Redis, Order | AC-033 |
| FR-046 | All services expose Docker-ready builds and health checks | Must | DevOps | AC-034 |
| FR-047 | CI includes Semgrep, image scanning, and contract validation | Must | DevSecOps | AC-035 |
| FR-048 | SAST steps are merge-blocking | Must | DevSecOps | AC-036 |
| FR-049 | Observability includes logs, traces, and metrics for all services | Must | Observability | AC-037 |
| FR-050 | NFR constraints (load, latency, concurrency) are validated by the test suite | Must | QA | AC-038 |
| FR-051 | UI is operational but intentionally limited to admin/customer order views | Must | UX | AC-039 |
| FR-052 | Internal system remains within single-currency, single-region MVP assumptions | Must | Product | AC-040 |

## Architecture and interface requirements

| ID | Topic | Notes |
| --- | --- | --- |
| ARCH-001 to ARCH-011 | Architecture constraints | Service boundaries, local dev topology, gRPC-only internal calls, shared library rules, and ADR requirement |
| API-001 to API-011 | REST standards | Base path, OpenAPI generation, error schema, pagination, idempotency, rate limits, ETag, CORS behavior |
| GRPC-001 to GRPC-015 | gRPC engineering | Deadline propagation, request validation, mTLS, retry, circuit breaking, health, and unknown outcome policy |
| MQ-001 to MQ-014 | Messaging and outbox | transactional outbox, durable routing, consumer dedupe, retry policies, DLQ processing, replay CLI |
| REDIS-001 to REDIS-027 | Redis usage | cache-aside, session hot state, key expiry notifications, sweeper coordination, and rate limiting |
| DB-001 to DB-018 | Database design | service schemas, outbox, processed_event tables, movement and reservation tables, sessions, etc. |
| SAGA-001 to SAGA-011 | Saga model | state machine transitions, compensation behavior, reconciliation logic, and unknown outcome transitions |

## Acceptance criteria coverage

| AC ID | Coverage theme |
| --- | --- |
| AC-001 | Registration and login flows |
| AC-002 | Refresh token rotation |
| AC-003 | Session/revocation security |
| AC-004 to AC-006 | Session and expiry auditing |
| AC-007 to AC-009 | Product catalog and search |
| AC-010 to AC-017 | Inventory and reservation correctness |
| AC-018 to AC-023 | Order flow, payment, and notification |
| AC-024 to AC-028 | Audit and architecture obligations |
| AC-029 to AC-039 | Security, rate limits, and role management |
| AC-040 to AC-046 | Media, release policy, and historical price correctness |

This matrix is intentionally versioned to the PRD and should be treated as the source of truth for subsequent design, backlog, and implementation work.
