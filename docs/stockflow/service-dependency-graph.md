# Service dependency graph

```mermaid
flowchart LR
  client[Client/UI] --> GW[API Gateway]
  GW --> ID[Identity Service]
  GW --> CAT[Catalog Service]
  GW --> INV[Inventory Service]
  GW --> ORD[Order Service]
  GW --> PAY[Payment Service]
  GW --> NOT[Notification Service]
  GW --> AUD[Audit Service]

  ORD --> CAT
  ORD --> INV
  ORD --> PAY
  INV --> CAT

  ID --> REDIS[(Redis)]
  CAT --> PG[(PostgreSQL)]
  INV --> PG
  ORD --> PG
  PAY --> PG
  NOT --> PG
  AUD --> PG

  CAT --> MQ{{RabbitMQ domain.events}}
  INV --> MQ
  ORD --> MQ
  PAY --> MQ
  ID --> MQ

  MQ --> NOT
  MQ --> AUD
  MQ --> ORD
  MQ --> INV
```

## Dependency notes

- Gateway is the only HTTP-facing component.
- Internal synchronous calls are gRPC only.
- Order service is the orchestrator; Inventory and Payment never call Order synchronously.
- Inventory and Payment publish events rather than owning cross-service orchestration.
- PostgreSQL remains the source of truth; Redis is a hot cache and coordination layer.
