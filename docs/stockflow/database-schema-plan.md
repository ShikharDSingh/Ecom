# Database schema plan

The PRD keeps each service isolated behind its own PostgreSQL database. Cross-service references are kept as opaque IDs rather than foreign keys to preserve the autonomous service model.

## Identity service

- `users`
  - `id`, `email`, `password_hash`, `status`, `created_at`, `updated_at`
- `roles`
  - `id`, `name`, `permissions`, `created_at`
- `user_roles`
  - `user_id`, `role_id`, `assigned_by`, `assigned_at`
- `sessions`
  - `id`, `user_id`, `family_id`, `status`, `created_at`, `last_seen_at`, `idle_expires_at`, `absolute_expires_at`, `ip_prefix`, `user_agent_hash`
- `refresh_token_families`
  - `id`, `user_id`, `revoked_at`, `issued_at`, `absolute_expires_at`
- `audit_events`
  - durable append-only security and session events
- `outbox`
  - transactional event relay table

## Catalog service

- `products`
  - `id`, `sku`, `name`, `description`, `category_id`, `price_minor`, `status`, `low_stock_threshold`, `created_at`
- `categories`
  - `id`, `parent_id`, `name`, `slug`, `archived_at`
- `product_media`
  - `id`, `product_id`, `object_key`, `mime_type`, `size_bytes`, `created_at`
- `outbox`
  - catalog event stream

## Inventory service

- `warehouses`
  - `id`, `code`, `name`, `address`, `priority`, `status`
- `inventory_balances`
  - `warehouse_id`, `product_id`, `on_hand`, `reserved`, `available`, `updated_at`
- `reservations`
  - `id`, `order_id`, `expires_at`, `status`, `created_at`, `updated_at`
- `reservation_lines`
  - `id`, `reservation_id`, `warehouse_id`, `product_id`, `quantity`
- `movements`
  - `id`, `warehouse_id`, `product_id`, `type`, `reason_code`, `delta`, `reference_id`, `created_at`
- `processed_events`
  - deduplication table for consumed domain events
- `outbox`
  - inventory event stream

## Order service

- `orders`
  - `id`, `customer_id`, `status`, `currency`, `total_minor`, `created_at`, `updated_at`
- `order_items`
  - `id`, `order_id`, `product_id`, `warehouse_id`, `quantity`, `unit_price_minor`, `status`
- `order_status_history`
  - `id`, `order_id`, `from_status`, `to_status`, `reason`, `created_at`
- `saga_state`
  - `order_id`, `phase`, `substate`, `compensation_required`, `last_error`, `updated_at`
- `outbox`
  - order event stream

## Payment service

- `payments`
  - `id`, `order_id`, `amount_minor`, `status`, `idempotency_key`, `provider_reference`, `created_at`
- `payment_attempts`
  - `id`, `payment_id`, `attempt_number`, `status`, `error_code`, `created_at`
- `refunds`
  - `id`, `payment_id`, `order_id`, `amount_minor`, `status`, `reason`, `created_at`
- `outbox`
  - payment event stream

## Notification service

- `notifications`
  - `id`, `user_id`, `template`, `payload`, `status`, `created_at`
- `processed_events`
  - consumer dedupe

## Audit service

- `audit_events`
  - `id`, `event_type`, `aggregate_type`, `aggregate_id`, `actor`, `payload`, `created_at`
- `daily_summaries`
  - `date`, `metric_name`, `metric_value`
- `processed_events`
  - consumer dedupe

## Design rules from the PRD

- `available = on_hand - reserved` is generated or maintained as a constrained value and never negative.
- Reservation, stock confirmation, and stock release are all idempotent and state-checked.
- Movement entries are immutable and append-only.
- Use PostgreSQL row-level rules and constraints rather than application-only checks.
- Keep service boundaries explicit; there are no cross-service foreign keys.
