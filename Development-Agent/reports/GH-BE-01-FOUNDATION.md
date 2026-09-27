# Development Delivery Report

**Feature/Issue:** #1 (GH-BE-01) - [FR-022][FOUNDATION] Chốt stack, contract và nền dự án  
**Blueprint ID:** FR-022  
**Work ID:** FOUNDATION  
**Status:** Ready for review  
**Owner:** MichaelTran1226 (Lead)  
**Last updated:** 2026-09-28  

---

## 1. Context and Traceability

- **SRS/Blueprint source:**
  - `docs/srs.txt` (Mục 1 đến Mục 6 - Quản lý huấn luyện và vận hành chuồng trại EquiFlow)
  - `docs/blueprint.md` (FR-022 - Nền tảng kiến trúc, ERD Mục 8, API Contract Mục 9)
  - `tasks/issues/FOUNDATION.md`
- **Requirements implemented:**
  - Chốt toàn diện Tech Stack cho Backend và Frontend theo chỉ đạo dự án (Quyết định D-01).
  - Ban hành chính sách phân quyền RBAC cho 5 vai trò và luồng xác thực / onboarding (Quyết định D-02).
  - Xác lập quyền lực ưu tiên tuyệt đối của Lệnh khóa y tế khẩn cấp Medical Lock (Quyết định D-03).
  - Quy chuẩn hóa hệ tọa độ (0.0 - 1.0) cho bản đồ giải phẫu hệ xương 2D (Quyết định D-04).
  - Khởi tạo kiến trúc NestJS 11 + TypeScript + Prisma ORM + PostgreSQL với 20 models & enums.
  - Xây dựng Health Check Probe (`/api/health`) kiểm tra uptime và kết nối PostgreSQL.
  - Tích hợp tài liệu Swagger / OpenAPI 3.0 tự động tại `/api/docs`.
  - Thiết lập bộ lọc lỗi chuẩn hóa (`AllExceptionsFilter`), biến đổi phản hồi (`TransformInterceptor`), và bảo vệ RBAC (`RolesGuard`).
- **Out of scope:**
  - Cây phả hệ đa thế hệ (Sire/Dam Pedigree Tree) và video upload (ngoài phạm vi Phase 1).
  - Flow 4–6 (chăm sóc mở rộng, giải đua, tài chính, AI) tạm hoãn theo kế hoạch M0.
- **Open questions:**
  - Không còn câu hỏi mở blocker về stack hay database runtime.

---

## 2. Stack Decision

| Area | Decision | Rationale | Approved by/date |
|---|---|---|---|
| **Frontend** | React `19.2.8` + Vite `8.3.0` + Tailwind CSS | Hiệu năng cao, kiến trúc nhẹ, hỗ trợ responsive 1280/1440/1920px | User / 2026-09-28 |
| **Frontend Routing** | `react-router-dom` `^7.18.4` | Data routers, nested routes, route loaders | User / 2026-09-28 |
| **Backend Runtime** | Node.js `>= 20.19.0` (Active LTS) | V8 tối ưu, Native fetch, độ ổn định doanh nghiệp | User / 2026-09-28 |
| **Backend Framework** | NestJS `^11.x` + TypeScript | Kiến trúc Module DI vững chắc, hỗ trợ Swagger/OpenAPI tự động | User / 2026-09-28 |
| **ORM & Database** | Prisma ORM `^6.x` + PostgreSQL (Supabase / Local) | Type-safe, migrations an toàn, hỗ trợ dual URL (pooling & direct) | User / 2026-09-28 |
| **API Contract** | RESTful API + Swagger / OpenAPI 3.0 (`/api/docs`) | Chuẩn hóa DTO, validation tự động qua `class-validator` | User / 2026-09-28 |
| **Test & Quality** | Jest + Supertest (BE), Vitest (FE), ESLint 9, Prettier | White-box unit & RBAC guard tests, Black-box API E2E | User / 2026-09-28 |

---

## 3. Build Output

- **Codebase paths:**
  - Backend: `/Users/macbookair/Desktop/RACEHORSE/Racehorse_Training_Management_System_MT_BE`
  - Frontend: `/Users/macbookair/Desktop/RACEHORSE/Racehorse_Training_Management_System_MT_FE`
- **PostgreSQL / Prisma Schema:**
  - `prisma/schema.prisma`: Định nghĩa 20 Data Models (`User`, `RefreshToken`, `StaffInvitation`, `Horse`, `Stall`, `StallAllocation`, `TrainingPlan`, `WorkoutSession`, `MedicalRecord`, `InjuryLog`, `MedicalLock`, `PreventiveSchedule`, `NutritionPlan`, `DailyGroomingLog`, `Tournament`, `TournamentRegistration`, `TournamentResult`, `FinancialInvoice`, `AIInsight`, `AuditLog`) và 14 Enums.
  - `prisma/seed.ts`: Seed 5 tài khoản mẫu cho 5 vai trò (`manager@equiflow.com`, `trainer@equiflow.com`, `vet@equiflow.com`, `groom@equiflow.com`, `owner@equiflow.com`), danh mục ô chuồng và hồ sơ ngựa mẫu.
