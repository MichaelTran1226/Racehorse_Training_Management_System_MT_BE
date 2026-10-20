# Hướng dẫn Git & GitHub: từ con số 0 đến quy trình của dev chuyên nghiệp

> Viết cho dự án EquiFlow (SWP391), làm việc trên 2 repo của nhóm:
> - BE: `MichaelTran1226/Racehorse_Training_Management_System_MT_BE`
> - FE: `MichaelTran1226/Racehorse_Training_Management_System_MT_FE`
>
> Quy trình trong file này khớp với `docs/HUONG_DAN_GITHUB.md` trong hai repo trên. Khi hai bên lệch nhau, **tài liệu trong repo nhóm là chuẩn**.

---

## Mục lục

1. [Git và GitHub khác nhau thế nào](#1-git-và-github-khác-nhau-thế-nào)
2. [Các khái niệm phải biết](#2-các-khái-niệm-phải-biết)
3. [Máy của bạn đang được cài như thế nào](#3-máy-của-bạn-đang-được-cài-như-thế-nào)
4. [Cài đặt một lần](#4-cài-đặt-một-lần)
5. [Mở máy lên mỗi ngày](#5-mở-máy-lên-mỗi-ngày)
6. [Quy trình làm một task từ đầu đến cuối](#6-quy-trình-làm-một-task-từ-đầu-đến-cuối)
7. [Đặt tên nhánh và viết commit](#7-đặt-tên-nhánh-và-viết-commit)
8. [Pull Request (PR)](#8-pull-request-pr)
9. [Review code của người khác](#9-review-code-của-người-khác)
10. [CI: bot kiểm tra tự động](#10-ci-bot-kiểm-tra-tự-động)
11. [Đồng bộ code: fetch, pull, merge](#11-đồng-bộ-code-fetch-pull-merge)
12. [Xung đột (conflict) và cách gỡ](#12-xung-đột-conflict-và-cách-gỡ)
13. [Database khi làm nhóm](#13-database-khi-làm-nhóm)
14. [Bí mật (.env, mật khẩu) và .gitignore](#14-bí-mật-env-mật-khẩu-và-gitignore)
15. [Lỡ tay: cách sửa từng loại sai lầm](#15-lỡ-tay-cách-sửa-từng-loại-sai-lầm)
16. [Issue, Project board, thông báo](#16-issue-project-board-thông-báo)
17. [Dùng Git trong VS Code](#17-dùng-git-trong-vs-code)
18. [Bảng lệnh tra nhanh](#18-bảng-lệnh-tra-nhanh)
19. [Luật vàng](#19-luật-vàng)
20. [Hỏi đáp](#20-hỏi-đáp)
21. [Từ điển thuật ngữ](#21-từ-điển-thuật-ngữ)

---

## 1. Git và GitHub khác nhau thế nào

| | **Git** | **GitHub** |
|---|---|---|
| Là gì | Phần mềm chạy **trên máy bạn**, ghi lại lịch sử thay đổi của code | **Trang web** lưu repo trên mạng để cả nhóm dùng chung |
| Cần mạng? | Không (commit, xem lịch sử, tạo nhánh đều chạy offline) | Có |
| Dùng để | Commit, tạo nhánh, xem ai sửa gì, quay lại bản cũ | Chia sẻ code, Pull Request, review, CI, issue, Project board |

Nói gọn: **Git là công cụ, GitHub là nơi cả nhóm gặp nhau.** Lệnh `git push` đẩy lịch sử từ máy bạn lên GitHub, còn `git pull` kéo từ GitHub về máy.

---

## 2. Các khái niệm phải biết

### Repository (repo)
Là một thư mục dự án có lịch sử Git đi kèm. Lịch sử này nằm trong thư mục ẩn `.git`. **Một folder = một repo.** Nhóm có 2 repo, nên trên máy bạn có 2 folder.

### Remote và `origin`
**Remote** là bản sao của repo trên GitHub. Khi clone, Git tự đặt tên cho remote đó là `origin`. Ví dụ `git push origin main` nghĩa là "đẩy nhánh main lên GitHub".

### Ba "khu vực" của Git
```
 Thư mục làm việc  ──git add──►  Staging (khu chờ)  ──git commit──►  Lịch sử (.git)  ──git push──►  GitHub
 (file bạn đang sửa)             (đã chọn để commit)                  (trên máy bạn)                 (origin)
```
- **Sửa file**: Git biết là file đã đổi, nhưng chưa ghi gì vào lịch sử.
- **`git add`**: chọn những thay đổi sẽ đưa vào commit tiếp theo.
- **`git commit`**: chụp lại một "bản chụp" có tên, tác giả, thời gian và lời mô tả.
- **`git push`**: đẩy các commit lên GitHub. **Chưa push thì chỉ máy bạn có.**

### Commit
Là một bản chụp toàn bộ code tại một thời điểm, có mã định danh riêng (hash, ví dụ `dc21e48`). Commit **không phải folder mới**. Git chỉ lưu phần khác biệt, rất gọn nhẹ.

### Branch (nhánh)
Là một "dòng thời gian" riêng để bạn làm việc mà không ảnh hưởng người khác.
```
main:        A ── B ── C ─────────── F      ← F = merge commit (gộp D, E vào main)
                        \           /
feat/40-...:             D ─── E ──         ← commit của bạn trên nhánh
```
- **`main`** là bản chính thức: code đã được review và test, cả nhóm dựa vào đó để làm tiếp.
- **Nhánh của bạn** là bản nháp riêng, hỏng cũng không sao.
- Chuyển nhánh (`git checkout`) thì Git **đổi nội dung file ngay trong folder đó**. Không có folder mới nào được tạo ra.

### Merge
Là gộp các commit của một nhánh vào nhánh khác. Ở nhóm này, nhánh chỉ được gộp vào `main` qua **Pull Request**.

### Pull Request (PR)
Là "đơn xin gộp nhánh của tôi vào main". Trong PR, bot CI chạy test, người khác review và comment, rồi mới bấm merge.

### HEAD
Là con trỏ "bạn đang đứng ở đâu", thường là commit mới nhất của nhánh hiện tại. `HEAD~1` nghĩa là lùi một commit.

### Clone, fetch, pull, push

| Lệnh | Làm gì | Dùng khi nào |
|---|---|---|
| `git clone <url>` | Tải toàn bộ repo về thành folder mới | **Chỉ một lần**, lúc mới lấy dự án về |
| `git fetch` | Hỏi GitHub có gì mới, tải về nhưng **chưa đổi file** của bạn | Muốn xem trước có ai push gì chưa |
| `git pull` | `fetch` rồi `merge` ngay vào nhánh bạn đang đứng | Muốn lấy code mới về |
| `git push` | Đẩy commit của bạn lên GitHub | Sau khi commit |

---

## 3. Máy của bạn đang được cài như thế nào

```
D:\My_Project\
├── EquiFlow\                  ← thư mục gom 2 repo nhóm (KHÔNG phải repo git)
│   ├── MT_BE\                 ← repo BE (NestJS + JWT + Prisma), push lên ..._MT_BE
│   │   └── .env               ← cấu hình riêng máy bạn (không lên git)
│   └── MT_FE\                 ← repo FE (Vite + React), push lên ..._MT_FE
│       └── .env.local         ← VITE_USE_MOCK=false, VITE_API_URL=http://localhost:3000/api
├── Horse-Training-Club\       ← FE cũ của bạn (session cookie, KHÔNG dùng được với BE nhóm)
└── Horse-Training-Club-BE\    ← BE Express cũ (port 8081, DB equiflow)
```

| Thành phần | Giá trị |
|---|---|
| PostgreSQL | `localhost:3333` (một server Postgres cho cả bộ cũ lẫn bộ nhóm) |
| Database của BE nhóm | `equiflow_nest` (dữ liệu cũ của bạn: 7 tài khoản, 2 con ngựa). `racehorse_db` là DB seed sạch, để dự phòng. Bộ cũ dùng `equiflow`. Các DB không đụng nhau |
| BE nhóm | `npm run start:dev` trong `MT_BE`: API ở http://localhost:3000/api, Swagger ở http://localhost:3000/api/docs |
| FE nhóm | `npm run dev` trong `MT_FE`: http://localhost:5173 |
| Tài khoản mẫu | `manager@` / `trainer@` / `vet@` / `groom@` / `owner@equiflow.com`, mật khẩu `EquiFlow@2026` |
| Email OTP | Gửi thật qua Gmail (App Password nằm trong `MT_BE\.env`), `DEV_FIXED_OTP=false` nên mã là ngẫu nhiên |

> FE chỉ chạy được một bộ tại một thời điểm, vì cả hai bộ đều dùng port 5173. Muốn chạy FE nhóm thì tắt FE cũ trước. Nếu không, Vite nhảy sang port 5174 và BE nhóm sẽ chặn với lỗi CORS.

---

## 4. Cài đặt một lần

Máy bạn đã xong các bước này. Phần dưới để tham khảo khi cài máy mới hoặc hướng dẫn bạn cùng nhóm.

1. **Cài** [Git](https://git-scm.com/downloads), [Node.js ≥ 20.19](https://nodejs.org/) (bản LTS), [PostgreSQL](https://www.postgresql.org/download/). Nếu muốn gõ lệnh GitHub thì cài thêm [GitHub CLI](https://cli.github.com/).
2. **Khai báo tên** (email phải trùng với tài khoản GitHub, để commit hiện đúng avatar):
   ```bash
   git config --global user.name "MinhMQ1711"
   git config --global user.email "maiquangminh1711@gmail.com"
   ```
3. **Đăng nhập GitHub** trên máy: chạy `gh auth login`, hoặc để Git Credential Manager tự bật cửa sổ đăng nhập ở lần push đầu tiên.
4. **Xin quyền Write** vào 2 repo (nhờ Michael, người làm Lead).
5. **Clone và cài từng repo:**
   ```bash
   cd D:\My_Project\EquiFlow
   git clone https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE.git MT_BE
   git clone https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_FE.git MT_FE

   # BE
   cd MT_BE
   npm ci
   copy .env.example .env         # rồi sửa DATABASE_URL, DIRECT_URL, SMTP_USER, SMTP_PASS
   npx prisma generate
   npx prisma db push
   npm run db:seed

   # FE
   cd ..\MT_FE
   npm ci
   copy .env.example .env.local   # rồi đặt VITE_USE_MOCK=false
   ```

> Dùng `npm ci` chứ không dùng `npm install`. `npm ci` cài **đúng** phiên bản ghi trong `package-lock.json`, nên máy ai cũng giống nhau và không làm file lock bị đổi.

---

## 5. Mở máy lên mỗi ngày

### Bước 1: Xem GitHub (khoảng 2 phút)
- **[Project 2](https://github.com/users/MichaelTran1226/projects/2):** task nào của bạn, trạng thái ra sao, có task mới giao không.
- **Chuông thông báo** (góc phải trên GitHub): ai comment, ai tag bạn, PR nào được merge.
- **PR của bạn:** có bị yêu cầu sửa không, CI có đỏ không.
  ```bash
  gh pr status                                   # PR của bạn + PR đang chờ bạn review
  gh pr list --search "review-requested:@me"     # chỉ các PR nhờ bạn review
  ```

### Bước 2: Kiểm tra xem có ai push gì chưa (làm ở **cả hai** folder)
```bash
cd D:\My_Project\EquiFlow\MT_BE
git status                               # đang ở nhánh nào, có file sửa dở không?
git fetch --prune                        # hỏi GitHub (chưa đổi file của bạn)
git log --oneline main..origin/main      # các commit mới trên main mà máy bạn chưa có
```
- Lệnh cuối **không in gì** nghĩa là không có gì mới.
- **Có dòng in ra** nghĩa là có người vừa merge, cần lấy về (bước 3).

`--prune` dọn các nhánh đã bị xoá trên GitHub khỏi danh sách trên máy bạn.

### Bước 3: Lấy code mới về
```bash
git checkout main
git pull
```
Nếu đang làm dở trên nhánh của mình và muốn nhận code mới của main:
```bash
git pull origin main        # đứng trên nhánh của bạn, gộp main mới vào nhánh đó
```

### Bước 4: Xem có cần cài lại gì không
```bash
git diff --stat HEAD@{1}    # chạy ngay sau pull: liệt kê các file vừa thay đổi
```

| Thấy file này đổi | Thì chạy |
|---|---|
| `package.json` / `package-lock.json` | `npm ci` |
| `prisma/schema.prisma` (BE) | `npx prisma generate` rồi `npx prisma db push` |
| `prisma/seed.ts` (BE) | `npm run db:seed` nếu muốn có dữ liệu mẫu mới |
| `.env.example` | Mở ra xem biến mới, tự thêm vào `.env` / `.env.local` |

### Bước 5: Bật môi trường
Mở 2 terminal riêng. Postgres chạy nền sẵn, không cần bật.
```bash
# terminal 1
cd D:\My_Project\EquiFlow\MT_BE ; npm run start:dev
# terminal 2
cd D:\My_Project\EquiFlow\MT_FE ; npm run dev
```

---

## 6. Quy trình làm một task từ đầu đến cuối

```
Nhận issue ─► Đọc đặc tả ─► Chốt API với cặp FE/BE ─► Tạo nhánh ─► Code + commit nhỏ
    ─► Tự test (lint/typecheck/test) ─► Push ─► Mở PR ─► CI xanh + review ─► Sửa theo góp ý
    ─► Merge ─► Dọn nhánh ─► Cập nhật issue/Project
```

### 6.1 Nhận task
- Trên Project 2, **gán task cho mình** (Assignees) và chuyển sang **In Progress**.
- **Đọc hết đặc tả trong issue**: luồng nghiệp vụ, việc của FE, việc của BE, API, **tiêu chí nghiệm thu (AC)**. Bản đầy đủ nằm ở `docs/specs/` trong repo.
- Chỗ nào chưa rõ thì **hỏi ngay trong issue** (comment), đừng tự đoán.

### 6.2 Chốt API trước khi code
Người làm FE và người làm BE trong cùng cặp thống nhất với nhau: endpoint, method, body gửi lên, dữ liệu trả về, **mã lỗi** (`code`). Ghi lại vào issue để cả hai cùng làm theo.

### 6.3 Tạo nhánh từ `main` mới nhất
```bash
git checkout main
git pull
git checkout -b feat/40-so-do-chuong
```
Task đụng cả FE lẫn BE thì tạo nhánh **cùng tên** ở cả 2 repo để dễ nhận ra.

### 6.4 Code và commit
- **Commit nhỏ, mỗi commit làm một việc.** Ví dụ: một commit "thêm API", một commit "thêm test", **không** gộp chung một commit "làm hết".
- Trước khi commit, luôn xem lại:
  ```bash
  git status          # file nào đổi, có lẫn file lạ không (.env, file tạm...)
  git diff            # nội dung đã sửa
  git add <file>      # chọn từng file; chỉ dùng "git add ." khi chắc chắn không có file lạ
  git commit -m "feat(stable): API so do chuong va gan o"
  ```

### 6.5 Tự kiểm tra (đúng các bước bot CI sẽ chạy)
```bash
# BE
npm run lint && npm run typecheck && npm run test:unit && npm run test:e2e
# FE
npm run lint && npm run typecheck && npm run build
```
**Máy bạn đỏ thì CI chắc chắn cũng đỏ.** Sửa cho xanh rồi mới push.

### 6.6 Push và mở PR
```bash
git push -u origin feat/40-so-do-chuong     # -u: lần sau chỉ cần gõ "git push"
```
Lên GitHub, bấm **Compare & pull request** (hoặc chạy `gh pr create`). Chi tiết ở [mục 8](#8-pull-request-pr).

### 6.7 Review và sửa theo góp ý
- Được góp ý thì sửa **trên chính nhánh đó**, commit rồi `git push`. **PR tự cập nhật**, không mở PR mới.
- Trả lời từng comment ("Đã sửa ở commit abc123"), rồi bấm **Resolve conversation**.

### 6.8 Sau khi merge
```bash
git checkout main
git pull                                  # main giờ đã có code của bạn
git branch -d feat/40-so-do-chuong        # xoá nhánh trên máy
```
Trên GitHub, bấm **Delete branch** ở cuối PR (nếu chưa tự xoá). Cập nhật trạng thái trên Project board.

### 6.9 Cuối ngày
- **Push phần đang làm lên nhánh của bạn**, kể cả khi chưa xong. Máy hỏng hay mất thì code vẫn còn trên GitHub.
- Chưa muốn ai review thì mở **Draft PR** (PR nháp).
- Comment một dòng vào issue: đã làm tới đâu, đang vướng gì.

---

## 7. Đặt tên nhánh và viết commit

### Tên nhánh: `<loại>/<số issue>-<mô-tả-ngắn>`

| Loại | Dùng khi | Ví dụ |
|---|---|---|
| `feat/` | Thêm chức năng | `feat/40-so-do-chuong` |
| `fix/` | Sửa lỗi | `fix/52-otp-het-han-sai` |
| `docs/` | Chỉ sửa tài liệu | `docs/huong-dan-github` |
| `refactor/` | Sắp xếp lại code, không đổi hành vi | `refactor/tach-auth-service` |
| `test/` | Chỉ thêm hoặc sửa test | `test/accounts-service` |

Viết chữ thường, không dấu, nối bằng `-`. CI của cả hai repo chỉ tự chạy khi push lên các nhánh `feat/**`, `fix/**` và `main`. Khi mở PR vào `main` thì CI luôn chạy, bất kể tên nhánh.

### Commit message: chuẩn *Conventional Commits*
```
<loại>(<phạm vi>): <mô tả ngắn, thể mệnh lệnh>

<thân (không bắt buộc): VÌ SAO sửa, sửa thế nào>
```
Ví dụ thật trong repo:
```
fix(mail): cấu hình mẫu gửi OTP qua Gmail SMTP

Clone repo rồi copy .env.example thì EMAIL_PROVIDER="mock" nên mã OTP
chỉ in ra log, không gửi mail. ...
```

| Loại | Ý nghĩa |
|---|---|
| `feat` | Chức năng mới |
| `fix` | Sửa lỗi |
| `docs` | Tài liệu |
| `refactor` | Đổi cấu trúc code, không đổi hành vi |
| `test` | Thêm hoặc sửa test |
| `chore` | Việc lặt vặt: cấu hình, cập nhật thư viện |
| `ci` | Sửa pipeline CI |

**Commit tốt:** ngắn, nói rõ sửa gì, và mỗi commit một việc.
**Commit xấu:** `update`, `fix bug`, `aaa`, `sửa lại`. Ba tuần sau không ai hiểu nó làm gì, kể cả chính bạn.

---

## 8. Pull Request (PR)

### Mở PR
1. Base: `main`, compare: nhánh của bạn.
2. **Tiêu đề** giống commit message chính, ví dụ `feat(stable): API so do chuong va gan o`.
3. **Điền đủ mẫu PR** (tự hiện ra khi mở PR). Chỉ tích những mục **đã làm thật**:
   - Traceability: repo, issue liên quan, Blueprint ID, loại thay đổi.
   - Cam kết phạm vi: đúng repo (BE không có `.tsx`, FE không có migration), không thêm tính năng ngoài AC, không cài package lạ.
   - Bằng chứng test: unit, e2e, lint, typecheck.
   - Tóm tắt thay đổi: **lỗi hoặc yêu cầu là gì → đã sửa thế nào → người khác cần làm gì** (ví dụ "chạy lại `prisma db push`").
4. **Liên kết issue:**
   - `Refs #33`: có liên quan, nhưng issue chưa đóng.
   - `Closes #33`: merge xong thì issue **tự đóng**. Chỉ ghi ở **PR cuối cùng** của task (khi cả FE lẫn BE đã xong).
   - Từ repo FE trỏ sang issue ở repo BE: `Refs MichaelTran1226/Racehorse_Training_Management_System_MT_BE#33`.

### Draft PR
Là PR nháp, dùng khi muốn đưa code lên cho người khác xem sớm hoặc để CI chạy thử. Làm xong thì bấm **Ready for review**.

### Trạng thái của PR

| Nhãn | Nghĩa |
|---|---|
| 🟢 **Open** | Đang chờ review hoặc merge |
| ⚪ **Draft** | Bản nháp, chưa nhờ review |
| 🟣 **Merged** | Đã gộp vào `main` |
| 🔴 **Closed** | Bị đóng mà không merge |

Xem bằng lệnh: `gh pr status`, `gh pr view <số>`, `gh pr checks <số>`.

### Làm sao biết PR đã merge
- Nhãn 🟣 **Merged** trên trang PR.
- Thông báo hoặc email của GitHub.
- `gh pr view <số>` hiện `state: MERGED`.
- Sau khi `git fetch`, chạy `git branch --merged origin/main`: nhánh nào có trong danh sách là đã vào main.

### Ai được merge?
Repo BE có file `.github/CODEOWNERS` ghi Michael là chủ của toàn bộ code, nên mỗi PR **tự động gán Michael làm reviewer**. `main` hiện chưa bật branch protection, nên về kỹ thuật GitHub không chặn bạn tự merge. Nhưng **quy trình của nhóm** là: chờ CI xanh và Michael duyệt, rồi mới merge. Nhóm đang merge kiểu **Merge commit** (commit dạng `Merge pull request #60 from ...`).

> Có 3 kiểu merge trên GitHub:
> - **Merge commit**: giữ nguyên các commit của nhánh và thêm một commit gộp.
> - **Squash and merge**: dồn mọi commit của nhánh thành 1 commit.
> - **Rebase and merge**: đặt các commit của nhánh nối tiếp lên đầu main.
>
> Nhóm chọn kiểu nào thì làm theo kiểu đó, không tự đổi.

### PR tốt trông như thế nào
- **Nhỏ**: dưới khoảng 400 dòng thay đổi thì review nhanh và ít sót lỗi. Task to thì chia thành nhiều PR.
- **Một mục đích**: không gộp "làm màn A + sửa lỗi B + đổi format cả project".
- **Có bằng chứng**: ảnh chụp màn hình (FE), log test, curl mẫu (BE).

---

## 9. Review code của người khác

Dev chuyên nghiệp không chỉ viết code mà còn **đọc code** của đồng đội.

1. Mở tab **Files changed** của PR.
2. Đọc mô tả và issue trước để biết PR **định làm gì**.
3. Soát theo thứ tự:
   - **Đúng yêu cầu** chưa: có khớp AC không, có làm thừa không?
   - **Sai logic**: trường hợp rỗng, lỗi, sai quyền, người dùng không đúng vai trò?
   - **Bảo mật**: có lộ mật khẩu hay token không? API có kiểm tra quyền ở server không?
   - **Dễ đọc**: tên biến rõ nghĩa, không lặp code.
4. Comment vào **đúng dòng** (bấm dấu `+` cạnh số dòng). Góp ý lịch sự và cụ thể: "Chỗ này nếu `horse` null thì lỗi, nên kiểm tra trước", thay vì "code sai".
5. Kết thúc review bằng một trong ba lựa chọn:
   - **Comment**: góp ý chung.
   - **Approve**: đồng ý merge.
   - **Request changes**: phải sửa rồi mới được merge.

Kiểm tra thử code của PR trên máy mình:
```bash
gh pr checkout 60        # tải nhánh của PR #60 về và chuyển sang nhánh đó
```

---

## 10. CI: bot kiểm tra tự động

**CI (Continuous Integration)** nghĩa là mỗi lần push hoặc mở PR, GitHub Actions sẽ tự dựng một máy ảo, cài dự án và chạy kiểm tra. File cấu hình nằm ở `.github/workflows/ci.yml`.

| Bước | BE | FE |
|---|---|---|
| 0 | Ranh giới repo: không có file giao diện | – |
| 1 | `npm run lint` (**0 cảnh báo**), `npm run typecheck` | `npm run lint`, `npm run typecheck` |
| 2 | `npm run test:unit` | `npm run test:unit` (nếu có) |
| 3 | `npm run test:e2e` | `npm run build` + Playwright |
| 4 | SonarQube | SonarQube |

**CI đỏ thì làm gì:**
1. Vào PR, mở tab **Checks**, bấm vào bước bị đỏ và đọc log.
2. Chạy **đúng lệnh đó** trên máy bạn, sửa đến khi xanh.
3. Commit, push. CI tự chạy lại.

Lỗi hay gặp nhất khi code trên Windows: lint báo `Delete ␍` (do ký tự xuống dòng CRLF). Sửa bằng `npx eslint "{src,test}/**/*.ts" --fix`.

---

## 11. Đồng bộ code: fetch, pull, merge

### Xem trước khi kéo
```bash
git fetch
git log --oneline main..origin/main      # main trên GitHub có gì mà máy bạn chưa có
git log --oneline origin/main..main      # máy bạn có gì mà chưa push
git diff main origin/main --stat         # các file sẽ thay đổi
```

### Đang làm dở mà main có code mới
```bash
git status                  # 1. commit hoặc stash hết phần đang sửa
git pull origin main        # 2. gộp main mới vào nhánh của bạn
# 3. nếu có conflict thì xem mục 12
npm ci                      # 4. nếu package-lock.json đổi
git push                    # 5. đẩy nhánh đã cập nhật lên
```

### Merge hay rebase?
- **Merge** (`git pull origin main`): gộp main vào nhánh của bạn bằng một commit gộp. **An toàn, nhóm đang dùng cách này.**
- **Rebase** (`git pull --rebase`): viết lại lịch sử cho gọn, nhưng cần hiểu rõ, và sau đó phải `push --force`. **Đừng dùng khi chưa quen**, và **không bao giờ** rebase nhánh có người khác cùng làm.

### Cất tạm phần đang sửa: `git stash`
```bash
git stash            # cất phần đang sửa dở, thư mục làm việc về trạng thái sạch
git pull             # hoặc chuyển nhánh, làm việc khác...
git stash pop        # lấy lại phần đã cất
git stash list       # xem danh sách những gì đang cất
```

---

## 12. Xung đột (conflict) và cách gỡ

**Conflict** xảy ra khi bạn và người khác **sửa cùng một chỗ** trong cùng một file. Git không biết giữ bản nào nên hỏi bạn.

Git đánh dấu trong file như sau:
```ts
<<<<<<< HEAD
const OTP_TTL = 10 * 60 * 1000;      // bản của bạn
=======
const OTP_TTL = 5 * 60 * 1000;       // bản từ main
>>>>>>> origin/main
```

**Cách gỡ:**
1. `git status`: xem những file nào bị conflict (dòng *both modified*).
2. Mở từng file. VS Code hiện sẵn các nút **Accept Current / Accept Incoming / Accept Both / Compare**.
3. Chọn đúng phiên bản (hoặc tự viết lại cho hợp lý), rồi **xoá hết** các dấu `<<<<<<<`, `=======`, `>>>>>>>`.
4. Chạy lại lint, typecheck và test.
5. Hoàn tất:
   ```bash
   git add <file đã gỡ>
   git commit                # Git tự điền sẵn message "Merge branch 'main' ..."
   git push
   ```
6. Rối quá, muốn quay về như trước lúc pull: `git merge --abort`.

**Không chắc nên giữ bản nào thì hỏi người đã sửa đoạn đó.** Chạy `git log -p -- <file>` để xem ai sửa và vì sao.

**Cách phòng conflict:** pull main thường xuyên, làm PR nhỏ, merge sớm, và báo nhóm khi bạn định sửa file dùng chung (schema, file cấu hình).

---

## 13. Database khi làm nhóm

- **Có trên GitHub:** `prisma/schema.prisma` (cấu trúc bảng) và `prisma/seed.ts` (dữ liệu mẫu).
- **Không có trên GitHub:** chương trình PostgreSQL, file `.env` chứa địa chỉ và mật khẩu DB, và **dữ liệu** bạn tạo khi dùng thử.
- Mỗi người có **Postgres riêng trên máy mình**. Bạn tạo tài khoản thì người khác không thấy. Muốn có dữ liệu giống nhau thì dùng `npm run db:seed`.
- **Có người đổi schema** (sau khi bạn `git pull`): chạy `npx prisma generate` rồi `npx prisma db push`. Nếu thay đổi xoá hoặc đổi kiểu cột đang có dữ liệu, Prisma sẽ cảnh báo và hỏi trước.
- **Nhóm chưa dùng migrations:** không chạy `prisma migrate dev`, và không commit thư mục `prisma/migrations` khi Lead chưa chốt.
- **Muốn cả nhóm dùng chung dữ liệu** thì cần một database trên cloud (ví dụ Supabase). Việc này phải bàn với cả nhóm, vì khi đó một người seed hoặc push schema là ảnh hưởng tất cả.

---

## 14. Bí mật (.env, mật khẩu) và .gitignore

- `.gitignore` liệt kê những file Git **bỏ qua**: `.env`, `.env.local`, `node_modules/`, `dist/`...
- **`.env.example`** là file mẫu, **có** trên git, chứa tên biến và giá trị giả. Người mới copy file này thành `.env` rồi điền giá trị thật.
- **Không bao giờ:**
  - commit `.env`, App Password, token, mật khẩu DB;
  - dùng `git add -f` để ép đưa file bị ignore vào commit;
  - dán mật khẩu vào issue, PR, commit message, hay ảnh chụp màn hình.
- **Gửi bí mật cho đồng đội** qua tin nhắn riêng. Tốt hơn nữa là mỗi người tự tạo App Password hoặc tài khoản DB của mình.
- **Lỡ commit bí mật:** xem [mục 15](#15-lỡ-tay-cách-sửa-từng-loại-sai-lầm). Điều quan trọng nhất là **đổi mật khẩu ngay**. Chỉ xoá file thì không đủ, vì lịch sử Git vẫn còn giữ nó.

---

## 15. Lỡ tay: cách sửa từng loại sai lầm

> Nguyên tắc: **commit chưa push** thì sửa thoải mái. **Commit đã push** thì chỉ thêm commit mới để sửa (`revert`), **không viết lại lịch sử** mà người khác đã kéo về.

| Tình huống | Cách sửa |
|---|---|
| Sửa file hỏng, muốn bỏ hết thay đổi của file đó (chưa commit) | `git restore <file>` ⚠️ mất luôn phần đã sửa |
| Lỡ `git add` nhầm file | `git restore --staged <file>` (file vẫn giữ nguyên nội dung) |
| Commit message viết sai (**chưa push**) | `git commit --amend -m "message mới"` |
| Quên thêm một file vào commit vừa rồi (**chưa push**) | `git add <file>` rồi `git commit --amend --no-edit` |
| Muốn huỷ commit cuối nhưng giữ code (**chưa push**) | `git reset --soft HEAD~1` |
| Commit **đã push** bị sai, muốn huỷ | `git revert <hash>`: tạo commit mới đảo ngược lại, rồi push |
| Đang sửa trên `main`, **chưa commit** | `git stash` → `git checkout -b feat/...` → `git stash pop` |
| Đã commit trên `main` ở máy, **chưa push** | `git branch feat/<tên>` (giữ commit sang nhánh mới) → `git reset --hard origin/main` (đưa main về như GitHub) → `git checkout feat/<tên>` |
| Push bị từ chối (*rejected*) | Trên GitHub có commit mới hơn: `git pull origin <nhánh>`, gỡ conflict nếu có, rồi `git push` |
| Lỡ commit `.env` / mật khẩu | **1) Đổi mật khẩu hoặc token ngay.** 2) Báo Lead. 3) `git rm --cached .env` rồi commit. Không `push --force` lên nhánh chung khi chưa hỏi Lead |
| `npm ci` báo lock không khớp | `git checkout package-lock.json` rồi `npm ci`. **Không sửa tay** file lock |
| Không biết mình đang ở đâu | `git status` và `git log --oneline --graph -15` |
| Lỡ xoá nhánh hoặc reset mất commit | `git reflog`: Git ghi lại mọi chỗ HEAD từng đứng, tìm hash rồi chạy `git checkout -b cuu-ho <hash>` |

⚠️ Các lệnh **nguy hiểm** (làm mất dữ liệu hoặc viết lại lịch sử): `git reset --hard`, `git push --force`, `git clean -fd`, `git checkout -- .`. Chạy `git status` trước, và nếu không chắc thì hỏi.

---

## 16. Issue, Project board, thông báo

- **Issue** là một đầu việc: lỗi, chức năng, câu hỏi. Mỗi task của nhóm là một issue ở **repo BE**, bên trong có đặc tả và tiêu chí nghiệm thu.
- **Project board** ([Project 2](https://github.com/users/MichaelTran1226/projects/2)): bảng Kanban gồm các cột *Todo → In Progress → In Review → Done*, kèm các trường Priority, Owner, Iteration... Kéo thẻ để cập nhật trạng thái.
- **Tag người khác:** gõ `@MichaelTran1226` trong comment để người đó nhận thông báo.
- **Liên kết:** gõ `#33` để trỏ tới issue hoặc PR số 33. Gõ `Closes #33` trong PR thì issue tự đóng khi merge.
- **Thông báo:** nên bật email ở GitHub → Settings → Notifications, và bấm **Watch** ở 2 repo nhóm để không bỏ sót review hay comment.

---

## 17. Dùng Git trong VS Code

- **File → Open Folder → `D:\My_Project\EquiFlow`**: tab **Source Control** (Ctrl+Shift+G) hiện **2 repo riêng**, mỗi repo có danh sách file thay đổi riêng.
- **Góc dưới bên trái:** tên nhánh hiện tại (bấm vào để chuyển hoặc tạo nhánh) và nút **Sync** (pull + push).
- **Commit:** bấm `+` cạnh file (tương đương `git add`), gõ message, rồi bấm ✓ Commit.
- **Xem khác biệt:** bấm vào một file trong Source Control để thấy bản cũ và bản mới cạnh nhau.
- **Conflict:** file có conflict hiện các nút *Accept Current / Incoming / Both* ngay trong editor.
- Có thể cài thêm extension **GitHub Pull Requests** để xem và review PR ngay trong VS Code, và **GitLens** để xem ai sửa từng dòng.

Giao diện tiện, nhưng **nên thuộc lệnh**. Khi có sự cố, đọc được output của lệnh sẽ giúp bạn hiểu chuyện gì đang xảy ra.

---

## 18. Bảng lệnh tra nhanh

### Xem tình trạng
| Lệnh | Làm gì |
|---|---|
| `git status` | Đang ở nhánh nào, file nào đã sửa hoặc đã add |
| `git log --oneline --graph -15` | 15 commit gần nhất, dạng cây |
| `git diff` | Thay đổi chưa add |
| `git diff --staged` | Thay đổi đã add, sắp commit |
| `git branch` / `git branch -a` | Nhánh trên máy / cả nhánh trên GitHub |
| `git log -p -- <file>` | Lịch sử sửa của một file |
| `git blame <file>` | Ai sửa từng dòng, lúc nào |

### Làm việc
| Lệnh | Làm gì |
|---|---|
| `git checkout main` | Chuyển sang main |
| `git checkout -b <nhánh>` | Tạo nhánh mới và chuyển sang |
| `git add <file>` | Chọn file để commit |
| `git commit -m "..."` | Commit |
| `git push -u origin <nhánh>` | Push nhánh lần đầu |
| `git push` | Push các lần sau |
| `git stash` / `git stash pop` | Cất tạm / lấy lại |

### Đồng bộ
| Lệnh | Làm gì |
|---|---|
| `git fetch --prune` | Tải thông tin mới, dọn nhánh đã bị xoá |
| `git pull` | Kéo và gộp nhánh hiện tại |
| `git pull origin main` | Gộp main mới vào nhánh đang đứng |
| `git log --oneline main..origin/main` | Có gì mới trên GitHub |
| `git branch --merged origin/main` | Nhánh nào đã vào main |
| `git branch -d <nhánh>` | Xoá nhánh đã merge |

### GitHub CLI (`gh`)
| Lệnh | Làm gì |
|---|---|
| `gh pr status` | PR của bạn và PR chờ bạn review |
| `gh pr create` | Mở PR (hỏi từng bước) |
| `gh pr view <số> --web` | Mở PR trên trình duyệt |
| `gh pr checks <số>` | Kết quả CI |
| `gh pr checkout <số>` | Lấy code của PR về máy để thử |
| `gh issue list --assignee @me` | Issue giao cho bạn |
| `gh issue view <số>` | Đọc một issue |

---

## 19. Luật vàng

1. **Luôn `git pull` trước khi bắt đầu làm.**
2. **Không push thẳng `main`.** Mỗi task một nhánh, một PR.
3. **Commit nhỏ, message rõ ràng**, theo Conventional Commits.
4. **Chạy lint, typecheck và test trước khi push.**
5. **Không commit bí mật.** Lỡ commit thì đổi mật khẩu ngay.
6. **Đọc đặc tả trước, chốt API trước, code sau.**
7. **Không `--force`**, không sửa tay `package-lock.json`, không cài package khi Lead chưa duyệt.
8. **Push cuối ngày.** Code chỉ nằm trên máy là code có thể mất.
9. **Mô tả PR để người khác hiểu mà không cần hỏi lại**: sửa gì, vì sao, cần làm gì sau khi merge.
10. **Chưa chắc thì hỏi**, hỏi trong issue hoặc PR để cả nhóm cùng thấy.

---

## 20. Hỏi đáp

**Mỗi lần có thay đổi có phải clone lại không?**
Không. Clone **một lần**, sau đó dùng `git pull`. Clone lại sẽ ra một folder mới, và bạn mất `.env`, `node_modules`, cùng phần code chưa push.

**Mỗi thay đổi có phải một folder riêng?**
Không. Mỗi thay đổi là một **nhánh** (hoặc một commit) ngay trong folder đó. Git đổi file tại chỗ khi bạn chuyển nhánh.

**Để FE và BE chung một repo được không?**
Không. Nhóm dùng 2 repo, và CI của BE chặn file giao diện. Bạn chỉ **gom 2 folder** vào `EquiFlow\` cho gọn trên máy, còn mỗi folder vẫn push lên repo riêng của nó.

**Task có cả FE lẫn BE thì làm sao?**
Mỗi repo một nhánh (đặt cùng tên) và một PR. Cả hai PR đều ghi `Refs #<issue>`. PR xong sau cùng thì ghi `Closes`.

**Port khác nhau có sao không?**
Không sao, miễn `VITE_API_URL` bên FE trỏ đúng `PORT` của BE (nhóm dùng 3000), và FE chạy ở 5173 (BE chỉ cho phép 5173 gọi vào).

**FE cũ (Horse-Training-Club) dùng với BE nhóm được không?**
Không. FE cũ đăng nhập bằng session cookie, còn BE nhóm dùng JWT (`Authorization: Bearer`). Muốn dùng BE nhóm thì phải dùng FE nhóm (`MT_FE`).

**Bạn cùng nhóm clone về mà không nhận được mail OTP?**
Họ phải tự điền `SMTP_USER` / `SMTP_PASS` (App Password Gmail) vào `.env` của BE, vì file `.env` không đi theo git. Bên FE, họ phải đặt `VITE_USE_MOCK=false`. Nếu để `true`, FE chạy bằng dữ liệu giả và mã OTP luôn là `123456`.

**Đang code dở thì có người nhờ sửa gấp một lỗi khác?**
`git stash` (hoặc commit tạm lên nhánh hiện tại) → `git checkout main` → `git pull` → `git checkout -b fix/...` → sửa, push, mở PR → quay về nhánh cũ → `git stash pop`.

**Làm sao biết ai đã sửa dòng code này và vì sao?**
Chạy `git blame <file>` để tìm commit, rồi `git show <hash>` để đọc commit đó. Trên GitHub, commit thường dẫn tới PR có mô tả đầy đủ.

---

## 21. Từ điển thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| **Repository (repo)** | Thư mục dự án kèm toàn bộ lịch sử Git |
| **Clone** | Tải một repo từ GitHub về máy (một lần) |
| **Commit** | Một bản chụp code có tên, tác giả, thời gian |
| **Hash** | Mã định danh của commit, ví dụ `dc21e48` |
| **Branch** | Nhánh, dòng thời gian làm việc riêng |
| **main** | Nhánh chính thức của dự án |
| **HEAD** | Vị trí (commit) bạn đang đứng |
| **Remote / origin** | Bản repo trên GitHub / tên mặc định của nó |
| **Staging area** | Khu chờ: những thay đổi đã `add`, sắp commit |
| **Fetch** | Tải thông tin mới về, chưa đổi file |
| **Pull** | Fetch rồi merge |
| **Push** | Đẩy commit lên GitHub |
| **Merge** | Gộp nhánh này vào nhánh kia |
| **Rebase** | Đặt lại commit của nhánh lên đầu nhánh khác (viết lại lịch sử) |
| **Conflict** | Hai bên sửa cùng một chỗ, Git cần bạn chọn |
| **Stash** | Cất tạm phần đang sửa |
| **Revert** | Tạo commit mới để đảo ngược một commit cũ |
| **Pull Request (PR)** | Đề nghị gộp nhánh vào main, kèm review và CI |
| **Draft PR** | PR nháp, chưa nhờ review |
| **Review / Approve** | Đọc và góp ý code / đồng ý merge |
| **CODEOWNERS** | File quy định ai là chủ phần code nào; GitHub tự gán người đó làm reviewer |
| **CI / GitHub Actions** | Bot tự chạy lint, test mỗi khi push hoặc mở PR |
| **Issue** | Một đầu việc: lỗi, chức năng, câu hỏi |
| **Project board** | Bảng Kanban theo dõi trạng thái các issue |
| **.gitignore** | Danh sách file Git bỏ qua |
| **.env / .env.example** | Cấu hình bí mật riêng mỗi máy / file mẫu có trên git |
| **Fork** | Bản sao repo sang tài khoản của bạn. Nhóm **không dùng**, vì mọi người có quyền Write nên tạo nhánh thẳng trong repo nhóm |
