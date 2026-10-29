# Open questions

The PRD is implementation-ready but still leaves a few product and engineering decisions to confirm during Phase 1.

1. Which admin UI workflow is the first release target: order-only ops or a fuller warehouse dashboard?
2. Should all staff users use a single `admin` identity or separate `warehouse_operator`, `inventory_manager`, and `catalog_manager` roles at creation time?
3. What is the exact source of the low-stock alert target list: all warehouse managers, all inventory managers, or only the product owner queue?
4. Is the payment simulation gateway a row-based mock, an internal stub, or a real provider interface behind the same contract?
5. Should the `Refresh` cookie be browser-only, while API clients still send the token as a bearer header? The PRD leaves the representation to the implementation.
6. How are product media objects finally validated: server-side content sniffing only, or complete signed object metadata plus a backend verification step?
7. Which of the service packages will be owned by a single service team versus a platform team for shared SDKs and contract generation?
8. Are there any required SSO, SCIM, or enterprise identity integrations that should be omitted from the MVP but planned later?
9. What is the exact data retention period for payment, audit, and session data in production?
10. Which versioning strategy will be adopted for event schemas beyond the initial `schemaVersion: 1` design?

These questions do not block the architecture; they simply need explicit decisions before implementation begins.
