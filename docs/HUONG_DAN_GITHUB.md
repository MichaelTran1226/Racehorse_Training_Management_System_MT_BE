# Hướng dẫn dùng GitHub — repo Backend

Dự án có **2 repo riêng**: BE (repo này) và [FE](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_FE). Repo BE **không được chứa** file giao diện (`.tsx`, `.jsx`, `vite.config`, `index.html`): bot sẽ chặn ngay. Task và đặc tả nằm ở [Project 2](https://github.com/users/MichaelTran1226/projects/2) (issue ở repo này).

## 1. Cài một lần

1. Cài [Git](https://git-scm.com/downloads), [Node.js 20.19 trở lên](https://nodejs.org/) (bản LTS) và [PostgreSQL](https://www.postgresql.org/download/) (hoặc dùng Supabase).
2. Khai tên cho Git (dùng đúng email tài khoản GitHub):
   ```bash
   git config --global user.name "Tên của bạn"
   git config --global user.email "email-github@gmail.com"
   ```
3. Nhờ Michael thêm tài khoản GitHub của bạn vào repo (quyền **Write**).

## 2. Lấy code về và chạy

```bash
git clone https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE.git
cd Racehorse_Training_Management_System_MT_BE
npm ci
cp .env.example .env              # PowerShell: Copy-Item .env.example .env
```

Mở `.env`, sửa `DATABASE_URL` và `DIRECT_URL` cho đúng PostgreSQL của bạn, ví dụ `postgresql://postgres:<mật-khẩu>@localhost:5432/racehorse_db?schema=public`. Sau đó:

```bash
npx prisma generate      # tạo Prisma Client
npx prisma db push       # tạo/cập nhật bảng trong DB của bạn theo prisma/schema.prisma
npm run db:seed          # 5 tài khoản mẫu, mật khẩu EquiFlow@2026
npm run start:dev
```

- API: http://localhost:3000/api · Tài liệu Swagger: http://localhost:3000/api/docs
- Email (mã OTP): muốn nhận mail thật thì điền `SMTP_USER` (địa chỉ Gmail) và `SMTP_PASS` (App Password của Gmail, không phải mật khẩu thường) trong `.env`. Để trống `SMTP_USER` hoặc đặt `EMAIL_PROVIDER="mock"` thì mã chỉ in ra cửa sổ chạy server. **Không** commit App Password: gửi riêng cho nhau hoặc mỗi người tự tạo. `DEV_FIXED_OTP=true`: mã OTP luôn là `123456`.
- Mỗi lần kéo code mới mà `prisma/schema.prisma` thay đổi: chạy lại `npx prisma generate` và `npx prisma db push`.
- Nhóm **chưa dùng thư mục migrations**: đừng chạy `prisma migrate dev` và đừng commit thư mục `prisma/migrations` khi Lead chưa chốt.

## 3. Mỗi lần làm một task

```bash
git checkout main
git pull                                   # luôn lấy bản mới nhất trước
git checkout -b feat/<số issue>-<ten-ngan> # vd: feat/40-so-do-chuong
# ... code + viết unit test cho service mới ...
npm run lint && npm run typecheck && npm run test:unit && npm run test:e2e   # đúng các bước bot chạy
git add .
git commit -m "feat(stable): API so do chuong va gan o"
git push -u origin feat/<số issue>-<ten-ngan>
```

Sau đó lên GitHub bấm **Compare & pull request** vào nhánh `main`:

1. Điền đủ **mẫu PR** (tự hiện ra), tích các mục đã làm thật.
2. Ghi `Refs #<số issue>`. PR cuối cùng của task (khi cả FE lẫn BE đã xong) thì ghi `Closes #<số issue>`.
3. Chờ bot CI chạy xanh và Michael review (CODEOWNERS) rồi mới merge.

Đọc **đặc tả trong issue** trước khi code: luồng nghiệp vụ, việc FE/BE, API, tiêu chí nghiệm thu. Đặc tả gốc đầy đủ nằm ở `docs/specs/`. Chốt API (endpoint, body, mã lỗi `code`) với người FE cùng cặp trước khi code.

## 4. Bot kiểm tra gì (repo BE)

| Bước | Lệnh | Qua khi |
|---|---|---|
| 0. Ranh giới repo | tự chạy | Không có file giao diện trong repo |
| 1. Lint & Typecheck | `npm run lint`, `npm run typecheck` | **0 lỗi và 0 cảnh báo** (`--max-warnings=0`) |
| 2. Unit test | `npm run test:unit` | Tất cả pass |
| 3. API test | `npm run test:e2e` | Tất cả pass |
| 4. SonarQube | tự chạy | Không có lỗi bảo mật nghiêm trọng |

Quy tắc của mẫu PR: chỉ code BE; làm đúng tiêu chí của issue, không tự thêm tính năng; không cài package mới khi Lead chưa duyệt; API phải tự kiểm tra quyền ở server (không chỉ dựa vào FE ẩn nút).

## 5. Lỗi hay gặp

| Lỗi | Cách sửa |
|---|---|
| Lint báo `Delete ␍` hoặc sai định dạng | Chạy `npx eslint "{src,test}/**/*.ts" --fix` |
| Lint báo biến không dùng | Xóa biến đó; riêng tham số hàm không dùng thì đặt tên bắt đầu bằng `_` |
| `Property 'xxx' does not exist on PrismaClient` | Chạy `npx prisma generate` |
| Lỗi kết nối DB khi chạy | Kiểm tra PostgreSQL đã bật và `DATABASE_URL` trong `.env` |
| `npm ci` báo lock không khớp | Không sửa tay `package-lock.json`. Chạy `git checkout package-lock.json` rồi `npm ci` lại |
| `git push` bị từ chối (rejected) | `git pull origin main` vào nhánh của bạn, sửa xung đột nếu có, rồi push lại |
| Lỡ commit `.env` | Báo ngay cho Lead để đổi mật khẩu DB/JWT; `.env` đã bị bỏ qua, đừng dùng `git add -f` |
| CI đỏ | Mở tab **Checks** của PR xem bước nào lỗi, chạy lại đúng lệnh đó trên máy |
