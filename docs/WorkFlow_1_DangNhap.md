# WorkFlow 1 · Đăng nhập

> **Bộ WorkFlow — mỗi flow một file, chỉ mô tả luồng chạy thật.** File này là bản chuẩn cho Flow 1.
> Đã đối chiếu với code trong hai repo `Horse-Training-Club` (FE) và `Horse-Training-Club-BE` (BE) và chạy thử ngày 28/09/2026.
> Stack: Vite + React + TS ↔ Express 5 + Prisma + PostgreSQL · **xác thực bằng session cookie**.
>
> Các file còn lại của bộ: WorkFlow 2 Hồ sơ Ngựa · 3 Giáo án · 4 Y tế · 5 Dashboard · 6 Chuồng trại · 7 Thi đấu — làm lần lượt, chưa viết.

---

## 0. Luồng này chạm vào những gì

**File FE** (`src/…`)

| File | Vai trò |
|---|---|
| `features/auth/pages/LoginPage.tsx` | Màn đăng nhập (route `/login`) |
| `shared/lib/api.ts` | Gói fetch: gắn cookie, bắt 401/403 tập trung |
| `shared/lib/auth.ts` · `shared/components/layout/AuthProvider.tsx` | Gọi login/logout/me · giữ trạng thái phiên |
| `shared/lib/messages.ts` | Mã lỗi → câu tiếng Anh hiển thị (`loginFailure`) |
| `shared/lib/permissions.ts` | Bảng quyền, Sidebar và RoleGuard cùng đọc |
| `app/router.tsx` · `app/RoleGuard.tsx` | Bảng route, chặn route thiếu quyền |
| `shared/components/layout/SessionExpiredModal.tsx` · `features/auth/pages/Forbidden403Page.tsx` | Hai màn hệ thống |
| `features/accounts/components/PermissionRequestsPanel.tsx` | Danh sách yêu cầu cấp quyền của Club Manager (§7) |
| `shared/mock/handlers.ts` | Bản giả lập, là chuẩn mà BE phải khớp |

**File BE** (`src/…`): `routes/index.ts` · `services/auth.service.ts` · `services/audit.service.ts` · `middlewares/auth.ts` · `middlewares/errorHandler.ts`

**Endpoint** — base `VITE_API_URL`, mọi lời gọi kèm `credentials: "include"`

`POST /auth/login` · `GET /auth/me` · `POST /auth/logout` · `POST /audit/forbidden` · `POST /permission-requests` · `GET /permission-requests` · `POST /permission-requests/{id}/resolve`

**Bảng DB**: `accounts` · `login_attempts` · `session` · `audit_logs` · `permission_requests`

**Thiết kế** (tham khảo): `GiaiDoan0_DangNhap.dc.html`, phương án 1a — cột trái 660px + ảnh editorial, form rộng 392px.

---

## 1. Luồng chính — đăng nhập thành công

1. Mở `/login`. Nếu đã có phiên → điều hướng thẳng vào app, không hiện form.
2. Nhập Email + Password, bấm **Enter workspace**.
3. FE validate tại chỗ: không rỗng, đúng định dạng, **email phải kết thúc bằng `@gmail.com`**. Sai → lỗi dưới ô, **không gọi API**.
4. Nút chuyển "Signing in…", hai ô và ô "Keep me signed in" disable — chặn bấm hai lần.
5. `POST /auth/login` với `{ email, password, remember }`.
6. BE kiểm theo đúng thứ tự: **có bị khóa tạm không → email tồn tại + mật khẩu đúng không → `status` có phải `ACTIVE` không**. Email không tồn tại vẫn chạy so sánh bcrypt với một hash giả, để thời gian trả lời không lộ email có thật.
7. Đúng hết → cấp phiên mới (`session.regenerate`, chống session fixation), `Set-Cookie` HttpOnly, xóa bản ghi `login_attempts` của email đó, ghi audit `LOGIN`, trả `{ user }`.
8. FE nạp `user` vào `AuthProvider`, Sidebar dựng lại theo `user.permissions`.
9. Điều hướng: về `?next=` nếu có (trang đang đứng trước khi bị đưa ra ngoài), không thì **`/dashboard`** — mọi vai trò dùng chung route này, nội dung Dashboard tự đổi theo vai trò.

**Đổi gì trong DB:** thêm 1 dòng `session`, xóa dòng `login_attempts`, thêm 1 dòng `audit_logs`, cập nhật `accounts.last_active`.

---

## 2. Rẽ nhánh — 8 trường hợp, mỗi cái một cách hiện

