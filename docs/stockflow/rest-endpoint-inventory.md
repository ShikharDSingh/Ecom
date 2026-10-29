# REST endpoint inventory

The PRD mandates a single versioned public API at `/api/v1` and a thin gateway that does not own business rules. The following inventory is derived from the API catalogue and gateway responsibilities.

| Method | Path | Purpose | Permission | Idempotency |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/auth/register` | Customer self-signup | public | No |
| POST | `/api/v1/auth/login` | Login and issue tokens | public | No |
| POST | `/api/v1/auth/refresh` | Rotate refresh token | refresh cookie or token | No |
| POST | `/api/v1/auth/logout` | Revoke current session | authenticated | No |
| GET | `/api/v1/me/sessions` | List active sessions | authenticated | No |
| POST | `/api/v1/me/sessions/{sessionId}/revoke` | Revoke session | authenticated | No |
| GET | `/api/v1/catalog/products` | Search and list products | catalog:product:R | No |
| GET | `/api/v1/catalog/products/{id}` | Product detail | catalog:product:R | No |
| POST | `/api/v1/catalog/products` | Create product | catalog:product:W | No |
| PATCH | `/api/v1/catalog/products/{id}` | Update product | catalog:product:W | Yes, with ETag |
| DELETE | `/api/v1/catalog/products/{id}` | Archive product | catalog:product:D | No |
| GET | `/api/v1/catalog/categories` | List categories | catalog:category:R | No |
| POST | `/api/v1/catalog/categories` | Create category | catalog:category:W | No |
| PATCH | `/api/v1/catalog/categories/{id}` | Update category | catalog:category:W | Yes, with ETag |
| POST | `/api/v1/inventory/warehouses` | Create warehouse | inventory:warehouse:W | No |
| GET | `/api/v1/inventory/warehouses` | List warehouses | inventory:warehouse:R | No |
| GET | `/api/v1/inventory/stock` | Check inventory balances | inventory:stock:R | No |
| POST | `/api/v1/inventory/adjustments` | Manual stock adjustment | inventory:adjust:W | Required |
| POST | `/api/v1/inventory/transfers` | Transfer stock between warehouses | inventory:transfer:W | Required |
| GET | `/api/v1/orders` | List orders | order:order:R | No |
| POST | `/api/v1/orders` | Create order | order:order:W | Required |
| GET | `/api/v1/orders/{id}` | Fetch order | order:order:R | No |
| GET | `/api/v1/orders/{id}/status` | Status polling | order:order:R | No |
| POST | `/api/v1/orders/{id}/cancel` | Cancel order | order:cancel:W | Required |
| GET | `/api/v1/payments/{id}` | Payment status | payment:payment:R | No |
| POST | `/api/v1/payments/{id}/refunds` | Refund payment | payment:refund:W | Required |
| GET | `/api/v1/notifications` | List user notifications | notification:notification:R | No |
| GET | `/api/v1/audit/events` | Read audit log | audit:event:R | No |
| GET | `/api/v1/healthz` | Liveness check | public | No |
| GET | `/api/v1/readyz` | Readiness | public | No |
| GET | `/api/v1/openapi.json` | Generated OpenAPI spec | public | No |

## Gateway invariants

- All 4xx/5xx responses use RFC 9457 Problem Details.
- `X-Correlation-Id` is accepted and returned.
- Cursor pagination is required; offset pagination is not offered.
- `Idempotency-Key` is required for mutation endpoints that change state.
- Rate limits are enforced at the gateway with Redis sliding windows.
- `If-Match` and `ETag` are required for PATCH operations on mutable resources.
