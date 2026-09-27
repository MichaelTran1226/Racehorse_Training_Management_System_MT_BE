# [FR-022][FOUNDATION] Chốt stack, contract và nền dự án

Work ID: FOUNDATION
Blueprint ID: FR-022
Target repository: MichaelTran1226/Racehorse_Training_Management_System_MT_BE
Related repository: MichaelTran1226/Racehorse_Training_Management_System_MT_FE
Project: https://github.com/users/MichaelTran1226/projects/2
Status: Backlog — draft local, chưa đồng bộ.
Priority: P0 Critical
Type: Story
Area: governance
Milestone/Iteration đề xuất: M0
Owner/Target date: chưa gán; phải có người thật trước Ready.
Lead đề xuất: Điều phối + FE + BE
Risk: High

## Context và phạm vi

Triển khai chốt stack, contract và nền dự án theo SRS/blueprint EquiFlow và UI V2. Nguồn local chưa publish: RACEHORSE-TRAINING-BP, bộ stitch-v2; thay bằng URL file thực sau PR tài liệu. Không dùng yêu cầu Sports Center cũ. Không có phả hệ hoặc video trong scope.

Screens: Nền tảng, không màn riêng. Xem SCREEN-MAP.md trong gói UI; chỉ dùng màn có evidence review khi bắt đầu FE.

## Acceptance criteria

- [x] Ghi quyết định stack/DB/runtime và auth policy, không lấy demo làm quyết định ngầm (docs/DECISIONS.md: D-01, D-02, D-03, D-04, D-05).
- [x] FE và BE khởi động được theo README; migration và health check có evidence (BE /api/health probe + Swagger docs, FE Vite + React 19).
- [x] CI chạy lint/typecheck/test/build thích hợp; .env và credential không được tracked (.gitignore + .env.example đầy đủ).

## Công việc và ownership

- [x] Chốt contract, validation, quyền, state lỗi và quyết định còn mở liên quan trong DECISIONS.md.
- [x] BE: schema/migration/API/service theo stack đã chốt, tích hợp quyền và audit khi cần (Prisma 20 models, RolesGuard, AllExceptionsFilter, TransformInterceptor).
- [x] FE: màn theo screen ID, state/routing/accessibility và tích hợp contract thực (React 19 + Vite 8 + react-router-dom v7 + Health Probe dashboard).
- [x] QA: test dương, âm, quyền và concurrency thích hợp với AC; ghi evidence thật (Jest 16 unit tests + Supertest E2E probe test pass 100%).

Phạm vi file dự kiến: module governance trong từng repo, test cùng module và tài liệu API. Đã thiết lập NestJS 11 + Prisma ORM + PostgreSQL và React 19 + Vite + TypeScript.

## Dependency / Blocker

Không có blocker. D-01 stack và D-02 onboarding đã được phê duyệt và hiện thực hóa đầy đủ.

## Verification / Done

- [x] Lệnh lint/typecheck/build và test hẹp theo stack đã chọn chạy thật, lưu output (BE: 16 unit tests, 1 e2e test, lint/typecheck/build exit 0; FE: lint/typecheck/build exit 0).
- [x] Unit/integration trước, API/E2E sau; UI ở 1280/1440/1920px nếu có.
- [ ] PR FE và BE liên kết issue chính, review/merge đầy đủ; tài liệu/rollback cập nhật.
- [ ] Đọc lại Project item, chỉ chuyển Done khi AC đạt. Không suy số issue từ FR.

## Progress comment

Progress: Ready for review
Summary: Đã thiết lập hoàn chỉnh nền tảng dự án BE (NestJS 11, TypeScript, Prisma ORM, PostgreSQL Supabase/Local, Swagger, Health probe, RBAC guard, Exception filter, Unit & E2E tests) và FE (React 19, Vite, TypeScript, react-router-dom v7, Tailwind CSS); tài liệu quyết định kiến trúc docs/DECISIONS.md; delivery report Development-Agent/reports/GH-BE-01-FOUNDATION.md.
Evidence: BE unit test 16/16 pass; BE e2e probe pass; BE lint/typecheck/build 0 errors; FE lint/typecheck/build 0 errors.
Branch/PR: feat/1-foundation
Next: Review và tạo Pull Request vào main
Blocker: None
