# EquiFlow - Racehorse Training & Stable Management System (Backend)

[![Backend CI / CD Pipeline](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/actions/workflows/ci.yml/badge.svg)](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/actions)
[![NestJS](https://img.shields.io/badge/NestJS-11.x-E0234E?logo=nestjs)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8%2B-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.x-2D3748?logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Docker%2016-336791?logo=postgresql)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Enabled-2496ED?logo=docker)](https://www.docker.com/)

Hệ thống quản lý chuồng trại, chăm sóc y tế chuyên sâu, lập giáo án huấn luyện đỉnh cao và quản trị tài chính minh bạch cho các câu lạc bộ ngựa đua chuyên nghiệp (Đồ án SWP391).

---

## 1. Khởi động Nhanh với Docker (Quick Start - Recommended ⭐)

Nếu máy tính của bạn đã cài đặt **Docker Desktop**, bạn có thể khởi chạy toàn bộ Cơ sở dữ liệu và Backend chỉ với **3 bước đơn giản**:

```bash
# 1. Cài đặt các thư viện
npm install

# 2. Khởi động PostgreSQL 16 bằng Docker
docker compose up -d

# 3. Đồng bộ bảng & nạp 100% dữ liệu mẫu (20 ô chuồng, 9 ngựa, hồ sơ y tế, giáo án)
npm run db:setup

# 4. Khởi động Backend Server
npm run start:dev
```

Server Backend sẽ lắng nghe tại: **`http://localhost:3000`** (API prefix: `/api`).  
Kiểm tra sức khỏe hệ thống: `GET http://localhost:3000/api/health` -> `{"status":"ok","database":{"connected":true}}`.

---

## 2. Hướng dẫn Thiết lập Chi tiết

### 2.1. Cấu hình biến môi trường (`.env`)
Sao chép file `.env.example` thành `.env`:
```powershell
# Windows PowerShell
Copy-Item .env.example .env

# Linux / macOS
cp .env.example .env
```

Nội dung chuẩn của `.env` khi chạy với Docker cục bộ và gửi OTP qua Gmail:

```env
# 1. Cấu hình Server
PORT=3000
NODE_ENV=development
API_PREFIX=/api
CORS_ORIGIN=http://localhost:5173
APP_URL=http://localhost:5173

# 2. Cấu hình Database PostgreSQL Docker Local
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/equiflow?schema=public"
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/equiflow?schema=public"

# 3. Cấu hình Authentication & JWT Token
JWT_SECRET="equiflow-secure-jwt-secret-replace-in-production-2026"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_SECRET="equiflow-secure-refresh-jwt-secret-2026"
JWT_REFRESH_EXPIRES_IN="7d"

# 4. Cấu hình Gửi Email OTP thật qua Google SMTP
EMAIL_PROVIDER="smtp"
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="tmec8386@gmail.com"
SMTP_PASS="dvmltzcfkshuttno"
EMAIL_FROM="EquiFlow System <tmec8386@gmail.com>"

# 5. Cờ kiểm thử OTP
# false = Gửi mã OTP ngẫu nhiên thật về hòm thư Gmail
# true  = Mọi mã OTP luôn là 123456 (tiện test nhanh không cần mở email)
DEV_FIXED_OTP=false
```

---

### 2.2. Hai cách quản lý Database PostgreSQL bằng Docker

#### Cách 1: Dùng Docker Compose (Tiện lợi nhất)
Trong thư mục `Racehorse_Training_Management_System_MT_BE`:
```bash
# Bật database chạy nền
docker compose up -d

# Tắt database khi không sử dụng
docker compose down
```

#### Cách 2: Dùng lệnh `docker run` trực tiếp
Nếu không muốn dùng compose, bạn có thể chạy 1 dòng lệnh:
```powershell
docker run -d --name equiflow-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=equiflow -p 5432:5432 -v equiflow_pg_data:/var/lib/postgresql/data postgres:16-alpine
```

---

### 2.3. Xem và quản lý dữ liệu bằng Prisma Studio (GUI)
Để xem toàn bộ bảng biểu trực quan trên trình duyệt (thay thế cho pgAdmin hoặc DBeaver):
```bash
npm run db:studio
# hoặc: npx prisma studio
```
Trình duyệt sẽ tự động mở tại **`http://localhost:5555`**.

---

## 3. Danh sách Tài khoản Kiểm thử (Demo Accounts)

Mật khẩu mặc định cho tất cả các tài khoản: **`EquiFlow@2026`**

| Vai trò (Role) | Email | Họ và tên | Trạng thái | Nghiệp vụ chính |
| :--- | :--- | :--- | :--- | :--- |
| **Club Manager** | `manager@gmail.com` | Michael Tran | `ACTIVE` | Quản trị tài khoản, phân quyền, sơ đồ chuồng, xem audit log |
| **Head Trainer** | `trainer@gmail.com` | David Nguyen | `ACTIVE` | Lập giáo án huấn luyện, xếp lịch bài tập, ghi nhận kết quả |
| **Veterinarian** | `vet@gmail.com` | Dr. Sarah Connor | `ACTIVE` | Khám lâm sàng, đặt/mở Khóa Y Tế, chấm chấn thương 2D |
| **Groom Hand 1** | `groom@gmail.com` | John Smith | `ACTIVE` | Chăm sóc chuồng Barn 1 (A01-A03), thực hiện bài tập nhẹ |
| **Groom Hand 2** | `groom2@gmail.com` | Lê Văn Phúc | `ACTIVE` | Chăm sóc chuồng Barn 2 & Khu cách ly |
| **Horse Owner 1** | `owner@gmail.com` | Robert Sterling | `ACTIVE` | Chủ sở hữu Thunderbolt Swift, Pegasus Dream, Midnight Mirage |
| **Horse Owner 2** | `owner2@gmail.com` | Phan Đức Long | `ACTIVE` | Chủ sở hữu Northern Dancer Legacy, Shadowfax Wonder |
| **Pending User** | `pending.groom@gmail.com`| Trần Văn Nam | `PENDING_APPROVAL`| Tài khoản chờ duyệt để test chức năng Approve / Reject của Manager |
| **Invited User** | `invited.vet@gmail.com` | Dr. Alexander Bell | `INVITED` | Bác sĩ được mời qua email, test tính năng Resend / Cancel Invite |
| **Locked User** | `locked.user@gmail.com` | Đặng Tuấn Kiệt | `LOCKED` | Tài khoản bị khóa, test tính năng Mở khóa (Unlock) |

---

## 4. Dữ liệu Mẫu Toàn Diện Có Sẵn (Seeded Dataset)

Dữ liệu nạp bởi `npm run db:seed` bao quát 100% các tình huống nghiệp vụ:

### 4.1. Hệ thống Chuồng Trại (3 Khu - 20 Ô chuồng)
* **Zone A - Barn 1 (Lưới 2x4 = 8 ô):** `STALL-A01` đến `STALL-A04` (`OCCUPIED`), `STALL-A05` đến `STALL-A08` (`AVAILABLE`).
* **Zone B - Barn 2 (Lưới 2x4 = 8 ô):** `STALL-B01` đến `STALL-B03` (`OCCUPIED`), `STALL-B04` đến `STALL-B07` (`AVAILABLE`), `STALL-B08` (`MAINTENANCE`).
* **Zone C - Isolation (Lưới 1x4 = 4 ô):** `STALL-C01` (`OCCUPIED`), `STALL-C02` đến `STALL-C03` (`AVAILABLE`), `STALL-C04` (`INACTIVE` - ngừng dùng).

### 4.2. Đàn Ngựa Đua (9 Cá thể đầy đủ RFID & 7 Trạng thái)
1. `HR-000001` - **Thunderbolt Swift** (`ACTIVE`): Chuồng A01, giáo án thi đấu Derby 2026.
2. `HR-000002` - **Northern Dancer Legacy** (`INJURED`): Chuồng A02, **Khóa Y Tế đang bật**, chặn bài tập nặng.
3. `HR-000003` - **Shadowfax Wonder** (`UNDER_OBSERVATION`): Chuồng B01, chấn thương gân SDFT 2D đang hồi phục.
4. `HR-000004` - **Pegasus Dream** (`ACTIVE`): Chuồng A03, điều hòa thể lực đường trường.
5. `HR-000005` - **Golden Eclipse** (`IN_TRAINING`): Chuồng A04, chu kỳ tập luyện cơ bản.
6. `HR-000006` - **Storm Runner** (`IN_TRAINING`): Chuồng B02, ngựa đực thuần chủng Thoroughbred.
7. `HR-000007` - **Midnight Mirage** (`ISOLATED`): Chuồng C01, **Khóa Y Tế cách ly** theo dõi cúm EHV-1.
8. `HR-000008` - **Red Velvet** (`RESTING`): Chuồng B03, nghỉ dưỡng sau giải đua.
9. `HR-000009` - **Silver Comet** (`RETIRED`): Ngựa giải nghệ vinh danh sau chức vô địch 2024 (lưu trữ mềm).

### 4.3. Hồ sơ Bệnh án & Y tế (Flow 3)
* **Bệnh án:** Có sẵn bệnh án khám thể lực `BA-2610-001` (`OPEN`), chấn thương cấp tính `BA-2610-002` (`OPEN`), bệnh án viêm phế quản cũ đã chữa khỏi `BA-2609-001` (`CLOSED` - test Reopen), và bệnh án nháp `BA-2610-DRAFT` (`DRAFT`).
* **Khóa Y Tế:** 2 ca đang khóa (`isLocked: true`) và 1 ca lịch sử đã mở khóa (`isLocked: false` - test tab Lịch sử).
* **Bản đồ chấn thương 2D:** 1 ca đang điều trị (`ACTIVE`) và 1 ca đã lành (`RESOLVED`).
* **Lịch chăm sóc định kỳ:** Đầy đủ tiêm phòng, tẩy giun, mài răng và đóng móng (kèm 1 ca quá hạn `OVERDUE` để kiểm tra cảnh báo).

### 4.4. Kế hoạch Huấn luyện & Bài tập (Flow 2)
* **Giáo án:** Có giáo án đang áp dụng (`ACTIVE`), giáo án nháp (`DRAFT`), và giáo án hoàn thành (`COMPLETED`).
* **Bài tập:** Bài tập đã hoàn thành (`COMPLETED` kèm telemetry), bài tập lên lịch (`SCHEDULED`), bài tập bị chặn bởi Khóa Y Tế (`BLOCKED` - **RULE-MED-01**), và bài tập bị bỏ lỡ (`MISSED`).

---

## 5. Danh mục Lệnh Phát Triển & Kiểm Thử

| Lệnh | Ý nghĩa |
| :--- | :--- |
| `npm run start:dev` | Khởi động server NestJS chế độ Hot-reload |
| `npm run db:up` | Khởi chạy PostgreSQL container bằng Docker Compose |
| `npm run db:down` | Dừng và tắt PostgreSQL container |
| `npm run db:setup` | Đẩy bảng Prisma và nạp toàn bộ 100% dữ liệu mẫu |
| `npm run db:seed` | Chỉ chạy lại script nạp dữ liệu mẫu |
| `npm run db:studio` | Mở giao diện trực quan Prisma Studio tại port 5555 |
| `npm run typecheck` | Kiểm tra tính toàn vẹn kiểu dữ liệu TypeScript (`tsc --noEmit`) |
| `npm run test:unit` | Chạy 100% Unit test suite bằng Jest (28 suites, 267 tests) |
| `npm run build` | Biên dịch toàn bộ dự án NestJS ra thư mục `/dist` |
| `npm run lint` | Chạy ESLint kiểm tra quy chuẩn mã nguồn |

---

## 6. Tài liệu & OpenAPI Swagger

* **Swagger UI Interactive Documentation:** `http://localhost:3000/api/docs`
* **Health Check Probe:** `GET http://localhost:3000/api/health`
