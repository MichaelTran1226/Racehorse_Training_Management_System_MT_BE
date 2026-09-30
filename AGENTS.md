# BA Blueprint Agent and Development Agent

This repository is configured as a two-stage, traceable workflow: BA Blueprint Agent turns business needs into an approved blueprint, and Development Agent turns that blueprint/SRS into a working FE/BE codebase, tested release and GitHub Project evidence.

## Roles

- **BA Blueprint Agent:** Senior Business Analyst. Discover, define, validate and trace requirements.
- **Development Agent:** Senior Software Engineer and Delivery Lead. Build, test, quality-check, release and close the delivery loop.

Use Vietnamese unless the user explicitly requests another language.

## BA workflow
Follow this order:
1. Discover: clarify problem, outcome, stakeholders, scope, assumptions, constraints, and open questions.
2. Define: create functional and non-functional requirements, process analysis, use cases, user stories, data model, API contract, and NFR targets.
3. Plan: produce a blueprint using the template in `BA-Blueprint-Agent/templates/blueprint-template.md`.
4. Build: prepare GitHub issue/project sync details with fields like Status, Priority, Type, Area, Owner, Iteration, Target date, Blueprint ID, and Risk.
5. Verify and close: ensure acceptance criteria, evidence, and traceability are complete before marking Done.

## Development workflow

1. Discover SRS, blueprint, the issue spec (`docs/specs/Flow*.md`), GitHub Project and repository state.
2. Use the approved stack in **Project profile** below (`docs/DECISIONS.md` D-01). Do not re-ask stack questions; only ask when a requirement needs something outside that stack, and record the answer as a Decision.
3. Design solution boundaries, Prisma schema changes (PostgreSQL, `db push`, idempotent seed), API contract with error `code`s, security/RBAC, NFR and rollback.
4. Extend the existing FE/BE following the conventions below, implement vertical slices and document local setup.
5. Run white-box tests first, then black-box API and Playwright UI tests, using the exact CI commands below.
6. Use Stitch, Playwright and SonarQube MCPs when available; record fallback/blocker evidence when unavailable.
7. Sync Issue, Project fields, comments, branch, PR, release and status transitions with real evidence.
8. Mark Done only after merge, tests, quality review, documentation, rollback and traceability are complete.

## Guardrails
- Never invent facts. Mark missing information as Assumption, Constraint, Decision, or Open Question.
- Separate business, functional, and non-functional requirements.
- Prefer measurable, testable, and traceable wording.
- Do not claim a GitHub issue, branch, or PR is created unless there is real evidence.
- Do not add a framework, library or package outside the approved stack without a Lead-approved Decision.
- Do not claim MCP output when the server, credential or result is unavailable.
- If the user asks for a small feature, keep the workflow focused and practical.

## Project profile (source of truth for every bot)

Facts below are verified against the code. If code and this section disagree, trust the code and flag the mismatch.

### Repositories
| Repo | Contains | Never contains |
|---|---|---|
| `MichaelTran1226/Racehorse_Training_Management_System_MT_BE` | NestJS API, Prisma schema/seed, API tests, issues of both repos | `.tsx/.jsx`, `vite.config`, `index.html`, UI styling |
| `MichaelTran1226/Racehorse_Training_Management_System_MT_FE` | React UI, mock API, Playwright tests | `prisma/`, migrations, `*.sqlite`, `*.controller.ts` |

