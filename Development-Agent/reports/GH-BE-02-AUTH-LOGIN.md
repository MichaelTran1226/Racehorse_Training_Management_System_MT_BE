# Development Delivery Report

**Feature/Issue:** #2 (GH-BE-02) - [FR-001][AUTH-LOGIN] Xác thực Đăng nhập & Quản lý Session/JWT  
**Blueprint ID:** FR-001 (liên đới FR-021)  
**Work ID:** AUTH-LOGIN  
**Status:** Ready for review  
**Owner:** MichaelTran1226 (Lead)  
**Last updated:** 2026-09-28  

---

## 1. Context and Traceability

- **SRS/Blueprint source:**
  - `docs/srs.txt` (Mục 1 - Xác thực và phân quyền 5 vai trò hệ thống EquiFlow)
  - `docs/blueprint.md` (FR-001 - Xác thực Đăng nhập & Điều hướng 5 vai trò, API Contract API-001, FR-021 Audit Log)
  - `tasks/issues/AUTH-LOGIN.md`
- **Requirements implemented:**
  - `API-001`: Endpoint `POST /api/auth/login` xác thực email và mật khẩu bằng `bcrypt`, cấp JWT Access Token (15 phút) và Refresh Token (7 ngày).
  - Phân luồng điều hướng chính xác 5 vai trò tới Dashboard chuyên biệt:
    - `CLUB_MANAGER` -> `/manager/dashboard`
    - `HEAD_TRAINER` -> `/trainer/dashboard`
    - `VETERINARIAN` -> `/vet/dashboard`
    - `GROOM` -> `/groom/dashboard`
    - `HORSE_OWNER` -> `/owner/dashboard`
  - Cơ chế kiểm soát vòng đời tài khoản (Account Lifecycle Protection):
    - Tài khoản `SUSPENDED` -> HTTP 403 Forbidden.
    - Tài khoản `PENDING_VERIFICATION` -> HTTP 403 Forbidden.
  - Quản lý phiên làm việc & Refresh Token:
    - `POST /api/auth/refresh`: quay vòng token (Token Rotation), xác thực token hash SHA-256 trong database, thu hồi token cũ (`revoked: true`), phát hành cặp token mới.
    - `POST /api/auth/logout`: thu hồi token hash trong database và ghi nhận sự kiện kết thúc phiên.
    - `GET /api/auth/me`: trích xuất danh tính từ Bearer JWT và trả về thông tin profile thời gian thực.
  - Bảo vệ xác thực toàn cục (Global Guard Architecture):
    - `JwtAuthGuard` thực thi kiểm tra Bearer JWT toàn cục, hỗ trợ decorator `@Public()` cho các endpoint mở.
    - Kết hợp chặt chẽ với `RolesGuard` để đảm bảo RBAC cho các tầng nghiệp vụ tiếp theo.
  - Tích hợp Audit Log bất biến:
    - Ghi nhận `AUTH_LOGIN` khi đăng nhập thành công kèm IP và User-Agent.
    - Ghi nhận `AUTH_LOGOUT` khi người dùng đăng xuất.
- **Out of scope:**
  - Đăng ký tài khoản Horse Owner kèm xác thực OTP email (thuộc `GH-BE-03` / `AUTH-REGISTER`).
  - Đặt lại mật khẩu qua email (thuộc `GH-BE-04` / `AUTH-RESET`).
  - Mời nhân viên qua email (thuộc `GH-BE-05` / `AUTH-STAFF`).

---

## 2. Solution Design & API Contract

| Method | Endpoint | Access | Request Payload | Success Response | Error Handling |
|---|---|---|---|---|---|
| `POST` | `/api/auth/login` | Public (`@Public()`) | `{ email, password }` | HTTP 200: `{ accessToken, refreshToken, expiresIn: 900, tokenType: 'Bearer', user: { id, email, fullName, role, status, dashboardUrl } }` | 400 Bad Request (Validation), 401 Unauthorized (Sai email/mật khẩu), 403 Forbidden (Suspended/Pending) |
| `POST` | `/api/auth/refresh` | Public (`@Public()`) | `{ refreshToken }` | HTTP 200: `{ accessToken, refreshToken, expiresIn: 900, tokenType: 'Bearer' }` | 400 Bad Request, 401 Unauthorized (Token thu hồi hoặc hết hạn), 403 Forbidden (Tài khoản không active) |
| `POST` | `/api/auth/logout` | Public (`@Public()`) | `{ refreshToken? }` | HTTP 200: `{ success: true, message: 'Logged out successfully' }` | 200 OK |
| `GET` | `/api/auth/me` | Bearer Token (`JwtAuthGuard`) | None | HTTP 200: `{ id, email, fullName, phoneNumber, role, status, dashboardUrl }` | 401 Unauthorized (Thiếu/sai Bearer token) |

---

## 3. Build Output

