# Architectural and Technical Decision Log (DECISIONS.md)

**Dự án:** Racehorse Training & Management System (EquiFlow)  
**Tài liệu tham chiếu:** [SRS](srs.txt) · [Blueprint](blueprint.md)  
**Ngày cập nhật:** 2026-09-28  
**Trạng thái phê duyệt:** Approved

---

## 1. Quyết định D-01: Công nghệ và Kiến trúc Hệ thống (Tech Stack & Architecture)

| Thành phần | Lựa chọn được phê duyệt | Chi tiết phiên bản & Cấu hình | Lý do kỹ thuật & Ràng buộc |
|---|---|---|---|
| **Frontend Framework** | **React** | Version `19.2.8` | Hỗ trợ React 19 Server Components, Actions, và hiệu năng render tối ưu. |
| **Frontend Bundler** | **Vite** | Version `8.3.0` | Hỗ trợ HMR siêu nhanh, build ESM hiện đại. |
| **Frontend Language** | **TypeScript** | `~6.0.2` (Target: `ES2022`) | Strict type checking, hỗ trợ cú pháp ECMAScript 2022 hiện đại. |
| **Frontend Routing** | **react-router-dom** | `^7.18.4` | Định tuyến khai báo (Data Routers), nested routes, route loaders và action handlers. |
| **Backend Runtime** | **Node.js LTS** | `>= 20.19.0` (Active LTS) | Hiệu năng v8 tối ưu, Native fetch, bảo mật và tính ổn định dài hạn. |
| **Backend Framework** | **NestJS** | `^11.x` (`@nestjs/core`, `@nestjs/common`) | Kiến trúc module phân lớp rõ ràng, Dependency Injection mạnh mẽ, hỗ trợ OpenAPI/Swagger tự động. |
| **Backend Language** | **TypeScript** | Strict mode, decorators, target `ES2022` | Type-safety từ DTO, Entity đến Service layer. |
| **ORM & Database** | **Prisma ORM** + **PostgreSQL** | Prisma `^6.x` / Managed via Supabase / Local PostgreSQL | Type-safe queries, migration tự động, hỗ trợ connection pooling (`DATABASE_URL`) và direct connection (`DIRECT_URL`). Hỗ trợ custom domain. |
| **API Contract** | **RESTful API + OpenAPI 3.0** | Swagger UI tích hợp tại `/api/docs` | Chuẩn hóa endpoint theo danh mục `API-001` đến `API-017`, định dạng JSON, validation bằng `class-validator`. |
| **Testing Suite** | **Jest & Supertest** (BE) + **Vitest / Playwright** (FE) | Unit, Integration, Concurrency, RBAC, Black-box E2E | Coverage target >= 85% cho business rules, Medical Lock và RBAC enforcement. |
| **Runtime & Container** | **Docker & Node.js Native** | Multi-stage Dockerfile, docker-compose | Dễ dàng triển khai cục bộ và trên cloud platform. |

---

## 2. Quyết định D-02: Chính sách Xác thực và Phân quyền (Auth & RBAC Policy)

### 2.1. Năm vai trò người dùng (5 System Roles)
1. **Club Manager (`CLUB_MANAGER`):** Quản trị toàn quyền: danh mục ngựa, nhân sự, phân quyền RBAC, báo cáo tài chính, kiểm toán Audit Log.
2. **Head Trainer (`HEAD_TRAINER`):** Quản lý huấn luyện: lập giáo án giai đoạn, phân công lịch tập, ghi nhận kết quả, đăng ký giải đấu (chặn khi có Medical Lock).
3. **Veterinarian (`VETERINARIAN`):** Quản lý y tế độc quyền: chẩn đoán, đánh dấu chấn thương 2D, ban hành/gỡ bỏ Medical Lock (độ ưu tiên tối cao).
4. **Groom / Stable Hand (`GROOM`):** Vận hành chuồng trại: theo dõi ô chuồng, khẩu phần ăn, thực hiện checklist ca trực (cho ăn, tắm, vệ sinh, ngâm chân).
5. **Horse Owner (`HORSE_OWNER`):** Chủ sở hữu: tra cứu thông tin ngựa thuộc sở hữu, theo dõi giáo án/sức khỏe, xem hóa đơn chi phí và thưởng.

### 2.2. Quy trình Onboarding & Đăng ký tài khoản
- **Public Signup:** Chỉ áp dụng cho vai trò **Horse Owner**. Người dùng đăng ký bằng email và mật khẩu mạnh.
  - Hệ thống gửi mã OTP xác minh email gồm 6 chữ số có hiệu lực trong 15 phút, giới hạn gửi lại tối đa 3 lần/tiếng.
  - Sau khi xác minh, tài khoản được kích hoạt ở trạng thái chưa sở hữu ngựa (không tự gán quyền).
