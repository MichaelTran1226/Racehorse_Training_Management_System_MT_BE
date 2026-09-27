# Backlog triển khai — chưa tạo issue thật

Mọi việc đang Backlog. Owner/date sẽ gán trên GitHub sau khi review.

- [x] [FOUNDATION — Chốt stack, contract và nền dự án](issues/FOUNDATION.md) · M0 · P0 Critical · phụ thuộc: không (Ready for review)
- [ ] [UI-V2 — Duyệt bộ giao diện Stitch V2](issues/UI-V2.md) · M0 · P0 Critical · phụ thuộc: không
- [ ] [AUTH-LOGIN — Đăng nhập và session](issues/AUTH-LOGIN.md) · M0 · P0 Critical · phụ thuộc: FOUNDATION, UI-V2
- [ ] [AUTH-REGISTER — Đăng ký chủ ngựa và xác minh email](issues/AUTH-REGISTER.md) · M0 · P0 Critical · phụ thuộc: AUTH-LOGIN
- [ ] [AUTH-RESET — Khôi phục mật khẩu](issues/AUTH-RESET.md) · M0 · P0 Critical · phụ thuộc: AUTH-LOGIN
- [ ] [AUTH-STAFF — Mời nhân sự và quản lý quyền](issues/AUTH-STAFF.md) · M0 · P0 Critical · phụ thuộc: AUTH-LOGIN, FR-021
- [ ] [AUTH-SCOPE — RBAC và dữ liệu theo chủ sở hữu](issues/AUTH-SCOPE.md) · M0 · P0 Critical · phụ thuộc: AUTH-LOGIN
- [ ] [FR-021 — Nhật ký kiểm toán](issues/FR-021.md) · M0 · P0 Critical · phụ thuộc: AUTH-LOGIN
- [ ] [FR-002 — Hồ sơ định danh ngựa](issues/FR-002.md) · M1 · P0 Critical · phụ thuộc: AUTH-SCOPE, FR-021
- [ ] [FR-003 — Phân bổ ô chuồng](issues/FR-003.md) · M1 · P0 Critical · phụ thuộc: FR-002
- [ ] [FR-008 — Bảng sức khỏe đàn ngựa](issues/FR-008.md) · M2 · P0 Critical · phụ thuộc: FR-002
- [ ] [FR-009 — Bệnh án và phác đồ](issues/FR-009.md) · M2 · P0 Critical · phụ thuộc: FR-008, FR-021
- [ ] [FR-010 — Đánh dấu chấn thương trên ảnh 2D](issues/FR-010.md) · M2 · P0 Critical · phụ thuộc: FR-009, UI-V2
- [ ] [FR-011 — Ban hành và mở khóa y tế](issues/FR-011.md) · M2 · P0 Critical · phụ thuộc: FR-009, FR-021
- [ ] [FR-004 — Giáo án theo giai đoạn](issues/FR-004.md) · M2 · P0 Critical · phụ thuộc: FR-002, FR-011
- [ ] [FR-005 — Enforcement Medical Lock](issues/FR-005.md) · M2 · P0 Critical · phụ thuộc: FR-011, FR-004
- [ ] [FR-006 — Lịch tập và phân công](issues/FR-006.md) · M2 · P0 Critical · phụ thuộc: FR-004, FR-005, FR-003
- [ ] [FR-007 — Kết quả và nhật ký huấn luyện](issues/FR-007.md) · M2 · P0 Critical · phụ thuộc: FR-006
- [ ] [FR-012 — Lịch y tế dự phòng](issues/FR-012.md) · M2 · P1 High · phụ thuộc: FR-009
- [ ] [MVP-QA — Nghiệm thu MVP xuyên suốt](issues/MVP-QA.md) · M2 · P0 Critical · phụ thuộc: FR-003, FR-005, FR-007, FR-010, FR-012
- [ ] [FR-013 — Khẩu phần theo bữa](issues/FR-013.md) · M3 · P1 High · phụ thuộc: MVP-QA
- [ ] [FR-014 — Checklist ca chăm sóc](issues/FR-014.md) · M3 · P1 High · phụ thuộc: FR-013, FR-003
- [ ] [FR-015 — Tồn kho và đề xuất bổ sung](issues/FR-015.md) · M3 · P1 High · phụ thuộc: FR-014
- [ ] [FR-016 — Giải đua và đăng ký](issues/FR-016.md) · M3 · P1 High · phụ thuộc: MVP-QA, FR-005
- [ ] [FR-017 — Ghi nhận thành tích thi đấu](issues/FR-017.md) · M3 · P1 High · phụ thuộc: FR-016
- [ ] [FR-018 — Báo cáo chi phí và tiền thưởng](issues/FR-018.md) · M3 · P1 High · phụ thuộc: FR-017
- [ ] [FR-019 — Gợi ý huấn luyện có người duyệt](issues/FR-019.md) · M4 · P2 Medium · phụ thuộc: MVP-QA, FR-007
- [ ] [FR-020 — Trợ lý tra cứu theo quyền](issues/FR-020.md) · M4 · P2 Medium · phụ thuộc: FR-019, AUTH-SCOPE

## Checkpoint

- [ ] M0: xác thực năm vai trò, audit, session và không nâng quyền.
- [ ] M1: hồ sơ, chuồng, owner isolation.
- [ ] M2: ảnh 2D đúng, Medical Lock concurrency, hành trình MVP.
- [ ] M3: ca/kho idempotent, giải đua và báo cáo đối soát.
- [ ] M4: AI dựa dữ liệu và có người duyệt.