Tất cả đều trả về thân lỗi chuẩn `{ code, message, data }`. FE đọc `code`, `messages.ts > loginFailure` đổi thành câu tiếng Anh.

| HTTP | `code` | Nguyên nhân | Màn hình phản ứng |
|---|---|---|---|
| 401 | `INVALID_CREDENTIALS` | Sai email **hoặc** sai mật khẩu | Alert `danger` "Email or password is incorrect". Không nói rõ sai cái nào. `data.attemptsLeft = 1` thì thêm dòng *"1 attempt remaining before this account is temporarily locked."* |
| 429 | `ATTEMPTS_EXCEEDED` | Sai 5 lần | Alert `danger` **đếm ngược sống** tới `data.retryAt` + nút Enter workspace bị chặn (kèm lý do) — xem §3 |
| 423 | `ACCOUNT_LOCKED` | Club Manager đã khóa | Alert `danger`: `lockedAt` + **lý do** (`data.reason`); chân form hiện `fullName · roleLabel` |
| 403 | `EMAIL_NOT_VERIFIED` | `PENDING_EMAIL` | Alert `warn` + nút **Enter the code** → `/sign-up/verify?email=…` (màn nhập OTP, có nút gửi lại mã) |
| 403 | `ACCOUNT_PENDING` | `PENDING_APPROVAL` | Alert `warn` + **`requestCode`** (vd. `REQ-2609-012`) để người dùng nhắc quản lý |
| 403 | `PENDING_INTAKE` | `PENDING_INTAKE` | Alert `warn` — chủ ngựa chưa gắn con nào |
| 403 | `ACCOUNT_INACTIVE` / `ACCOUNT_REJECTED` | Ngừng hoạt động / bị từ chối | Alert `danger` + **lý do** Club Manager đã ghi |
| 403 | `ACCOUNT_INVITED` | `INVITED` | Xem ghi chú bên dưới |

**Quy tắc màu:** `danger` khi người dùng bị từ chối, `warn` khi họ **đang chờ** — không ai làm gì sai, dùng đỏ ở đây là làm họ tưởng nhập sai mật khẩu.

**Không bao giờ** để lộ email có tồn tại hay không. Email sai và mật khẩu sai trả cùng một `code`, cùng `data`, thời gian trả lời như nhau.

**Tài khoản `INVITED`** chưa có mật khẩu, nên đăng nhập bằng bất kỳ mật khẩu nào cũng nhận `INVALID_CREDENTIALS` — nếu trả `ACCOUNT_INVITED` thì chính câu trả lời đó tiết lộ "email này đã được mời", trái quy tắc trên. Thay vào đó màn đăng nhập luôn có link **"Invited as staff? Accept the invitation"** → `/accept-invite`. (Code `ACCOUNT_INVITED` và nút "Accept invitation" vẫn còn trong `messages.ts` nếu sau này BE cần dùng.)

---

## 3. Khóa tạm sau 5 lần sai

Bảng `login_attempts` khóa chính là `email`, có `fails` và `locked_until`.

1. Mỗi lần sai: `fails += 1`. **Đếm cả email không tồn tại** — nếu không, kẻ tấn công dò ra được email nào có thật.
2. Sai lần 4: response kèm `data.attemptsLeft = 1`, FE hiện thêm dòng *"1 attempt remaining before this account is temporarily locked."*
3. Sai lần 5: đặt `locked_until = now + 15 phút`, ghi audit `LOGIN_LOCKED_OUT`, trả `429` kèm `data.retryAt`.
4. FE chặn nút (cả phím Enter), Alert đếm ngược `mm:ss` tới `retryAt` và ghi giờ mở lại. Hết giờ → Alert *"You can try again now"*, nút dùng lại được.
5. Người dùng **F5 giữa lúc đếm** → thử lại → nhận `429` kèm **đúng `retryAt` cũ** → dựng lại đồng hồ. Thời gian **lấy từ server**, không tính ở client.
6. Đổi sang email khác trong ô → bỏ đồng hồ (khóa tính theo email).
7. Đăng nhập đúng, hoặc đặt lại mật khẩu thành công (Forgot password) → xóa bản ghi, gỡ khóa ngay.

Khóa tạm **không** đổi `accounts.status`. Nó khác hẳn `LOCKED` do Club Manager đặt. Chữ `LOCKED` chỉ có một nghĩa: tài khoản bị quản lý khóa.

---

## 4. Khôi phục phiên khi tải lại trang