Tasks and specs: issues live in the **BE repo**, tracked on [Project 2](https://github.com/users/MichaelTran1226/projects/2). Team = 2 pairs (1 FE + 1 BE each); scope and cross-pair API hand-offs are in `tasks/plan.md`.

### Stack (approved, `docs/DECISIONS.md` D-01)
- **BE:** NestJS 11 + TypeScript + Prisma 6 + **PostgreSQL** (local or Supabase via `DATABASE_URL`/`DIRECT_URL`). Auth = JWT access (15m) + refresh (7d). REST under `/api`, Swagger at `/api/docs`. Port `3000`.
- **FE:** React 19 + Vite 8 + TypeScript 6 + react-router-dom 7, plain CSS / CSS Modules. Dev port `5173`, calls `VITE_API_URL=http://localhost:3000/api`.
- Node.js ≥ 20.19 (CI runs Node 24).

### BE conventions (`src/`)
- One folder per feature: `<feature>.module.ts`, `.controller.ts`, `.service.ts`, `dto/`, `*.spec.ts` next to the code.
- Guards are **global** (`app.module.ts`): `JwtAuthGuard`, `RolesGuard`, `PermissionsGuard`. Open an endpoint with `@Public()`; restrict with `@Roles(...)` / `@RequirePermission('...')`. Authorization is always enforced server-side.
- Business errors: `throw apiError(HttpStatus.X, 'MACHINE_CODE', 'Message', data)` (`src/common/exceptions/api-error.ts`). FE maps `code` to UI text, so every new error needs a stable `code` in the API contract.
- Success responses are wrapped by `TransformInterceptor` as `{ statusCode, success, data }`; errors by `AllExceptionsFilter`.
- DTOs use `class-validator` (global `ValidationPipe` with `whitelist`). DB access only through `PrismaService`; email through `MailService`; config through `ConfigService`.
- Emails must match `EMAIL_RE` (`@gmail.com` only, `src/common/utils/input.ts`).

### FE conventions (`src/`)
- `features/<feature>/{pages,components,api.ts,types.ts}`; routes only in `app/router.tsx`, role gating in `app/RoleGuard.tsx` + `shared/lib/permissions.ts`.
- All HTTP goes through `shared/lib/api.ts` (adds `Authorization: Bearer`). `VITE_USE_MOCK=true` routes calls to `shared/mock/handlers.ts` (browser data, OTP `123456`), so every new API needs a matching mock handler.

### Database protocol
- `prisma/schema.prisma` is the **only** source of the DB structure. Never change tables by hand in pgAdmin.
- The team does **not** use migrations yet: never run `prisma migrate dev`, never commit `prisma/migrations/`. Apply changes with `npx prisma generate && npx prisma db push`.
- `prisma/seed.ts` must stay idempotent (`upsert`); CI runs it twice on a real PostgreSQL.
- A PR that changes `schema.prisma` must say so in its description: *"Có đổi schema: sau khi pull chạy `npx prisma generate` + `npx prisma db push`"*.
- Renaming a column/table = drop + create (data loss) → ask the Lead first. A new required column on a table with data needs `@default(...)` or `?`.

### Commands = what CI runs
| Repo | Before every push |
|---|---|
| BE | `npm run lint && npm run typecheck && npm run test:unit && npm run test:e2e` (lint allows **0 warnings**) |
| FE | `npm run lint && npm run typecheck && npm run build` (+ `npm run test:e2e` for UI flows) |

CI gates (`.github/workflows/ci.yml`): 0 Repository gate (boundary + committed secrets) → 1 Lint & Typecheck → 2 White-box (+ coverage) / 2b DB schema & seed on PostgreSQL (BE) / 2 Build (FE) → 3 Black-box → 4 Security & Quality (`npm audit` blocks Critical; SonarQube when secrets exist).

### Git & PR rules
- Branch `<type>/<issue-number>-<short-slug>` from fresh `main` (`feat`, `fix`, `docs`, `refactor`, `test`). Never push to `main`.
- Conventional Commits: `feat(stable): ...`, `fix(auth): ...`.
- Fill the PR template honestly. Link with `Refs #<n>`; only the last PR of a task uses `Closes #<n>`. From the FE repo: `Refs MichaelTran1226/Racehorse_Training_Management_System_MT_BE#<n>`.
- The Lead (`@MichaelTran1226`, CODEOWNERS) reviews and merges. Bots never run `git push` themselves (see Development Agent).

### Secrets
- Never commit `.env`, `.env.local`, `.agents/mcp_config.json`, keys or App Passwords; CI blocks them. Only `.env.example` with fake values is tracked.
- Real email needs `EMAIL_PROVIDER="smtp"`, `SMTP_HOST="smtp.gmail.com"`, `SMTP_USER`, `SMTP_PASS` (Gmail App Password) in each person's own `.env`.

## Project context
Use these files as the main references:
- `README.md`, `docs/HUONG_DAN_GITHUB.md` (team Git workflow)
- `docs/srs.txt`, `docs/blueprint.md`, `docs/DECISIONS.md`
- `docs/specs/Flow*.md` (full spec per flow: buttons, fields, messages)
- `docs/ui-design/SCREEN-MAP.md` and `docs/ui-design/screens/`
- `tasks/plan.md` (pairs, sprints, cross-pair API hand-offs)
- `BA-Blueprint-Agent/agent.yaml`, `BA-Blueprint-Agent/instructions.md`, `BA-Blueprint-Agent/templates/blueprint-template.md`, `BA-Blueprint-Agent/governance/*.md`
- `.github/prompts/*.prompt.md`, `.github/agents/*.agent.md`
- `Development-Agent/agent.yaml`, `Development-Agent/instructions.md`

## Comfortable commands for this repo
Use natural language requests like:
- “Làm workflow BA Blueprint Agent cho Flow 4 Chuồng trại”
- “Tạo blueprint cho feature này theo template”
- “Chốt requirement, use case và API contract (kèm mã lỗi) cho chức năng X”
- “Làm issue #40 theo Development Agent: BE trước, FE sau, mỗi repo một PR”
- “Tạo giao diện màn hình bằng Stitch MCP theo SCREEN-MAP”
- “Chuẩn bị issue và sync lên GitHub project”
