# gRPC RPC inventory

The PRD requires typed, contract-first internal APIs with strict deadlines, retry budgets, metadata propagation, and service-to-service authentication.

| Service | RPC | Kind | Caller | Deadline | Idempotency |
| --- | --- | --- | --- | --- | --- |
| Catalog | `GetProduct` | query | Gateway | 500 ms | n/a |
| Catalog | `GetProducts` | query | Order, Gateway | 800 ms | n/a |
| Catalog | `ValidateProduct` | query | Inventory | 500 ms | n/a |
| Inventory | `CheckAvailability` | advisory query | Gateway, Order | 500 ms | n/a |
| Inventory | `ReserveStock` | command | Order | 2 s | reservation key = order_id |
| Inventory | `ConfirmStock` | command | Order | 2 s | reservation_id state check |
| Inventory | `ReleaseStock` | command | Order | 2 s | reservation_id state check |
| Inventory | `GetInventory` | query | Gateway, Order | 800 ms | n/a |
| Inventory | `GetReservation` | query | Gateway, Order | 800 ms | n/a |
| Order | `CreateOrder` | command | Gateway | 3 s | idempotency_key |
| Order | `GetOrder` | query | Gateway | 800 ms | n/a |
| Order | `GetOrderStatus` | query | Gateway | 800 ms | n/a |
| Order | `CancelOrder` | command | Gateway | 3 s | idempotency_key |
| Payment | `ProcessPayment` | command | Order | 3 s | idempotency_key = order_id:attempt |
| Payment | `GetPaymentStatus` | query | Order, Gateway | 800 ms | n/a |
| Payment | `ProcessRefund` | command | Order, Gateway | 3 s | refund_key |
| Identity | `ValidateSession` | query | Gateway | 300 ms | n/a |
| Identity | `CheckPermission` | query | Order, Payment | 300 ms | n/a |
| Identity | `GetSigningKeys` | query | all services | 1 s | n/a |
| Inventory | `RestockOrder` | command | Order | 2 s | order_id |
| Identity | `ListUsersByPermission` | query | Notification | 800 ms | n/a |

## Contract engineering rules from the PRD

- `.proto` files are the single source of truth.
- Buf lint and breaking-change detection are required in CI.
- All request messages are validated before use.
- Metadata propagation includes: `x-correlation-id`, `traceparent`, `x-user-id`, `x-user-perms`, and `idempotency-key`.
- Service-to-service auth is mTLS; plaintext gRPC is refused outside test mode.
- End-user authorization is rechecked in the owning service against verified JWT claims.
- Retry is limited to idempotent calls and bounded by the downstream deadline.
- Unknown outcomes are not treated as failures; they are retried and reconciled.
