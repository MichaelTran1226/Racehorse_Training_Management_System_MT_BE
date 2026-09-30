# P1-06 delivery — 2026-09-30

Status: implementation validated locally; not merged or marked Done.

Target repository: `MichaelTran1226/Racehorse_Training_Management_System_MT_BE`

Branch: `feat/37-audit-trail`

Remote: `https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE.git`

## Delivered

- `GET /api/audit-logs`: filters for user/actor/action/entity/date, bounded pagination,
  stable ordering, consistent count, existing `viewAudit` authorization and error envelope.
- No log mutation API. Request context supplies IP/user agent to existing audit writers.
- Account edits, status, permission changes and deletions record safe before/after snapshots
  in their transaction. Row locking ensures snapshots are read after earlier writers commit.
- Existing approved NestJS/TypeScript/Prisma/PostgreSQL stack retained. No package, migration,
  seed or connection string change. `.env.example` remains the connection format reference.
- FE companion: Audit Log screen, permission-aware navigation, filtering, paging, details,
  loading/empty/error/retry states; its tests/report are in the separate FE repository.

## Evidence

| Check | Result |
| --- | --- |
| `npm run lint` | Pass, zero warnings |
| `npm run typecheck` | Pass, including optional integration suite |
| `npm run build` | Pass |
| `npm run test:cov -- --runInBand` | 14 suites, 98 tests passed |
| Coverage (whole existing BE) | Statements 66.28%, branches 60.88%, functions 54.19%, lines 66.21% |
| `npm run test:e2e` | 3 suites, 35 tests passed, including 22 audit HTTP cases |
| `git diff --check` | Pass |
| Independent code review | Found stale concurrent snapshots; fixed with row lock and RED→GREEN regression |
| Real PostgreSQL suite | Not run: no configured test database/service available |
| SonarQube | Unavailable; no Sonar gate claim |

HTTP tests use real Nest routing/JWT/guards and mocked Prisma. They do not verify PostgreSQL
SQL execution, rollback or lock contention. See `P1-06-audit-trail.md` for the dedicated
three-case real database suite and run command. No real FE→BE→DB claim is made.

No remaining Important/Critical review finding is left unaddressed in the implementation.
The reviewer also caught a misleading `LOGIN` action example in FE; FE was aligned to the
real `AUTH_LOGIN`/`AUTH_LOGOUT` event names.

## Remaining delivery gates

Run PostgreSQL integration and real deployment smoke tests; obtain Sonar quality evidence
if required by the release gate; review/push/merge the two branches. GitHub mutation and
push were not performed; commands and PR outline are in `P1-06-sync-plan.md`.

Rollback: revert the task commit in each repo. No destructive DB changes or audit-log
deletion needed. Future medical/training/finance writers must integrate audit when their
own modules are implemented. Existing best-effort auth logs remain a documented boundary.

An external change to `.github/workflows/ci.yml` appeared during execution. It was preserved
and excluded from the P1-06 commit.
