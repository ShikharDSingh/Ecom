# Event catalogue

The PRD mandates a durable topic exchange, transactional outbox, and idempotent consumer pattern. The routing keys below are the canonical domain events.

| Routing key | Producer | Consumers | Notes |
| --- | --- | --- | --- |
| `catalog.product.created` | Catalog | Audit | productId, sku, priceMinor |
| `catalog.product.updated` | Catalog | Audit | productId, changed fields, version |
| `catalog.product.archived` | Catalog | Inventory, Audit | productId, sku |
| `inventory.stock.reserved` | Inventory | Audit | reservationId, orderId, allocations |
| `inventory.stock.released` | Inventory | Order, Audit | reservationId, orderId, reason |
| `inventory.stock.confirmed` | Inventory | Audit | reservationId, orderId |
| `inventory.stock.adjusted` | Inventory | Audit | movement ids, actor, reason |
| `inventory.stock.transferred` | Inventory | Audit | movement ids, actor |
| `inventory.stock.low` | Inventory | Notification, Audit | productId, warehouseId, available, threshold |
| `order.created` | Order | Notification, Audit | orderId, customerId, totalMinor |
| `order.confirmed` | Order | Notification, Audit | orderId, paymentId |
| `order.cancelled` | Order | Notification, Audit | orderId, reason, refundId? |
| `order.failed` | Order | Notification, Audit | orderId, failureCode |
| `order.requires_attention` | Order | Notification, Audit | orderId, stuckState |
| `payment.succeeded` | Payment | Order, Audit | paymentId, orderId, amountMinor |
| `payment.failed` | Payment | Order, Notification, Audit | paymentId, orderId, declineCode |
| `payment.refunded` | Payment | Notification, Audit | refundId, paymentId, amountMinor |
| `identity.session.expired` | Identity | Audit | sessionId, userId, expiredAt, detectedBy |
| `identity.session.revoked` | Identity | Notification (reuse only), Audit | sessionId, userId, reason |
| `identity.user.registered` | Identity | Audit | userId, roles |
| `identity.user.role_changed` | Identity | Audit | userId, roles |
| `audit.security.*` | Identity, Gateway | Audit | login success/failure, rate-limit blocks |

## Messaging topology

- Exchange: `domain.events` topic, durable
- Exchange: `domain.retry` direct, durable
- Exchange: `domain.dlx` topic, durable
- Consumer queues are durable quorum queues with dead-letter routing and delayed retry queues.
- Consumers use manual ack, prefetch 20, and idempotent processing via a `processed_events` table.

## Envelope model

```json
{
  "eventId": "uuid",
  "type": "order.confirmed",
  "schemaVersion": 1,
  "occurredAt": "2026-10-29T00:00:00Z",
  "producer": "order-svc@1.4.0",
  "aggregateType": "order",
  "aggregateId": "order-123",
  "aggregateVersion": 4,
  "correlationId": "uuid",
  "causationId": "uuid",
  "actor": { "type": "service", "id": "order-svc" },
  "data": {}
}
```

## Delivery rules from the PRD

- Outbox insert and business write happen in the same PostgreSQL transaction.
- Publisher confirms are mandatory.
- Delivery semantics are at-least-once only.
- Consumers dedupe by `(consumer, event_id)` and ack after transaction commit.
- Invalid or poison payloads are routed to DLQ after policy-based classification.