1. App khởi động → `AuthProvider` gọi `GET /auth/me` (chế độ im lặng: 401 lúc này không mở modal).
2. `200` → nạp user, vào thẳng trang đang xem.
3. `401 UNAUTHENTICATED` → coi như chưa đăng nhập, về `/login?next=<trang đang xem>`.
4. Trong lúc chờ: `AppShell` hiện "Loading workspace…", **không nháy sang trang đăng nhập rồi nháy lại**.

---

## 5. Hết phiên giữa chừng

Phiên hết hạn sau **30 phút không thao tác** (cookie `rolling`: mỗi request gia hạn lại). Tài khoản bị khóa / vô hiệu hóa giữa chừng cũng mất phiên ngay.

1. Lời gọi API kế tiếp trả `401 UNAUTHENTICATED`. (FE cũng tự bật modal sau 30 phút không có click/phím/cuộn.)
2. `api.ts` bắt lỗi này **ở một chỗ duy nhất**, không bắt lẻ ở từng trang.
3. Mở modal **Session Expired**: không đóng được bằng Esc, không click ra ngoài, không nút X. Một nút duy nhất **Sign in again**.
4. Bấm → xóa phiên phía client, về `/login?next=<trang đang đứng>`; đăng nhập xong quay lại đúng trang đó.
5. Nhiều request cùng trả 401 một lúc → **chỉ mở một modal**, không chồng.

---

## 6. Đăng xuất

1. Nút **Log out** trên Topbar → modal xác nhận.
2. `POST /auth/logout` → BE hủy phiên, xóa cookie, ghi audit `LOGOUT`.
3. FE xóa user khỏi `AuthProvider`; khung app (và mọi dữ liệu đang giữ trong trang) bị gỡ khỏi màn hình, rồi về `/login`.
4. API lỗi thì **vẫn xóa phía client và vẫn điều hướng**. Không giữ người dùng ở lại chỉ vì API hỏng.

Người tiếp theo đăng nhập trên cùng máy không được thấy dữ liệu người trước, dù chỉ một khoảnh khắc.

---

## 7. Vào trang không đủ quyền

1. Người dùng gõ tay một URL ngoài quyền → `RoleGuard` đọc `permissions.ts` → chặn, hiện 403 ngay tại URL đó (giữ khung app).
2. FE gọi `POST /audit/forbidden` với `{ screen }` → BE ghi audit `ACCESS_DENIED`, trả `{ reference, managerName }`.
3. Màn 403 hiện: mã tham chiếu `403-2609-0073`, **tên quản lý cần liên hệ**, nút **Back to my workspace** và **Request the permission**.
4. Bấm Request the permission → `POST /permission-requests` `{ screen, reference }` → ghi audit `PERMISSION_REQUESTED`; nút chuyển sang bị chặn "already sent". Yêu cầu hiện trong panel **Permission requests** đầu trang Accounts của Club Manager (gửi lại cho cùng màn hình thì cập nhật, không tạo trùng).
5. Club Manager: **Open permissions** (sang `/accounts/{id}/permissions` để bật quyền) → **Mark granted**, hoặc **Dismiss**. BE lưu `status / resolved_at / resolved_by`, ghi audit `PERMISSION_REQUEST_GRANTED` / `_DISMISSED`.
6. BE chặn **độc lập với FE**: gọi thẳng endpoint bằng tài khoản thiếu quyền vẫn phải trả `403 FORBIDDEN` (kể cả `GET /permission-requests`). Thiếu một trong hai tầng là lỗi.

**Nút bị chặn trong trang thì disable kèm tooltip nói rõ ai mới làm được, không ẩn đi** — `Button blockedReason` (bọc `DisabledHint`). Chỉ ẩn khi vai trò đó không bao giờ có quyền ở bất kỳ điều kiện nào.

---

## 8. Chạy thử

**Không có backend:** `.env.local` đặt `VITE_USE_MOCK=true`. OTP luôn là `123456`. Reset dữ liệu: F12 → Application → Local Storage → xóa `equiflow.mock.db.v1` (hoặc tăng `SEED_VERSION` trong `shared/mock/accounts.ts`).

**Có backend:** `VITE_USE_MOCK=false`, `VITE_API_URL=http://localhost:8081/api` (máy này cổng 8080 bị chiếm). Reset dữ liệu: `npm run db:seed` bên BE.

Mật khẩu mọi tài khoản mẫu: `equiflow123` (riêng `minhmaiki@gmail.com`: `123456`).