- **Target Repository:** `MichaelTran1226/Racehorse_Training_Management_System_MT_BE`
- **Branch:** `feat/2-auth-login-session`
- **Key Modules and Files:**
  - `src/auth/auth.module.ts`: Khởi tạo AuthModule, tích hợp PassportModule và JwtModule đăng ký bất đồng bộ cùng ConfigService.
  - `src/auth/auth.service.ts`: Xử lý business logic đăng nhập, băm mật khẩu `bcrypt`, sinh/xoay vòng RefreshToken với mã hóa SHA-256, mapping 5 dashboard URLs, và ghi nhận AuditLog.
  - `src/auth/auth.controller.ts`: Định tuyến 4 endpoints, tích hợp Swagger OpenAPI 3.0 với đầy đủ DTO và status codes.
  - `src/auth/strategies/jwt.strategy.ts`: Passport JWT strategy xác thực Bearer token và giải mã payload.
  - `src/common/guards/jwt-auth.guard.ts`: Global Guard kiểm tra JWT Bearer, tự động bypass với `@Public()`.
  - `src/common/decorators/current-user.decorator.ts`: Custom parameter decorator trích xuất payload user đã xác thực.
  - `src/auth/dto/login.dto.ts`, `refresh-token.dto.ts`, `auth-response.dto.ts`: Data Transfer Objects chuẩn hóa, kiểm tra hợp lệ bằng `class-validator` và `class-transformer`.
  - `src/app.module.ts`: Tích hợp `AuthModule` và đăng ký `JwtAuthGuard` trước `RolesGuard` theo thứ tự DI chuẩn của NestJS.

---

## 4. Verification Evidence

| Gate | Command/tool | Result | Evidence |
|---|---|---|---|
| **BE White-box Unit Tests** | `npm test` | **PASS (49/49 tests)** | 9 test suites (`auth.service`, `auth.controller`, `jwt.strategy`, `jwt-auth.guard`, `roles.guard`, `health.service`, `health.controller`, `all-exceptions.filter`, `prisma.service`) passed 100%. |
| **BE Black-box API E2E** | `npm run test:e2e` | **PASS (10/10 tests)** | 2 test suites (`health.e2e-spec`, `auth.e2e-spec`) passed: login 5 vai trò và định tuyến đúng dashboard, sai mật khẩu trả về 401, tài khoản suspended trả về 403, xoay vòng refresh token, lấy thông tin `/api/auth/me` bằng Bearer token. |
| **Typecheck** | `npm run typecheck` | **PASS (0 errors)** | `tsc --noEmit` hoàn tất sạch sẽ, không có lỗi type. |
| **ESLint & Prettier** | `npm run lint` | **PASS (0 errors, 0 warnings)** | ESLint 9 với max-warnings=0 passed tuyệt đối. |
| **Production Build** | `npm run build` | **PASS** | `nest build` biên dịch sạch sẽ ra thư mục `/dist`. |

---

## 5. GitHub Delivery

- **Issue:** [MichaelTran1226/Racehorse_Training_Management_System_MT_BE#2](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/2)
- **Project URL:** [https://github.com/users/MichaelTran1226/projects/2](https://github.com/users/MichaelTran1226/projects/2)
- **Target repository:** `MichaelTran1226/Racehorse_Training_Management_System_MT_BE`
- **Branch:** `feat/2-auth-login-session`
- **Remote URL:** `https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE.git`

### Manual push commands (Dành cho người dùng thực thi)

```bash
# Di chuyển vào thư mục Backend
cd e:/FPT/Se_5/RACEHORSE_TRAINING_MAIN/Racehorse_Training_Management_System_MT_BE

# Đẩy branch feat/2-auth-login-session lên remote repository
git push -u origin feat/2-auth-login-session
```

---

## 6. Risks and Closure

| ID | Risk/Constraint | Owner | Mitigation | Status |
|---|---|---|---|---|
| **R-AUTH-01** | Tràn bộ nhớ do lưu trữ token không mã hóa | Security / Lead | Sử dụng mã hóa SHA-256 cho refresh token trong DB, chỉ lưu hash và thu hồi khi xoay vòng. | **Mitigated** |
| **R-AUTH-02** | Xung đột guard giữa xác thực (JWT) và phân quyền (RBAC) | BE Dev | Đăng ký `JwtAuthGuard` chạy trước `RolesGuard` trong `AppModule`, kết hợp cờ `@Public()`. | **Resolved** |
| **R-AUTH-03** | Khác biệt định dạng kết thúc dòng (CRLF / LF) giữa môi trường Windows và CI | DevOps | Cấu hình `"endOfLine": "auto"` trong `.prettierrc`. | **Resolved** |

- **Definition of Done Checklist:**
  - [x] Đăng nhập thành công trả về JWT & Role
  - [x] 5 vai trò vào đúng Dashboard riêng
  - [x] Sai mật khẩu báo lỗi (HTTP 401 Unauthorized)
  - [x] Đăng xuất hủy token và lưu trạng thái thu hồi trong DB
  - [x] Quản lý Session/Refresh token quay vòng bảo mật
  - [x] 100% white-box unit tests và black-box e2e tests đạt
  - [x] Linter, typecheck và nest build đạt tiêu chuẩn nghiêm ngặt
