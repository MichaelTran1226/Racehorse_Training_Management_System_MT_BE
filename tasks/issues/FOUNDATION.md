# [GH-BE-01][FOUNDATION] Khởi tạo Backend, chốt Stack kỹ thuật (Node/NestJS hoặc Express/TS + SQLite/Postgres ORM), thiết kế Database Schema ban đầu, cấu hình Migration, Docker setup, CI pipeline và Health check endpoint

Work ID: FOUNDATION
Mã tra cứu: GH-BE-01
Blueprint ID: FR-022
Sprint: Sprint 1
Thời gian kế hoạch: 28/09/2026 – 30/09/2026
Lead theo workbook: Lead + Backend Dev
Vị trí phân công theo workbook: Backend Dev 1
Branch: `feat/1-foundation`
Pull Request: Merged PR #20 into `main` (commit `8a9e3f5`, merge `418c772`)

## Nội dung task gốc

Khởi tạo Backend, chốt Stack kỹ thuật (Node/NestJS hoặc Express/TS + SQLite/Postgres ORM), thiết kế Database Schema ban đầu, cấu hình Migration, Docker setup, CI pipeline và Health check endpoint

Nguồn: [kế hoạch 3 sprint](../EquiFlow_Sprint_Plan_3_Weeks.xlsx). Chỉ website desktop Flow 1–3; không mobile, phả hệ, video hoặc flow optional.

## Giao diện

[Stitch chuẩn theo task](https://stitch.withgoogle.com/projects/1737930245422720673) · [Danh mục tên thống nhất](../../GENERATE/ui-design/stitch-v2/SCREEN-MAP-CORE.md)

Screen IDs: Không có màn riêng — nền tảng hệ thống. Bộ có 31 màn chính và 5 biến thể thao tác/quyền của cùng task; không thêm flow. Tên Canvas dùng cùng mã tra cứu, Work ID và tên task ở trên.

## Acceptance criteria theo task

- [x] Chốt stack chính thức: NestJS 11 + TypeScript + Prisma ORM + PostgreSQL (Supabase/Local) (docs/DECISIONS.md: D-01 -> D-05).
- [x] DB schema & migration chạy thành công: 20 Prisma Data Models, Enums và seed script (`prisma/schema.prisma`).
- [x] API Health check 200 OK: Endpoint `/api/health` trả về status healthy, uptime, database check.
- [x] Setup test runner & CI lint/typecheck: Jest 16 unit tests + Supertest e2e tests pass; GitHub Actions CI workflow thiết lập hoàn chỉnh.

## Checklist thực hiện

- [x] Chốt API/DTO, validation, quyền, trạng thái lỗi và các quyết định còn mở (RolesGuard, AllExceptionsFilter, TransformInterceptor).
- [x] BE: API/service, migration, quyền và audit phù hợp task.
- [x] QA: 16 unit tests + 1 e2e test pass 100%.
- [x] PR liên kết issue chính; review, merge vào main qua PR #20.

## Verification & Status

- **Status triển khai:** Done (Đã nghiệm thu và merge vào nhánh `main`).
- **Evidence:** [Development-Agent/reports/GH-BE-01-FOUNDATION.md](../../Development-Agent/reports/GH-BE-01-FOUNDATION.md).
