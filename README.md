# EquiFlow - Racehorse Training & Stable Management System (Backend)

[![Backend CI / CD Pipeline](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/actions/workflows/ci.yml/badge.svg)](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/actions)
[![NestJS](https://img.shields.io/badge/NestJS-11.x-E0234E?logo=nestjs)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8%2B-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.x-2D3748?logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-336791?logo=postgresql)](https://supabase.com/)

Hệ thống quản lý chuồng trại, y tế chuyên sâu, lập giáo án huấn luyện đỉnh cao và quản trị tài chính minh bạch cho các câu lạc bộ ngựa đua chuyên nghiệp.

---

## 1. Công nghệ & Kiến trúc (Tech Stack - Decision D-01)

- **Runtime:** Node.js `>= 20.19.0` (Active LTS)
- **Framework:** NestJS `^11.x` (`@nestjs/core`, `@nestjs/common`, `@nestjs/swagger`)
- **Language:** TypeScript `~5.8` / `ES2022`
- **ORM & Database:** Prisma ORM `^6.x` + PostgreSQL (Hỗ trợ Supabase qua Transaction Pooler & Direct URL, hoặc Local PostgreSQL)
- **Security & Validation:** Helmet, class-validator, class-transformer, bcryptjs, Passport JWT
- **Testing:** Jest + Supertest (White-box Unit Tests + Black-box API E2E)
- **API Documentation:** Swagger / OpenAPI 3.0 tự động tại `/api/docs`
- **Health Check Probe:** Endpoint `/api/health` kiểm tra uptime và kết nối database

---

## 2. Kiến trúc Thư mục (Directory Structure)

```text
Racehorse_Training_Management_System_MT_BE/
├── .github/
│   └── workflows/ci.yml       # GitHub Actions CI/CD Pipeline
├── docs/
│   ├── blueprint.md           # Toàn bộ thiết kế hệ thống & 22 FR
│   ├── srs.txt                # Đặc tả yêu cầu phần mềm
│   └── DECISIONS.md           # Nhật ký quyết định kiến trúc D-01 -> D-05
├── prisma/
│   ├── schema.prisma          # PostgreSQL schema (20 models & enums)
│   └── seed.ts                # Seeding 5 vai trò mẫu và dữ liệu cơ sở
├── src/
│   ├── common/
│   │   ├── decorators/        # @Roles, @Public, @CurrentUser
│   │   ├── filters/           # AllExceptionsFilter (JSON chuẩn hóa)
│   │   ├── guards/            # RolesGuard (RBAC 5 vai trò)
│   │   ├── interceptors/      # TransformInterceptor, LoggingInterceptor
│   │   └── enums/             # Role, Status enums
│   ├── health/                # Health check service & controller (/api/health)
│   ├── prisma/                # PrismaClient lifecycle service & module
│   ├── app.module.ts          # Root module
│   └── main.ts                # Application bootstrap
├── test/
│   ├── jest-e2e.json          # Cấu hình Jest E2E
│   └── health.e2e-spec.ts     # Black-box API E2E test cho probe
├── .env.example               # Mẫu cấu hình biến môi trường
├── package.json
└── tsconfig.json
```

---

## 3. Năm vai trò người dùng (RBAC - Decision D-02)

1. **Club Manager (`CLUB_MANAGER`):** Quản trị danh mục ngựa, mời nhân sự, phân quyền RBAC, kiểm toán hệ thống (`AuditLog`).
2. **Head Trainer (`HEAD_TRAINER`):** Lập giáo án theo giai đoạn, xếp lịch tập, ghi nhận kết quả, đăng ký giải đua (tự động chặn khi có Medical Lock).
3. **Veterinarian (`VETERINARIAN`):** Chẩn đoán bệnh án, đánh dấu chấn thương trên ảnh giải phẫu 2D, ban hành và mở lệnh Medical Lock.
4. **Groom / Stable Hand (`GROOM`):** Theo dõi ô chuồng, khẩu phần dinh dưỡng theo bữa, xác nhận checklist chăm sóc ca trực.
5. **Horse Owner (`HORSE_OWNER`):** Theo dõi ngựa thuộc quyền sở hữu, lịch sử tập luyện, nhật ký sức khỏe và hóa đơn tài chính định kỳ.

---

## 4. Hướng dẫn Cài đặt & Khởi động (Getting Started)

### 4.1. Yêu cầu môi trường
- Node.js `>= 20.19.0`
- npm `>= 10.x`
- PostgreSQL Database (hoặc tài khoản Supabase)

### 4.2. Các bước thiết lập
1. **Cài đặt thư viện dependencies:**
   ```bash
   npm install
   ```

2. **Cấu hình biến môi trường:**
   ```bash
   cp .env.example .env
   ```
   *Cập nhật `DATABASE_URL` và `DIRECT_URL` theo kết nối PostgreSQL của bạn.*

3. **Khởi tạo Prisma Client:**
   ```bash
   npm run prisma:generate
   ```

4. **Thực thi Database Migration:**
   ```bash
   npm run prisma:migrate
   # hoặc cho môi trường staging/production:
   npm run db:migrate
   ```

5. **Nạp dữ liệu mẫu (Seed Data):**
   ```bash
   npm run db:seed
   ```
   *Lệnh này tạo 5 tài khoản mẫu cho 5 vai trò (mật khẩu mặc định: `EquiFlow@2026`).*

6. **Khởi động Server chế độ phát triển:**
   ```bash
   npm run start:dev
   ```
   Server chạy tại: `http://localhost:3000`

---

## 5. Danh mục Lệnh Kiểm thử & Chất lượng Code (Quality Gates)

| Lệnh | Mục đích |
|---|---|
| `npm run lint` | Chạy ESLint kiểm tra cú pháp và quy chuẩn mã nguồn |
| `npm run typecheck` | Chạy TypeScript compiler kiểm tra tính toàn vẹn kiểu dữ liệu |
| `npm test` hoặc `npm run test:unit` | Chạy White-box Unit Tests (Jest) |
| `npm run test:e2e` | Chạy Black-box API E2E Contract Tests (Supertest) |
| `npm run build` | Biên dịch toàn bộ dự án NestJS ra thư mục `/dist` |
| `npm run format` | Tự động định dạng mã nguồn theo Prettier |

---

## 6. Endpoints Mẫu & OpenAPI Documentation

- **Swagger UI Interactive Documentation:** `http://localhost:3000/api/docs`
- **Health Check Probe:** `GET http://localhost:3000/api/health`
  ```json
  {
    "statusCode": 200,
    "success": true,
    "data": {
      "status": "ok",
      "service": "EquiFlow Racehorse Training Management API",
      "version": "0.1.0",
      "uptime": 45,
      "timestamp": "2026-09-28T03:30:00.000Z",
      "database": {
        "connected": true,
        "provider": "postgresql"
      }
    },
    "timestamp": "2026-09-28T03:30:00.000Z"
  }
  ```

---

## 7. Kế hoạch Phục hồi & Rollback (Rollback Plan)

1. **Rollback Migration cơ sở dữ liệu:**
   - Sử dụng Prisma Migrate rollback: `npx prisma migrate resolve --rolled-back <migration_name>` hoặc khôi phục snapshot database từ Supabase Point-in-time Recovery (PITR).
2. **Rollback Application Binary:**
   - Trong trường hợp deploy thất bại, hoàn nguyên git commit: `git revert <commit_hash>` và deploy phiên bản tag ổn định trước đó.