- **Staff Onboarding (Quản lý, HLV, Bác sĩ, Nhân viên):**
  - Không cho phép đăng ký công khai.
  - Phải do **Club Manager** tạo lời mời (`StaffInvitation`) gửi tới email nhân sự kèm vai trò và token kích hoạt có thời hạn 48 giờ.
  - Nhân sự nhấn link, thiết lập mật khẩu lần đầu để hoàn tất kích hoạt.
- **Quản lý phiên (Session Management):**
  - Sử dụng JWT Stateless Tokens:
    - **Access Token:** thời hạn 15 phút, chứa `sub` (userId), `email`, `role`.
    - **Refresh Token:** thời hạn 7 ngày, lưu mã hóa băm trong DB (`RefreshToken`), hỗ trợ cơ chế thu hồi (Revocation / Rotation).

---

## 3. Quyết định D-03: Chính sách Khóa Y tế Khẩn cấp (Medical Lock Priority Policy)

- **Quyền lực tuyệt đối của Bác sĩ Thú y:** Lệnh "Khóa huấn luyện" (`MedicalLock`) từ Veterinarian có mức độ ưu tiên kỹ thuật cao nhất trên toàn hệ thống.
- **Enforcement nghiêm ngặt:**
  - Khi một chiến mã có cờ `isMedicalLocked == true`, mọi API tạo giáo án nặng (`POST /api/training/plans`), xếp lịch tập chạy (`POST /api/training/workouts`), hoặc đăng ký giải đua (`POST /api/tournaments/:id/register`) BẮT BUỘC bị từ chối với mã lỗi `400 Bad Request` hoặc `409 Conflict`.
  - Không cho phép bất kỳ ai (kể cả Club Manager hay Head Trainer) bypass lệnh khóa này.
- **Quy trình gỡ khóa (Unlock):**
  - Chỉ có Bác sĩ Thú y phụ trách mới có quyền thực hiện mở khóa (`PUT /api/medical/locks/:id/unlock`).
  - Yêu cầu bắt buộc phải nhập ghi chú kết quả tái khám (`recheckNotes`) và xác nhận thể lực đạt chuẩn (`fitnessConfirmed: true`).
  - Mọi thao tác khóa và mở khóa đều được ghi nhận vào `AuditLog` bất biến.

---

## 4. Quyết định D-04: Quy chuẩn Bản đồ Giải phẫu Hệ xương 2D (2D Skeleton Anatomical Map)

- **Định dạng & Kích thước chuẩn:** Sử dụng hình ảnh hệ xương ngựa nhìn nghiêng (Equine Lateral Skeleton View) chuẩn tỷ lệ 900x600 px.
- **Hệ tọa độ chuẩn hóa:**
  - Tọa độ tổn thương `(x, y)` được lưu dưới dạng số thực chuẩn hóa từ `0.000` đến `1.000` (tính theo tỷ lệ phần trăm chiều rộng và chiều cao hình ảnh).
  - Tránh lệch vị trí hiển thị khi giao diện co giãn responsive trên các kích thước màn hình 1280px, 1440px, 1920px.
- **Thuộc tính chấn thương:**
  - Vùng giải phẫu (`anatomicalZone`): Head, Neck, Shoulder, Withers, Back, Loin, Croup, Flank, Forelimb, Hindlimb, Hoof,...
  - Bên cơ thể (`bodySide`): Left, Right, Bilateral.
  - Mức độ (`severity`): Mild (Nhẹ), Moderate (Vừa), Severe (Nghiêm trọng), Critical (Nguy kịch).

---

## 5. Quyết định D-05: Thiết kế Cơ sở Dữ liệu & Xử lý Đồng thời (Database & Concurrency)

- **PostgreSQL via Supabase & Local:**
  - Biến môi trường `DATABASE_URL` phục vụ kết nối Transaction Pooling (cổng 6543 trên Supabase).
  - Biến môi trường `DIRECT_URL` phục vụ kết nối trực tiếp thực thi Prisma Migrations (cổng 5432 trên Supabase).
- **Tính toàn vẹn dữ liệu (Data Integrity):**
  - Khóa ngoại (Foreign Keys) với quan hệ chặt chẽ (`ON DELETE RESTRICT` cho các thực thể nghiệp vụ quan trọng).
  - Index duy nhất trên `microchipRfid` (ngựa), `email` (người dùng), và `(stallId, active)` để đảm bảo một ô chuồng không bị gán trùng cho hai con ngựa cùng một thời điểm.
- **Kiểm toán bất biến (Audit Logging):**
  - Mọi thay đổi dữ liệu nhạy cảm (User roles, Horse profile, Medical lock, Financial invoice) đều ghi vào bảng `AuditLog` với `oldValuesJson` và `newValuesJson`.
  - Bảng `AuditLog` không cung cấp API cập nhật (UPDATE) hay xóa (DELETE).
