# P1-06 — Audit trail

Source: issue #37, FR-021 / API-017; existing approved NestJS/Prisma/PostgreSQL stack.
Scope: BE query endpoint + FE read-only explorer. Existing account/auth writers remain the
integration points; medical/training/finance services do not exist yet in this checkout.

## Contract and implementation plan

- `GET /api/audit-logs`, JWT + `viewAudit` using existing permission grants (issue #37).
  Club Manager has this permission by default; explicit grants/revocations remain effective.
- Optional `userId`, `actor` (case-insensitive name search), `action`, `entityName`,
  `from`, `to` (ISO timestamps, inclusive); `page=1`, `pageSize=20` (1..100).
- Existing response envelope, data `{ logs, total, page, pageSize }`. Each log contains
  persisted audit fields and `user: { id, fullName } | null`. No credential fields joined.
- Sort timestamp descending, id descending; reject invalid dates/ranges/pagination with
  400 VALIDATION. Missing JWT: 401; missing permission: 403 FORBIDDEN.
- No create/update/delete audit API. Existing schema/connection variables unchanged;
  no migration or seed needed. Capture trusted Express request IP/user agent for writers.
- Account edits, permission changes, status changes and deletion must record their audit
  in the same Prisma transaction; retain before/after values without password/token data.
  Lock the User row before reading/validating/calculating the change so concurrent writers
  cannot record stale before-values. Audit query rows/count share RepeatableRead isolation.
- Unit tests first, then HTTP tests with real Nest guards/JWT and mocked DB, then
  lint/typecheck/build/coverage. FE verifies states and desktop layout separately.
- Rollback: revert task changes; no destructive schema rollback or log deletion.

## Decisions and boundaries

- `actor` searches the current related User.fullName, not free text inside JSON. Historical
  anonymous/deleted users are still visible without this filter. The FE uses snapshot actor
  as a display fallback. `userId` is an exact identifier filter.
- No database-level tamper-proof claim: immutability here is the approved no-update/delete
  API contract. Database administrators can still modify tables; User deletion uses the
  existing `SetNull` relation. Historical actor names remain in existing writer snapshots.
- Existing login/logout and other auth events retain their best-effort behavior. Critical
  account edit/status/permission/delete operations now fail and roll back if audit fails.
- Medical/training/finance modules are future tasks; this change does not claim to implement
  those services or their future audit integration. No new packages, secrets or schema changes.

## Verification and review

- RED→GREEN unit tests for query contract, transactional audit and reading after row lock.
- HTTP tests exercise Nest routing, JWT, permissions, validation and middleware with mocked
  Prisma: no session, five default roles, explicit grants/revocation, malformed filters,
  read-only routes and rejecting spoofed forwarded IP metadata.
- Independent review found stale before-values under concurrent writes. Fixed by locking
  before the read, validation, calculations, mutation and log insertion; regression passes.
- Opt-in PostgreSQL suite: `test/audit-postgres.integration.ts` tests real concurrent writers,
  FK-failure rollback, filters and paging. It is not part of the mocked default E2E suite.
  **Not executed here:** no PostgreSQL service/client, Docker, `.env` or test DB URL available.

To verify on an isolated PostgreSQL database with this repo's Prisma schema applied:

```powershell
$env:AUDIT_TEST_DATABASE_URL = 'postgresql://USER:PASSWORD@localhost:5432/audit_test?schema=public'
npx jest --config ./test/jest-e2e.json --testRegex audit-postgres.integration.ts --runInBand
```

The integration suite never falls back to application `DATABASE_URL`; it creates randomly
identified test users and cleans only its own users/logs. Do not point it at production.

## Delivery state

Implemented locally; see `P1-06-delivery.md` for final check results. No GitHub mutation
performed. GitHub CLI, GitHub MCP and SonarQube MCP unavailable. Local lint/typecheck/tests
are fallback evidence, not a Sonar quality gate. FE browser evidence lives in the FE repo.
Do not mark Done until review/merge and remaining release gates have evidence.
