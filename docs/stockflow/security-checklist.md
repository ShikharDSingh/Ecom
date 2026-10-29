# Security checklist

This checklist mirrors the PRD’s security and DevSecOps rules and should be treated as a release gate.

## Session and identity

- [ ] Argon2id password hashing with minimum 12-character policy.
- [ ] Refresh tokens rotate, are family-scoped, and expire after 30 days absolute lifetime.
- [ ] Reused refresh tokens revoke the whole family and emit `identity.session.revoked`.
- [ ] Revoked or expired sessions are rejected on the next protected request.
- [ ] Admin role changes revoke affected user sessions immediately.
- [ ] MFA (TOTP) is planned for staff roles as a future or optional path.

## Authorization and trust boundaries

- [ ] Permissions are embedded in the access token claims (`perms`, `wh`).
- [ ] Ownership and warehouse scoping are enforced inside the owning service query.
- [ ] Default deny is enforced for undeclared routes and RPCs.
- [ ] `Identity.CheckPermission` is used only for high-risk actions.
- [ ] Gateway authentication and coarse authorization are validation filters only.

## Transport and service-to-service security

- [ ] mTLS for all internal gRPC calls.
- [ ] Server verifies client certificate SAN values against allowed service identities.
- [ ] Plaintext gRPC is refused outside `NODE_ENV=test`.
- [ ] JWT signatures are revalidated within the owning service against JWKS.
- [ ] All sensitive headers are stripped or re-signed before cross-boundary propagation.

## API and gateway security

- [ ] Rate limiting uses Redis sliding windows and returns `429` with `Retry-After`.
- [ ] Login throttles prevent brute-force and account enumeration abuse.
- [ ] OpenAPI and generated spec are versioned and checked in CI.
- [ ] Error bodies use RFC 9457 Problem Details and do not leak internal details.
- [ ] Inventory and payment requests require strict schema validation.

## Messaging and data protection

- [ ] No domain event contains PII beyond opaque IDs.
- [ ] Transactional outbox and idempotent consumers are required for durable delivery.
- [ ] Dead-letter and retry flows are retained with headers and timing information.
- [ ] Secret material is never committed to source, Docker images, or `.env` files.

## DevSecOps gates

- [ ] Semgrep scans are merge-blocking.
- [ ] Container image scanning is merge-blocking.
- [ ] Contract tests run per service and provider.
- [ ] CI blocks on critical findings and failing security checks.