- **Connection string format:**
  - Transaction Pooler: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/racehorse_db?schema=public"`
  - Direct Session: `DIRECT_URL="postgresql://postgres:postgres@localhost:5432/racehorse_db?schema=public"`
- **API Contract:**
  - Tài liệu tương tác OpenAPI / Swagger tại `http://localhost:3000/api/docs`
  - Probe kiểm tra hệ thống: `GET http://localhost:3000/api/health`
- **Environment/Configuration:**
  - `.env.example` cập nhật đầy đủ các biến môi trường cấu hình PostgreSQL/Supabase, JWT, CORS, Email mock.
  - `.gitignore` ngăn chặn tuyệt đối việc commit credentials và file `.env`.
- **Rollback plan:**
  - Migration rollback: `npx prisma migrate resolve --rolled-back <migration_name>` hoặc khôi phục snapshot database.
  - Source rollback: `git revert <commit_hash>`.

---

## 4. Verification Evidence

| Gate | Command/tool | Result | Evidence |
|---|---|---|---|
| **BE White-box Tests** | `npm test` | **PASS (16/16 tests)** | 5 suites (`roles.guard`, `health.service`, `health.controller`, `all-exceptions.filter`, `prisma.service`) passed. |
| **BE Black-box API** | `npm run test:e2e` | **PASS (1/1 test)** | `GET /api/health` trả về status 200, JSON schema chuẩn, database connected flag. |
| **BE Lint & Typecheck** | `npm run lint && npm run typecheck` | **PASS (0 errors, 0 warnings)** | TypeScript compiler sạch, ESLint 9 đạt tiêu chuẩn. |
| **BE Build** | `npm run build` | **PASS** | `nest build` biên dịch thành công ra thư mục `/dist`. |
| **FE Lint, Typecheck, Build** | `npm run lint && npm run typecheck && npm run build` | **PASS** | Vite + React 19 + TypeScript build thành công ra thư mục `/dist`. |
| **Prisma Generation** | `npx prisma generate` | **PASS** | Generated Prisma Client v6 thành công. |

---

## 5. GitHub Delivery

- **Issue:** [MichaelTran1226/Racehorse_Training_Management_System_MT_BE#1](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/1)
- **Project item and fields:**
  - Project: `https://github.com/users/MichaelTran1226/projects/2`
  - Project Item ID: `PVTI_lAHOCshm5c4Bk0j-zg9CYKY`
  - Status: In Progress -> Ready for Review
  - Priority: P0 Critical
  - Area: governance
  - Blueprint ID: FR-022
- **Target repository:** `MichaelTran1226/Racehorse_Training_Management_System_MT_BE`
- **Related repository:** `MichaelTran1226/Racehorse_Training_Management_System_MT_FE`
- **Branch:** `feat/1-foundation`
- **Pull Request:** Ready to create from branch `feat/1-foundation`
- **Remote URL verified:**
  - BE: `git@github.com:MichaelTran1226/Racehorse_Training_Management_System_MT_BE.git`
  - FE: `git@github.com:MichaelTran1226/Racehorse_Training_Management_System_MT_FE.git`

### Manual push commands (Để người dùng thực thi)

```bash
# Push Backend Foundation branch
cd /Users/macbookair/Desktop/RACEHORSE/Racehorse_Training_Management_System_MT_BE
git push -u origin feat/1-foundation

# Push Frontend Foundation branch
cd /Users/macbookair/Desktop/RACEHORSE/Racehorse_Training_Management_System_MT_FE
git push -u origin feat/1-foundation
```

---

## 6. Risks and Closure

| ID | Risk/blocker | Owner | Mitigation | Status |
|---|---|---|---|---|
| **R-001** | Trì hoãn do chưa chốt Tech Stack | Lead / Team | Đã chốt chính thức qua Decision D-01: React 19 + Vite 8 (FE), NestJS 11 + Prisma + PostgreSQL (BE). | **Resolved** |
| **R-002** | Xung đột Medical Lock với lịch tập | Vet / Trainer | Đã xác lập mức ưu tiên kỹ thuật tối cao trong D-03 và schema Prisma. | **Mitigated** |
| **R-003** | Lệch tọa độ chấn thương 2D | FE / BE | Chuẩn hóa tọa độ normalized float (0.0 - 1.0) theo ảnh 900x600 trong D-04. | **Mitigated** |

- **Known issues:** Không có.
- **Definition of Done evidence:**
  1. Quyết định stack/DB/runtime và auth policy đã được ghi rõ tại `docs/DECISIONS.md`.
  2. Cả FE và BE đều biên dịch sạch, test pass, khởi động được theo `README.md`.
  3. CI pipeline tương thích với các lệnh `lint`, `typecheck`, `test`, `build`.
  4. `.env` và credentials không bị track vào git.
