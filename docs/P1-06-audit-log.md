# P1-06 Audit Log (FR-021 / API-017)

Issue: https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/37

Route `/audit` now renders the existing application shell with a read-only audit table and event detail modal. It requires `viewAudit`, including explicit grants to non-manager roles; granted users get the sidebar link without requiring `manageAccounts`.

## API contract

The shared API client requests `GET /audit-logs` against `VITE_API_URL` (normally ending in `/api`). It unwraps the existing `{ success, data }` envelope. Data contains `{ logs, total, page, pageSize }`; each log includes `id`, `userId`, `action`, `entityName`, `entityId`, `oldValuesJson`, `newValuesJson`, `ipAddress`, `userAgent`, `timestamp`, and nullable `user: { id, fullName }`.

The UI sends `actor` (case-insensitive current related user's full name), exact `action`, inclusive `from`/`to` ISO timestamps, `page`, and `pageSize=20`. Local date/time inputs are converted to UTC ISO values; displayed times use the existing local formatter. Applying/resetting filters resets pagination. Reversed date ranges cannot be applied. Previous/next controls keep pagination bounded even with many events. Stale responses are ignored when filters change or the page unmounts.

The endpoint also supports `userId` and `entityName`, which are not exposed as UI controls in this slice. Null user/request metadata and missing snapshots display honest fallback text. Snapshots are rendered as text, never HTML. No mutation or export action is offered.

## Demo behavior

Mock mode enforces `viewAudit` server-style before reading history. It adapts existing browser-local audit entries into the same response shape, filters before pagination, and orders newest first. Its stored history has at most 200 entries. Existing mock records only contain actor name, action, timestamp and detail; the page explicitly labels demo mode and missing historical metadata. `DemoActivity` is a synthetic entity label; newValuesJson contains the existing demo actor/detail, not an invented full after snapshot. Actor identity is matched against current demo account names; real backend history remains authoritative.

## Verification

- `npm run typecheck`: passed.
- `VITE_USE_MOCK=true npm run build`: passed; Vite reports bundle size warning above 500 KB.
- `npm run lint`: exit 0 with pre-existing repository warnings; no new audit-page warning.
- Full Edge suite passed 14/14 before final AUTH_LOGIN alignment and request-state refinement; focused audit suite passed 6/6 after those updates. Edge Playwright: pagination (25 entries), exact action and case-insensitive actor filtering, empty/reset, detail/Escape, invalid dates, permission deny/grant without account-management permission, and error/retry.
- Browser screenshots: `test-results/audit-audit-filters-pagination-detail-and-date-validation-desktop-1280/audit-list.png`, matching 1440 folder, and `audit-detail.png` / `audit-list-1920.png` per project. Screenshot output is local ignored test evidence.
- Actual DOM document overflow checked at 390, 1280, 1440 and 1920. No browser page errors in the audit success flow. Existing sidebar/topbar and design tokens retained.

Playwright uses the installed Edge channel: `$env:PLAYWRIGHT_CHANNEL='msedge'; npx playwright test`. Build with mock mode enabled before running these local-storage fixture tests. These tests verify browser behavior against the local mock; No live BE/PostgreSQL integration was run. Live backend integration requires `VITE_USE_MOCK=false` and a running backend.

Rollback: revert the audit page/style, route, audit permission/sidebar additions, mock GET handler and audit tests. No packages, migrations or data-writing UI were added. Issue remains in progress until backend integration/review/merge criteria are met; no push or Done transition performed.
