# Báo Cáo Nghiệm Thu & Bàn Giao Hoàn Thành Sprint 1 (Sprint 1 Delivery Report)

> **Dự án:** Racehorse Training & Management System (EquiFlow / TMEC) — SWP391  
> **Thời điểm:** 03/10/2026  
> **Tác nhân thực hiện:** BA Blueprint Agent & Development Agent  
> **Căn cứ:** [tasks/plan.md](file:///E:/01_Academic_FPT/Courses/Se_5_Active/SWP391/MINH_Racehorse_Branch/Racehorse_Training_Management_System_MT_FE/tasks/plan.md), [tasks/todo.md](file:///E:/01_Academic_FPT/Courses/Se_5_Active/SWP391/MINH_Racehorse_Branch/Racehorse_Training_Management_System_MT_FE/tasks/todo.md), [main.md](file:///E:/01_Academic_FPT/Courses/Se_5_Active/SWP391/MINH_Racehorse_Branch/main.md)  

---

## 1. Trạng thái Git & Đồng bộ Remote (Requirement 1)

1. **Backend (`Racehorse_Training_Management_System_MT_BE`):**
   - Đã kiểm tra `git status` và `git pull origin main`.
   - Đạt trạng thái mới nhất (*Already up to date*).
2. **Frontend (`Racehorse_Training_Management_System_MT_FE`):**
   - Đã pull thành công các commit mới nhất từ `origin/main` (từ `c96ae5f` đến `999d935`).
   - Cập nhật toàn bộ các cải tiến vector giải phẫu cơ bắp ngựa, điều hướng Herd Health và bộ đệm chống lỗi tự động dịch DOM.

---

## 2. Hoàn thiện các hạng mục tồn đọng tại Sprint 1 (Requirement 2)

| Mã Task | Tên Chức Năng | Phân Hệ | Trạng Thái BE | Trạng Thái FE | Minh Chứng |
|---|---|---|:---:|:---:|---|
| **C-01** | Nền tảng FE: Design Tokens, Master Layout & Routing | Chung | Đã duyệt | **Hoàn thành** | Design Tokens, Sidebar, AppShell, Router |
| **P1-01** | Đăng nhập, JWT Stateless & Điều hướng 5 vai trò | Auth | **Hoàn thành** | **Hoàn thành** | `LoginPage.tsx`, `AuthService`, 16 test suites pass |
| **P1-02** | Đăng ký Horse Owner & Xác thực OTP Email | Auth | **Hoàn thành** | **Hoàn thành** | `SignUpPage.tsx`, `VerifyEmailPage.tsx`, `OtpService` |
| **P1-03** | Quên & Đặt lại mật khẩu | Auth | **Hoàn thành** | **Hoàn thành** | `ForgotPasswordPage.tsx`, `ResetOtpPage.tsx`, `ResetPasswordPage.tsx` |
| **P1-04** | Mời nhân sự nội bộ & Danh bạ nhân viên | Accounts / Master | **Hoàn thành** | **Hoàn thành** | `CreateAccountModal.tsx`, `StaffDirectoryPage.tsx` mới xây dựng |
| **P1-05** | RBAC 5 vai trò, Route Guard & Cách ly dữ liệu | Auth / Accounts | **Hoàn thành** | **Hoàn thành** | `RoleGuard.tsx`, `PermissionMatrix.tsx`, `JwtAuthGuard` |
| **P1-06** | Nhật ký kiểm toán (Audit Trail) | Audit | **Hoàn thành** | **Hoàn thành** | `AuditLogPage.tsx`, `AuditService` (PR #62, #16) |
| **P2-01** | Hồ sơ Y tế ngựa (6 tab) & Sơ đồ sức khỏe | Health | **Hoàn thành** | **Hoàn thành** | `MedicalRecordPage.tsx`, `HerdHealthPage.tsx`, PR #63 |
| **P2-02** | Bệnh án điện tử, phác đồ điều trị & kê đơn | Health | **Hoàn thành** | **Hoàn thành** | `RecordDetailPage.tsx`, `RecordFormPage.tsx`, `TreatmentPlanPage.tsx` |

---

## 3. Các cải tiến & Tái thiết kế Giao diện / Kỹ thuật (Design & Tech Actions)

1. **Xử lý Cổng kết nối & Biến môi trường (.env BE):**
   - Đặt lại `PORT=3000`.
   - Khai báo đầy đủ `DIRECT_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`.
   - Loại bỏ `SESSION_SECRET` cũ.
2. **Dữ liệu hạt giống (Seed Data):**
   - Đồng bộ toàn bộ 5 tài khoản mẫu trong `prisma/seed.ts` sang `@gmail.com` (`manager@gmail.com`, `trainer@gmail.com`, `vet@gmail.com`, `groom@gmail.com`, `owner@gmail.com`).
   - Bổ sung tài khoản mẫu tương ứng vào mock data FE (`accounts.ts`, `SEED_VERSION = 7`).
3. **Chuẩn hóa Enum hệ thống (`shared/types/enums.ts`):**
   - Chuẩn hóa `HorseStatus` thành 7 trạng thái: `ACTIVE`, `IN_TRAINING`, `UNDER_OBSERVATION`, `INJURED`, `ISOLATED`, `RESTING`, `RETIRED`.
   - Chuẩn hóa `PlanStatus` thành 5 trạng thái: `DRAFT`, `APPROVED`, `ACTIVE`, `COMPLETED`, `SUSPENDED`.
   - Cập nhật hiển thị nhãn và tông màu tại `status.ts` và `StallGrid.tsx`.
4. **Dọn dẹp mã nguồn ngoài phạm vi (Out-of-Scope):**
   - Đã xóa bỏ hoàn toàn `PedigreeEditorPage.tsx` và `IncidentReportPage.tsx`.
5. **Xử lý triệt để các file rỗng 0-byte:**
   - Xây dựng màn hình [StaffDirectoryPage.tsx](file:///E:/01_Academic_FPT/Courses/Se_5_Active/SWP391/MINH_Racehorse_Branch/Racehorse_Training_Management_System_MT_FE/src/features/master-data/pages/StaffDirectoryPage.tsx) phục vụ phân hệ nhân sự (P1-04), kết nối router `/staff`.
   - Xây dựng màn hình [HorseListPage.tsx](file:///E:/01_Academic_FPT/Courses/Se_5_Active/SWP391/MINH_Racehorse_Branch/Racehorse_Training_Management_System_MT_FE/src/features/horses/pages/HorseListPage.tsx) và `types.ts`, `api.ts` chuẩn bị sẵn cho Sprint 2 (P1-07), kết nối router `/horses` và `/my-horses`.
   - Thay thế toàn bộ các file 0-byte còn lại ở `racing`, `stable`, `dashboard` bằng component UnderDevelopment hợp lệ, đảm bảo không còn file rỗng nào trong dự án.
6. **Đồng bộ metadata `package.json` FE:**
   - Trỏ repository về remote chính thức của nhóm `MichaelTran1226`.
   - Bổ sung script `test` cho CI.

---

## 4. Kết quả Kiểm thử & Quality Gate (Verification Evidence)

- **Backend Unit & Service Tests:**
  - Lệnh chạy: `npm test`
  - Kết quả: **16/16 Test Suites Passed**, **108/108 Tests Passed** (100% green).
- **Backend Build:**
  - Lệnh chạy: `npm run build` (`nest build`)
  - Kết quả: **Thành công (Exit Code 0)**.
- **Frontend Typecheck & Production Build:**
  - Lệnh chạy: `npm run build` (`tsc --noEmit && vite build`)
  - Kết quả: **181 modules transformed, compiled in 315ms (Exit Code 0)**.
- **Frontend Linter:**
  - Lệnh chạy: `npm run lint`
  - Kết quả: **Clean (Exit Code 0)**.

---

## 5. Kết luận & Sẵn sàng cho Sprint 2

Toàn bộ phạm vi công việc của **Sprint 1 (28/09 – 04/10/2026)** đã hoàn tất 100%, vượt mức tiến độ ở phân hệ Y tế (Cặp 2 đã làm trước cả P2-03 đến P2-05). Hệ thống sẵn sàng bước vào **Sprint 2 (05/10/2026)** tập trung vào Quản lý Hồ sơ Ngựa (`P1-07`, `P1-08`) và Chuồng trại (`P1-09`).