| Email | Dùng để thử |
|---|---|
| `viet.do@gmail.com` | Club Manager — vào được `/accounts`, thấy panel Permission requests |
| `nam.tran@gmail.com` | Head Trainer — vào `/accounts` phải ra 403 |
| `nhan.vien.groom@gmail.com` | Groom (Nhân viên chăm sóc) — xem lịch sinh hoạt, cập nhật trạng thái ngựa |
| `bac.si.thuy@gmail.com` | Veterinarian (Bác sĩ thú y) — quản lý hồ sơ y tế, thêm bệnh án, đơn thuốc |
| `chu.ngua.owner@gmail.com` | Owner (Chủ ngựa) — xem thông tin cá nhân và ngựa của mình, bị giới hạn dữ liệu |
| `ha.ly@gmail.com` | Sai mật khẩu 5 lần → khóa tạm + đếm ngược |
| `binh.pham@gmail.com` | `LOCKED` → `423` + lý do |
| `anh.nguyen@gmail.com` | Chờ duyệt → `403 ACCOUNT_PENDING` + `REQ-2609-012` |
| `ngoc.trinh@gmail.com` | Chưa xác minh email → nút Enter the code |
| `huy.hoang@gmail.com` | `PENDING_INTAKE` |
| `khang.dang@gmail.com` · `trang.bui@gmail.com` | `INACTIVE` · `REJECTED` + lý do |
| `tung.ngo@gmail.com` | `INVITED` → dùng link Accept the invitation |

`handlers.ts` là **bản chuẩn** — BE phải trả đúng như nó. Khớp rồi thì đổi `VITE_USE_MOCK=false` là chạy, không sửa dòng nào trong trang.

---

## 9. Xong khi nào

Đã chạy thử 28/09/2026 bằng trình duyệt thật (Edge headless) trên DB test riêng: **34/34** kiểm tra giao diện + **75/75** và **41/41** kiểm tra API.

- [x] Sai 5 lần → khóa tạm, **F5 xong đồng hồ vẫn đúng** (giờ hiện khớp `locked_until` trong DB)
- [x] Email không tồn tại cũng bị đếm và cũng bị khóa tạm
- [x] Đủ các nhánh lỗi ở §2, đúng mức Alert (`warn` cho các trạng thái đang chờ); `INVITED` theo ghi chú §2
- [x] Không thông báo nào để lộ email có tồn tại hay không (cùng body, thời gian trả lời chênh < 10ms)
- [x] F5 khi đang đăng nhập: không nháy qua màn sign-in
- [x] 401 và 403 xử lý ở **một** chỗ trong `api.ts`
- [x] Modal Session Expired không đóng được bằng Esc / click nền; nhiều 401 chỉ mở một modal
- [x] Đăng xuất xong đăng nhập tài khoản khác: không thấy dữ liệu người trước (kể cả khi API logout lỗi)
- [x] Gọi thẳng endpoint bằng tài khoản thiếu quyền → BE trả `403`
- [x] Màn 403 hiện mã tham chiếu và tên quản lý; yêu cầu cấp quyền tới được Club Manager
- [x] `npm run build` không lỗi (cả FE và BE)

---

## 10. Đã chốt

1. **5 trạng thái thiết kế chưa vẽ** (`EMAIL_NOT_VERIFIED`, `PENDING_INTAKE`, `ACCOUNT_INVITED`, `ACCOUNT_INACTIVE`, `ACCOUNT_REJECTED`): hiển thị theo `messages.ts > loginFailure` với quy tắc màu ở §2. `INVITED` xử lý theo ghi chú §2.
2. **`remember`**: không tick → cookie phiên sống 30 phút, gia hạn theo mỗi request (hết khi 30 phút không thao tác). Tick → cookie 30 ngày. Cả hai đều `HttpOnly`, `SameSite=Lax`. Chế độ mock: sessionStorage / localStorage.
3. **Điều hướng sau đăng nhập**: `?next=` nếu có, không thì `/dashboard` cho mọi vai trò (§1.9).
4. **Prototype cũ**: Đường dẫn prototype cũ (`D:\Tailieu_AI\NewHorse\NewHorse`) và đường dẫn ghi ở bản trước của file này (`D:\Tailieu_Project\NewHorse\NewHorse`) **đều không có trên máy** — cần người giữ prototype cho đường dẫn đúng.

---

*Cập nhật 28/09/2026 theo code thật của hai repo `Horse-Training-Club` và `Horse-Training-Club-BE`; `docs/API_CONTRACT.md` đã có đủ các endpoint ở trên.*
