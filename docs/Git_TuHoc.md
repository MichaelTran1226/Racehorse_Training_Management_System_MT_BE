# Tự học Git từ con số 0

> File này để **tự học**, viết cho người mới bắt đầu, xoay quanh đúng những câu hỏi mình đã từng thắc mắc.
> Tài liệu tra cứu quy trình nhóm (đầy đủ hơn, dành khi đã hiểu cơ bản): `HuongDan_GitHub.md` cùng thư mục.
>
> **Lộ trình gợi ý**
> 1. **Phần 0**: chuẩn bị (10 phút, làm một lần)
> 2. **Phần A**: đọc hiểu khái niệm (30 phút)
> 3. **Phần B**: thực hành 10 bài trên sân tập (1–2 tiếng). **Đây là phần quan trọng nhất**
> 4. **Phần C**: áp dụng vào dự án thật EquiFlow
> 5. **Phần D, E, F**: tra cứu, hỏi đáp, tự kiểm tra

---

## Mục lục
- [Phần 0: Chuẩn bị](#phần-0-chuẩn-bị)
- [Phần A: Hiểu Git bằng ví dụ đời thường](#phần-a-hiểu-git-bằng-ví-dụ-đời-thường)
- [Phần B: Thực hành trên sân tập](#phần-b-thực-hành-trên-sân-tập)
- [Phần C: Áp dụng vào dự án EquiFlow](#phần-c-áp-dụng-vào-dự-án-equiflow)
- [Phần D: Tra cứu nhanh](#phần-d-tra-cứu-nhanh)
- [Phần E: Những câu mình đã hỏi](#phần-e-những-câu-mình-đã-hỏi)
- [Phần F: Tự kiểm tra](#phần-f-tự-kiểm-tra)

---

## Phần 0: Chuẩn bị

### 0.1 Mở terminal trong VS Code
- Menu **Terminal → New Terminal** (hoặc `` Ctrl+` ``). Terminal mặc định là **PowerShell**.
- Mọi lệnh `git ...` trong file này gõ vào đó.

### 0.2 Kiểm tra Git đã cài chưa
```powershell
git --version
```
Kết quả đúng: `git version 2.55.0.windows.4` (hoặc số khác). Báo lỗi *"not recognized"* nghĩa là chưa cài Git.

### 0.3 Khai báo tên và email (máy mình đã làm rồi, chỉ cần kiểm tra)
```powershell
git config --global user.name        # → MinhMQ1711
git config --global user.email       # → maiquangminh1711@gmail.com
```
Email phải trùng với tài khoản GitHub, để commit hiện đúng avatar.

### 0.4 Chọn VS Code làm trình soạn thảo cho Git (**nên làm ngay**)
Khi Git cần mình gõ một lời nhắn (ví dụ lúc gộp nhánh), nó sẽ mở một trình soạn thảo. Máy mình **chưa chọn** trình soạn thảo, nên Git sẽ mở **vim**: một màn hình đen rất khó thoát với người mới. Đổi sang VS Code:
```powershell
git config --global core.editor "code --wait"
```
> **Lỡ bị kẹt trong vim:** bấm `Esc`, gõ `:wq`, rồi `Enter` để lưu và thoát. Muốn thoát mà không lưu thì gõ `:q!`.

### 0.5 Hai cấu hình máy mình đã có sẵn (chỉ cần biết)
- `pull.rebase=false`: `git pull` gộp code bằng *merge*, đúng cách nhóm đang làm.
- `core.autocrlf=true`: Git tự đổi kiểu xuống dòng Windows (CRLF) sang Linux (LF) và ngược lại. Vì vậy thỉnh thoảng sẽ thấy cảnh báo `LF will be replaced by CRLF`. Cảnh báo này **vô hại, cứ bỏ qua**.

---

## Phần A: Hiểu Git bằng ví dụ đời thường

### A1. Git và GitHub

| | Ví dụ đời thường | Thực tế |
|---|---|---|
| **Git** | Tính năng "lịch sử phiên bản" của Google Docs, kết hợp với "save game" | Phần mềm **trên máy mình**, ghi lại mọi lần lưu code: ai sửa, sửa gì, lúc nào. Chạy được **không cần mạng** |
| **GitHub** | Một cái kho chung trên mạng mà cả nhóm cùng gửi và lấy đồ | **Trang web** lưu bản sao repo để cả nhóm dùng chung, kèm Pull Request, review, bot kiểm tra (CI) |

`git push` = gửi từ máy lên GitHub. `git pull` = lấy từ GitHub về máy.

### A2. Repository (repo): mỗi repo là một thư mục
- **Một repo = một thư mục dự án** + lịch sử Git nằm trong thư mục ẩn `.git` bên trong.
- Nhóm có **2 repo** (FE và BE), nên trên máy có **2 thư mục**: `D:\My_Project\EquiFlow\MT_FE` và `MT_BE`.
- **`git clone` chỉ làm MỘT LẦN**, lúc mới lấy dự án về. Sau đó mỗi ngày chỉ dùng `git pull` để lấy phần mới.

> ❓ *"Có thay đổi thì clone lại à?"* → **Không.** Clone lại sẽ tạo thêm một thư mục mới, và bạn mất file `.env`, `node_modules`, cùng code chưa push ở thư mục cũ.

### A3. Commit: một "điểm lưu game"
Mỗi **commit** là một bản chụp toàn bộ code tại một thời điểm, có mã riêng (ví dụ `d9ac4d2`), tên người làm, thời gian và lời nhắn mô tả.

Đi từ lúc sửa file tới lúc lên GitHub gồm **4 bước**:
```
 ① Sửa file          ② git add              ③ git commit            ④ git push
 (thư mục làm việc) ──► (khu chờ / staging) ──► (lịch sử trên máy) ──► (GitHub)
  "đang viết nháp"      "chọn cái sẽ lưu"       "bấm Save game"         "gửi lên kho chung"
```
- Chỉ sửa file thì **chưa lưu** gì vào lịch sử.
- Commit rồi nhưng **chưa push** thì **chỉ máy mình có**. Máy hỏng là mất.
- Commit **không phải một thư mục mới**. Git chỉ lưu phần khác nhau nên rất nhẹ.

### A4. Branch (nhánh) và `main`
> ❓ *"Branch khác gì main?"*

- **`main`** giống **bản chính thức** của một cuốn sách đã in: đã được kiểm tra, cả nhóm dựa vào đó.
- **Branch** giống **một bản nháp riêng** tách ra từ bản chính. Mình viết, sửa, làm hỏng thoải mái mà không ảnh hưởng tới ai.

```
main:          A ── B ── C ─────────── F     ← F: gộp bản nháp vào bản chính (merge)
                          \           /
feat/them-ngua:            D ─── E ──        ← D, E: commit mình làm trên nhánh
```
- **Chuyển nhánh** (`git checkout <tên>`) thì Git **thay nội dung file ngay trong thư mục đó**. Không có thư mục mới nào được tạo.
- Vì sao nhóm **cấm sửa thẳng `main`**: 5 người cùng sửa `main`, chỉ một người đẩy code lỗi là cả nhóm pull về hỏng theo.

### A5. Remote, `origin`, fetch, pull, push
- **Remote** là bản repo trên GitHub. Tên mặc định của nó là **`origin`**.
- **`origin/main`** là "`main` trên GitHub **theo lần cuối mình hỏi**".

| Lệnh | Ví dụ đời thường | Đổi file trên máy? |
|---|---|---|
| `git fetch` | Mở hộp thư xem có thư mới không | ❌ Chỉ tải thông tin về |
| `git pull` | Xem thư, rồi chép nội dung vào vở của mình | ✅ |
| `git push` | Gửi bài của mình lên kho chung | ❌ (đổi GitHub) |

### A6. Pull Request (PR) và merge
> ❓ *"Sao biết được là đã được merge?"*

- **PR** là "đơn xin gộp nhánh của tôi vào `main`". Trên PR, bot chạy test, người khác đọc code và góp ý.
- **Merge** là lúc đơn được duyệt: các commit của nhánh chính thức vào `main`.
- **Cách biết đã merge:** nhãn trên trang PR chuyển thành 🟣 **Merged**. GitHub cũng gửi thông báo (chuông) hoặc email. Hoặc chạy lệnh `gh pr view <số PR>`.

| Nhãn PR | Nghĩa |
|---|---|
| 🟢 Open | Đang chờ duyệt |
| ⚪ Draft | Bản nháp, chưa nhờ duyệt |
| 🟣 Merged | Đã gộp vào `main` |
| 🔴 Closed | Bị đóng, không gộp |

### A7. Cái gì đi theo Git, cái gì KHÔNG (chỗ dễ nhầm nhất)

| Thứ | Lên GitHub? | Vì sao / nằm ở đâu |
|---|---|---|
| Code (`src/`...) | ✅ | Đây là thứ cần chia sẻ |
| `.env.example` | ✅ | **File mẫu**, chỉ có giá trị giả |
| **`.env`, `.env.local`** | ❌ | Chứa **mật khẩu thật**. Bị liệt kê trong `.gitignore`. Mỗi máy tự tạo |
| `node_modules/` | ❌ | Thư viện tải về, rất nặng. Mỗi máy tự chạy `npm ci` |
| `prisma/schema.prisma` | ✅ | **Bản thiết kế** database (bảng, cột) |
| `prisma/seed.ts` | ✅ | Code tạo **dữ liệu mẫu** |
| **Dữ liệu trong database** | ❌ | Nằm trong PostgreSQL trên từng máy (máy mình: `D:\DB\data`) |
| Chương trình PostgreSQL | ❌ | Mỗi máy tự cài (máy mình: `D:\DB`, port 3333) |

**Hệ quả:**
- Mình thêm tài khoản hay ngựa vào database thì **người khác không thấy**. Muốn cả nhóm có chung dữ liệu mẫu thì thêm vào `seed.ts`.
- Mình sửa **cấu trúc** DB trong `schema.prisma` rồi push thì người khác **pull về vẫn chưa đổi DB**. Họ phải tự chạy `npx prisma generate` + `npx prisma db push` (xem [bài B9](#b9-phát-hiện-database-thay-đổi-sau-khi-pull)).
- **Không sửa cấu trúc trực tiếp trong pgAdmin.** Chỉ sửa `schema.prisma`, vì đó là bản gốc duy nhất.
- Bạn cùng nhóm clone về mà **không nhận được mail OTP** là vì `.env` (có App Password Gmail) không đi theo Git. Mỗi người phải tự điền.

**Port và chế độ mock (cũng không liên quan Git):**
- Port là "số cửa" của chương trình **trên máy mình**. Chỉ cần FE trỏ đúng port BE: `VITE_API_URL=http://localhost:3000/api` khớp với `PORT=3000`.
- FE có **dữ liệu giả (mock)**: `VITE_USE_MOCK=true` thì FE không cần BE (dữ liệu nằm trong trình duyệt, OTP luôn `123456`). Đặt `false` thì FE gọi BE thật, và BE dùng PostgreSQL.

---

## Phần B: Thực hành trên sân tập

### Sân tập là gì
Sân tập nằm ở `D:\My_Project\Tai_Lieu\GitPractice`. Nó **giả lập một nhóm 2 người** ngay trên máy mình, **không dính gì tới repo thật** của nhóm:

```
GitPractice\
├── tao-san-tap.ps1   ← chạy lại để làm lại từ đầu bất cứ lúc nào
├── github-gia.git\   ← đóng vai GITHUB (đừng mở, đừng sửa)
├── may-cua-toi\      ← đóng vai MÁY CỦA MÌNH
└── may-dong-doi\     ← đóng vai MÁY ĐỒNG ĐỘI (commit với tên "Dong Doi (tap)")
```
Sẵn có 3 commit, và 4 file: `README.md`, `ngua.txt` (danh sách ngựa), `prisma/schema.prisma` (bản thiết kế DB giả), `.env.example`.

**Mở sân tập trong VS Code:**
- Cửa sổ 1: **File → Open Folder → `may-cua-toi`**
- Cửa sổ 2: **File → New Window**, rồi **Open Folder → `may-dong-doi`**
- Mỗi cửa sổ mở một terminal (`` Ctrl+` ``). Tiêu đề cửa sổ cho biết mình đang đóng vai ai.

**Làm hỏng thì làm lại từ đầu:** đóng 2 cửa sổ VS Code của sân tập, rồi chạy:
```powershell
cd D:\My_Project\Tai_Lieu\GitPractice
powershell -ExecutionPolicy Bypass -File .\tao-san-tap.ps1
```

**Cách đọc mỗi bài:** 🎯 Mục tiêu → ⌨️ Lệnh → 🖱️ Trong VS Code → ✅ Kết quả đúng → 💡 Hiểu được gì.
Mã commit (ví dụ `d9ac4d2`) trên máy bạn sẽ khác trong file. Đó là chuyện bình thường.

---

### B1. Nhìn quanh
🎯 Biết mình đang ở nhánh nào, có gì thay đổi, và lịch sử có những gì.

⌨️ *(máy của tôi)*
```powershell
git status
git log --oneline
```
✅
```
On branch main
Your branch is up to date with 'origin/main'.
nothing to commit, working tree clean

d9ac4d2 feat(db): bang Horse
8c1854a feat: danh sach ngua
49bf63f docs: them README va .gitignore
```
🖱️ Góc dưới bên trái VS Code hiện tên nhánh **`main`**. Tab **Source Control** (`Ctrl+Shift+G`) đang trống, tức là chưa sửa gì.

💡 `working tree clean` = không có gì đang sửa dở. **`git status` là lệnh dùng nhiều nhất.** Không biết mình đang ở đâu thì gõ nó.

---

### B2. Commit đầu tiên
🎯 Đi đủ các bước: sửa file → xem → chọn → lưu.

1. Mở `README.md`, thêm một dòng cuối: `Nguoi tap: <tên bạn>`. Lưu file (`Ctrl+S`).
2. ⌨️
   ```powershell
   git status        # README.md màu đỏ: "modified" (đã sửa, chưa add)
   git diff          # dòng thêm có dấu + màu xanh
   git add README.md
   git status        # README.md màu xanh: "Changes to be committed" (đã vào khu chờ)
   git commit -m "docs: ghi ten nguoi tap"
   git log --oneline # commit mới nằm trên cùng
   ```
🖱️ Trong Source Control, `README.md` hiện ở mục **Changes**. Bấm vào file để xem bản cũ và bản mới cạnh nhau. Bấm dấu **`+`** (= `git add`), gõ lời nhắn vào ô **Message**, rồi bấm **✓ Commit**.

💡 Commit xong nhưng **chưa push**, nên "GitHub giả" và máy đồng đội **chưa có** commit này. `git status` sẽ báo `Your branch is ahead of 'origin/main' by 1 commit`, tức là mình đang **đi trước** GitHub 1 commit.

---

### B3. Push, và đồng đội nhận được
🎯 Thấy tận mắt: phải push thì người khác mới pull được.

⌨️ *(máy của tôi)*
```powershell
git push
git status        # → Your branch is up to date with 'origin/main'.
```
⌨️ *(máy đồng đội)*
```powershell
git pull
```
✅ *(máy đồng đội)*
```
Updating d9ac4d2..1a2b3c4
Fast-forward
 README.md | 1 +
 1 file changed, 1 insertion(+)
```
Mở `README.md` bên máy đồng đội sẽ thấy dòng bạn vừa thêm.

🖱️ Push: bấm nút **Sync Changes** trong Source Control, hoặc menu **`...` → Push**. Pull: **`...` → Pull**.

💡 **Fast-forward** nghĩa là máy đồng đội không có gì mới, nên Git chỉ việc "tua" lên bản mới. Dòng `README.md | 1 +` cho biết file nào đổi và đổi bao nhiêu dòng.

> ⚠️ Ở sân tập mình push thẳng vào `main` cho dễ hiểu. **Trong repo nhóm thì không bao giờ push thẳng `main`** (xem B5 và Phần C).

---

### B4. "Mở máy lên, kiểm tra xem có ai push gì chưa"
🎯 Đây là thói quen mỗi sáng.

1. ⌨️ *(máy đồng đội)*: đồng đội thêm một con ngựa rồi push
   ```powershell
   Add-Content ngua.txt "Golden Hoof"
   git commit -am "feat: them ngua Golden Hoof"
   git push
   ```
   *(`-am` = add mọi file **đã được theo dõi** rồi commit luôn. Không áp dụng cho file mới tạo.)*
2. ⌨️ *(máy của tôi)*: thử `git status` **trước** khi hỏi GitHub:
   ```powershell
   git status        # vẫn báo "up to date"!
   ```
   💡 `git status` chỉ biết những gì mình **đã hỏi GitHub lần gần nhất**. Nó không tự lên mạng kiểm tra.
3. ⌨️ Hỏi GitHub:
   ```powershell
   git fetch
   git log --oneline main..origin/main   # các commit trên GitHub mà mình chưa có
   git status
   ```
   ✅
   ```
   e5f6a7b feat: them ngua Golden Hoof
   ...
   Your branch is behind 'origin/main' by 1 commit, and can be fast-forwarded.
   ```
4. ⌨️ Lấy về: `git pull`

🖱️ Trong VS Code: **`...` → Fetch**. Góc dưới bên trái sẽ hiện **↓1** (có 1 commit mới chờ kéo về). Bấm vào đó để pull.

💡 Công thức buổi sáng: **`git fetch` → `git log --oneline main..origin/main` → `git pull`**. Lệnh thứ hai không in gì nghĩa là chưa ai push gì mới.

---

### B5. Làm việc trên nhánh riêng
🎯 Tạo bản nháp, sửa, rồi gộp về `main`. Thấy tận mắt là chuyển nhánh thì file tự đổi.

⌨️ *(máy của tôi)*
```powershell
git checkout -b feat/them-ngua          # tạo nhánh mới và chuyển sang
Add-Content ngua.txt "Silver Moon"
git commit -am "feat: them ngua Silver Moon"

git checkout main                        # quay về main
Get-Content ngua.txt                     # KHÔNG có Silver Moon!
git checkout feat/them-ngua
Get-Content ngua.txt                     # Silver Moon lại xuất hiện
```
Gộp nhánh vào `main` (ở sân tập mình tự gộp; trong nhóm thì bước này làm bằng **PR trên GitHub**):
```powershell
git checkout main
git merge feat/them-ngua
git push
git branch --merged                      # nhánh nào đã nằm trong main
git branch -d feat/them-ngua             # xoá nhánh đã gộp xong
```
✅ `git branch --merged` liệt kê `feat/them-ngua`, rồi `Deleted branch feat/them-ngua`.

🖱️ Bấm tên nhánh ở góc dưới bên trái → **Create new branch...** để tạo nhánh, hoặc chọn một nhánh có sẵn để chuyển sang. Để merge: **`...` → Branch → Merge...**

💡 Cùng một thư mục mà nội dung đổi theo nhánh, **không có thư mục mới**. Và `main` không hề bị ảnh hưởng cho tới lúc merge.

---

### B6. Xung đột (conflict): hai người sửa cùng một dòng
🎯 Tự gây ra conflict rồi gỡ nó, để lần sau gặp thật không hoảng.

1. ⌨️ *(máy đồng đội)*: `git pull` trước, rồi sửa **dòng 2** của `ngua.txt` thành `Northern Dancer II`, lưu lại:
   ```powershell
   git commit -am "fix: doi ten ngua so 2"
   git push
   ```
2. ⌨️ *(máy của tôi)*: **không pull**, sửa cũng **dòng 2** thành `Northern Dancer Legacy (7 tuoi)`, lưu lại:
   ```powershell
   git commit -am "feat: ghi tuoi ngua so 2"
   git push          # BỊ TỪ CHỐI
   ```
   ✅
   ```
    ! [rejected]        main -> main (fetch first)
   error: failed to push some refs to '...github-gia.git'
   ```
   💡 GitHub đang có commit mới mà máy mình chưa có, nên phải pull trước rồi mới push được.
3. ⌨️
   ```powershell
   git pull
   ```
   ✅
   ```
   Auto-merging ngua.txt
   CONFLICT (content): Merge conflict in ngua.txt
   Automatic merge failed; fix conflicts and then commit the result.
   ```
4. Mở `ngua.txt`:
   ```
   Thunderbolt Swift
   <<<<<<< HEAD
   Northern Dancer Legacy (7 tuoi)        ← bản của MÌNH
   =======
   Northern Dancer II                     ← bản của ĐỒNG ĐỘI
   >>>>>>> 6138e7dc6e15baff...
   Silver Arrow
   ```
   🖱️ VS Code hiện các nút phía trên đoạn này: **Accept Current Change** (giữ bản mình), **Accept Incoming Change** (giữ bản đồng đội), **Accept Both Changes** (giữ cả hai), **Compare Changes**.
   Ở đây hãy **tự viết lại** cho hợp lý: `Northern Dancer II (7 tuoi)`. Sau đó **xoá hết** các dòng `<<<<<<<`, `=======`, `>>>>>>>` và lưu file.
5. ⌨️
   ```powershell
   git add ngua.txt
   git commit --no-edit     # --no-edit: dùng sẵn lời nhắn "Merge branch 'main'...", không mở trình soạn thảo
   git push
   git log --oneline --graph -5
   ```
   ✅ Sơ đồ cho thấy 2 nhánh rẽ ra rồi gộp lại:
   ```
   *   2b66242 Merge branch 'main' of ...github-gia
   |\
   | * ae3004f fix: doi ten ngua so 2
   * | 5548424 feat: ghi tuoi ngua so 2
   |/
   * ...
   ```
🖱️ Bước 5 trong VS Code: bấm **`+`** ở file đã gỡ, ô Message có sẵn lời nhắn, bấm **✓ Commit** rồi **Sync**.

💡 Rối quá, muốn quay lại như trước lúc pull: `git merge --abort`.
💡 **Phòng conflict:** pull thường xuyên, PR nhỏ, báo nhóm trước khi sửa file dùng chung.

---

### B7. Cất tạm việc đang làm: `git stash`
🎯 Đang sửa dở thì cần pull hoặc chuyển nhánh gấp.

⌨️ *(máy của tôi)*
```powershell
Add-Content README.md "Dang sua do..."
git status          # README.md: modified
git stash           # cất đi
git status          # sạch: "nothing to commit"
git stash list      # stash@{0}: WIP on main: ...
# ... pull, chuyển nhánh, làm việc khác ...
git stash pop       # lấy lại phần đã cất
git status          # README.md: modified (đã quay lại)
git restore README.md   # (dọn bài tập) bỏ phần sửa dở này
```
🖱️ **`...` → Stash → Stash**, và **`...` → Stash → Pop Latest Stash**.

---

### B8. File bí mật `.env` và `.gitignore`
🎯 Thấy tận mắt vì sao `.env` không bao giờ lên GitHub.

⌨️ *(máy của tôi)*
```powershell
Copy-Item .env.example .env
# mở .env, thay MAT_KHAU bằng một mật khẩu "thật" bất kỳ
git status               # KHÔNG thấy .env!
git check-ignore -v .env
```
✅
```
nothing to commit, working tree clean
.gitignore:1:.env	.env
```
💡 Dòng 1 của `.gitignore` là `.env`, nên Git bỏ qua file này. Vì vậy bạn cùng nhóm clone về **không có** `.env` của mình và phải tự tạo.
⚠️ **Không bao giờ** dùng `git add -f .env` (`-f` là ép thêm file bị bỏ qua).

---

### B9. Phát hiện database thay đổi sau khi pull
🎯 Trả lời câu *"khi pull về sao họ biết là có thay đổi ở database?"*

1. *(máy đồng đội)*: `git pull`, rồi mở `prisma/schema.prisma`, thêm một dòng dưới `name String`:
   ```prisma
     age  Int?
   ```
   ⌨️
   ```powershell
   git commit -am "feat(db): them cot age cho Horse"
   git push
   ```
2. ⌨️ *(máy của tôi)*
   ```powershell
   git pull
   ```
   ✅ **Nhìn vào danh sách file**, thấy ngay `prisma/schema.prisma`:
   ```
   Fast-forward
    prisma/schema.prisma | 1 +
    1 file changed, 1 insertion(+)
   ```
3. Lỡ trôi mất output thì xem lại:
   ```powershell
   git diff --stat ORIG_HEAD HEAD                     # mọi file đổi trong lần pull vừa rồi
   git log --oneline ORIG_HEAD..HEAD -- prisma/       # commit nào sửa thư mục prisma
   git diff ORIG_HEAD HEAD -- prisma/schema.prisma    # sửa cụ thể những gì
   ```
   ✅ Dòng cuối có `+  age  Int?`.

💡 `ORIG_HEAD` là "vị trí ngay trước lần pull vừa rồi", do Git tự ghi lại.
💡 **Trong dự án thật**, thấy `schema.prisma` đổi thì chạy `npx prisma generate` + `npx prisma db push` (Phần C4).

---

### B10. Lỡ tay: sửa từng loại sai lầm
🎯 Biết cách "undo" an toàn. Làm từng mục trên *máy của tôi*.

**a) Sửa hỏng file, muốn bỏ hết (chưa commit)**
```powershell
Add-Content ngua.txt "SAI SAI SAI"
git restore ngua.txt        # file về như lần commit gần nhất (MẤT phần vừa sửa)
```
**b) Lỡ `add` nhầm file**
```powershell
Add-Content README.md "tam"
git add README.md
git restore --staged README.md   # bỏ ra khỏi khu chờ, nội dung file vẫn giữ nguyên
git restore README.md            # (dọn bài tập)
```
**c) Viết sai lời nhắn commit (CHƯA push)**
```powershell
Add-Content ngua.txt "Ngua X"
git commit -am "sai chinh ta"
git commit --amend -m "feat: them ngua X"
git log --oneline -1             # → feat: them ngua X
```
**d) Huỷ commit cuối nhưng giữ code (CHƯA push)**
```powershell
git reset --soft HEAD~1          # commit biến mất, thay đổi quay lại khu chờ
git status                       # ngua.txt: Changes to be committed
git restore --staged ngua.txt ; git restore ngua.txt   # (dọn bài tập)
```
**e) Commit ĐÃ push bị sai: dùng `revert`**
```powershell
Add-Content ngua.txt "Ngua Loi"
git commit -am "feat: them ngua loi"
git push
git revert --no-edit HEAD        # tạo commit MỚI đảo ngược commit kia
git push
git log --oneline -2             # Revert "feat: them ngua loi" / feat: them ngua loi
```
💡 Đã push rồi thì **không** dùng `reset`/`amend`, vì người khác đã có bản cũ. Dùng `revert` để sửa bằng một commit mới.
⚠️ `revert` một **merge commit** (commit dạng "Merge branch...") thì báo lỗi `is a merge but no -m option was given`. Gặp trường hợp này thì hỏi Lead, đừng tự xử.

**f) Cứu hộ: "mất" commit thì dùng `reflog`**
```powershell
Add-Content ngua.txt "Quan trong"
git commit -am "feat: viec quan trong"
git reset --hard HEAD~1          # ⚠️ "lỡ tay" xoá mất commit
git log --oneline -1             # không còn "viec quan trong"
git reflog -3                    # Git nhớ mọi chỗ mình từng đứng
git reset --hard 'HEAD@{1}'      # quay lại đúng chỗ trước khi lỡ tay (NHỚ dấu nháy đơn)
git log --oneline -1             # → feat: viec quan trong (đã cứu được)
```
⚠️ **Trong PowerShell phải bọc `'HEAD@{1}'`, `'stash@{0}'` bằng dấu nháy đơn.** Nếu không, PowerShell hiểu sai dấu `{}` và Git báo lỗi `unknown switch 'e'`. Trên mạng hướng dẫn thường viết không có dấu nháy vì họ dùng terminal Bash, còn PowerShell thì phải thêm.
💡 Gần như **không gì mất hẳn** nếu đã từng commit. Chỉ những thay đổi **chưa commit** mới có thể mất thật (khi dùng `restore` hoặc `reset --hard`).

---

### ✅ Hoàn thành sân tập, tự đánh dấu
- [ ] B1 đọc được `git status`, `git log`
- [ ] B2 commit bằng cả lệnh lẫn VS Code
- [ ] B3 push xong, bên kia pull thấy thay đổi
- [ ] B4 kiểm tra có ai push gì chưa
- [ ] B5 tạo nhánh, thấy file đổi theo nhánh, merge, xoá nhánh
- [ ] B6 tự gây và tự gỡ conflict
- [ ] B7 stash và pop
- [ ] B8 hiểu vì sao `.env` không lên Git
- [ ] B9 phát hiện `schema.prisma` đổi sau khi pull
- [ ] B10 restore, amend, reset --soft, revert, reflog

Muốn tập lại từ đầu thì chạy lại `tao-san-tap.ps1`.

---

## Phần C: Áp dụng vào dự án EquiFlow

### C1. Trên máy mình
```
D:\My_Project\EquiFlow\     ← thư mục gom lại cho gọn (KHÔNG phải repo)
├── MT_BE\   → push lên github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE
└── MT_FE\   → push lên github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_FE
```
Trong VS Code, mở thư mục `EquiFlow`. Tab Source Control sẽ hiện **2 repo riêng**. Sửa file ở repo nào thì commit và push ở repo đó.

### C2. Mỗi sáng (làm ở **cả hai** thư mục)
```powershell
cd D:\My_Project\EquiFlow\MT_BE
git status                               # đang ở nhánh nào? có sửa dở không?
git fetch --prune
git log --oneline main..origin/main      # có ai merge gì mới vào main?
git checkout main
git pull
```
Sau đó xem **Phần C4** để biết có cần cài lại gì không. Lên GitHub xem **Project 2** (task của mình) và **chuông thông báo** (PR được merge, có ai góp ý).

### C3. Làm một task (điểm khác lớn nhất so với sân tập: **dùng PR**)
```powershell
git checkout main
git pull
git checkout -b feat/<số-issue>-<ten-ngan>       # ví dụ feat/40-so-do-chuong
# ... code, commit nhỏ nhiều lần ...
# BE: npm run lint && npm run typecheck && npm run test:unit && npm run test:e2e
# FE: npm run lint && npm run typecheck && npm run build
git push -u origin feat/<số-issue>-<ten-ngan>
```
Lên GitHub bấm **Compare & pull request**, điền mẫu PR, ghi `Refs #<số issue>`. Chờ CI xanh và Michael duyệt. Thấy 🟣 **Merged** thì dọn dẹp:
```powershell
git checkout main
git pull
git branch -d feat/<số-issue>-<ten-ngan>
```
Muốn biết chi tiết từng bước (mẫu PR, review, CI, luật nhóm), xem `HuongDan_GitHub.md`.

### C4. Sau khi pull: có cần làm gì thêm không?
```powershell
git diff --stat ORIG_HEAD HEAD
```

| Thấy file này trong danh sách | Thì chạy |
|---|---|
| `package.json` / `package-lock.json` | `npm ci` |
| `prisma/schema.prisma` (BE) | `npx prisma generate` rồi `npx prisma db push` |
| `prisma/seed.ts` (BE) | `npm run db:seed` nếu muốn có dữ liệu mẫu mới |
| `.env.example` | Mở ra xem có biến mới không, tự thêm vào `.env` / `.env.local` |

Đơn giản nhất: pull xong ở BE thì luôn chạy `npx prisma generate` + `npx prisma db push`. Nếu không có gì đổi, `db push` chỉ báo *already in sync*. Nếu thay đổi có thể mất dữ liệu, nó **dừng lại hỏi** trước.

Kiểm tra chắc chắn database đã khớp với code chưa:
```powershell
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script
```
Kết quả `-- This is an empty migration.` nghĩa là **khớp**.

### C5. Khi mình là người đổi `schema.prisma`
- Ghi rõ trong PR: **"Có đổi schema, sau khi pull cần chạy `npx prisma generate` + `npx prisma db push`"**.
- Đổi **tên** cột/bảng thì Prisma hiểu là xoá cũ + tạo mới, nên **mất dữ liệu** của cột đó. Hỏi Lead trước.
- Thêm cột bắt buộc vào bảng đã có dữ liệu: cho nó `@default(...)` hoặc cho phép để trống (`?`).
- Báo nhóm trước khi sửa, vì `schema.prisma` là file dùng chung và rất dễ conflict.

---

## Phần D: Tra cứu nhanh

### D1. Lệnh ↔ nút trong VS Code

| Việc | Lệnh | VS Code |
|---|---|---|
| Xem tình trạng | `git status` | Tab Source Control (`Ctrl+Shift+G`) |
| Xem khác biệt | `git diff` | Bấm vào file trong Source Control |
| Chọn file để commit | `git add <file>` | Dấu **`+`** cạnh file |
| Bỏ chọn | `git restore --staged <file>` | Dấu **`−`** cạnh file |
| Bỏ phần đang sửa | `git restore <file>` | Nút **↶ Discard Changes** |
| Commit | `git commit -m "..."` | Gõ Message → **✓ Commit** |
| Hỏi GitHub có gì mới | `git fetch` | **`...` → Fetch** (góc dưới hiện ↓ số commit mới) |
| Lấy về | `git pull` | **`...` → Pull**, hoặc bấm ↓ ở góc dưới |
| Đẩy lên | `git push` | **Sync Changes** / **`...` → Push** |
| Tạo nhánh | `git checkout -b <tên>` | Bấm tên nhánh góc dưới → **Create new branch** |
| Chuyển nhánh | `git checkout <tên>` | Bấm tên nhánh góc dưới → chọn nhánh |
| Gộp nhánh | `git merge <tên>` | **`...` → Branch → Merge...** |
| Cất tạm | `git stash` / `git stash pop` | **`...` → Stash** |
| Lịch sử | `git log --oneline --graph -15` | Mục **Graph** trong Source Control |

### D2. Đọc hiểu thông báo của Git

| Git nói | Nghĩa | Làm gì |
|---|---|---|
| `nothing to commit, working tree clean` | Không có gì đang sửa | Không cần làm gì |
| `Your branch is up to date with 'origin/main'` | Khớp với GitHub **theo lần hỏi gần nhất** | Muốn chắc thì `git fetch` rồi xem lại |
| `Your branch is ahead of 'origin/main' by N commits` | Có N commit chưa push | `git push` |
| `Your branch is behind 'origin/main' by N commits` | GitHub có N commit mình chưa có | `git pull` |
| `have diverged` | Cả hai bên đều có commit mới | `git pull` (có thể conflict) rồi `git push` |
| `Changes not staged for commit` | Đã sửa nhưng chưa `add` | `git add` hoặc `git restore` |
| `Changes to be committed` | Đã `add`, chờ commit | `git commit` |
| `Untracked files` | File mới, Git chưa theo dõi | `git add` nếu muốn đưa vào repo |
| `Fast-forward` | Pull êm, không cần gộp | Không cần làm gì |
| `Already up to date.` | Không có gì mới | Không cần làm gì |
| `CONFLICT (content): Merge conflict in X` | Hai bên sửa cùng một chỗ | Làm như bài B6 |
| `! [rejected] ... (fetch first)` | GitHub có commit mới hơn | `git pull` rồi `git push` |
| `LF will be replaced by CRLF` | Git đổi kiểu xuống dòng | **Bỏ qua**, vô hại |
| `fatal: not a git repository` | Đang đứng ở thư mục không phải repo | `cd` vào đúng thư mục repo |
| `Please commit your changes or stash them before you merge` | Có file sửa dở mà pull hoặc chuyển nhánh sẽ ghi đè | `git stash` hoặc commit trước |
| `error: pathspec 'X' did not match` | Gõ sai tên file hoặc nhánh | Kiểm tra lại tên (`git branch -a`) |
| `error: unknown switch 'e'` (khi gõ `HEAD@{1}`, `stash@{0}`) | PowerShell hiểu sai dấu `{}` | Bọc trong dấu nháy đơn: `'HEAD@{1}'` |

### D3. Lệnh nguy hiểm (có thể mất dữ liệu): chạy `git status` trước, không chắc thì hỏi
`git reset --hard` · `git restore <file>` · `git clean -fd` · `git push --force` · `git checkout -- .`

---

## Phần E: Những câu mình đã hỏi

**1. Chưa có BE mà vẫn đăng nhập được là sao?**
FE có dữ liệu giả (mock) trong `src/shared/mock/`. Khi `VITE_USE_MOCK=true`, FE không gọi server nào: dữ liệu nằm trong localStorage của trình duyệt và OTP luôn là `123456`. Đổi thành `false` thì FE gọi BE thật (PostgreSQL). Đổi xong phải chạy lại `npm run dev`.

**2. SQL có phải mỗi máy một cái, không dùng chung được như Supabase?**
Đúng. Postgres cài trên máy ai thì chỉ máy đó dùng. Nó là một **chương trình server** (máy mình: `D:\DB`, port 3333), không phải một file (SQLite mới là một file). Supabase cũng là Postgres nhưng nằm trên cloud, nên cả nhóm trỏ chung vào được. Mặt trái là một người seed hay đổi schema thì ảnh hưởng cả nhóm.

**3. Port trên GitHub khác port trên máy thì ảnh hưởng gì?**
Không ảnh hưởng, miễn là FE trỏ đúng port BE đang chạy. Nhóm dùng BE `PORT=3000` và FE `VITE_API_URL=http://localhost:3000/api`. Lệch nhau thì FE báo lỗi mạng hoặc gọi nhầm sang BE khác.

**4. FE cũ của mình dùng với BE nhóm được không?**
Không. FE cũ đăng nhập bằng session cookie, còn BE nhóm dùng JWT. Muốn dùng BE nhóm thì dùng FE nhóm (`MT_FE`).

**5. Để FE và BE chung một thư mục được không? Mỗi lần push là một folder à?**
Được gom **2 thư mục repo** vào một thư mục cha (`EquiFlow\`). Nhưng **không** được biến chúng thành một repo: nhóm dùng 2 repo, và CI của BE chặn file giao diện. Mỗi thay đổi là **một nhánh hoặc một commit** ngay trong thư mục đó, không phải một folder mới.

**6. Có thay đổi thì clone lại à?**
Không. Clone một lần, sau đó dùng `git pull` (bài B3, B4).

**7. Database không đi theo GitHub thì phải cấu hình lại à?**
Đúng. Mỗi máy tự cài Postgres và tự điền `DATABASE_URL` vào `.env`. Sau đó `npx prisma db push` tạo bảng theo `schema.prisma`, và `npm run db:seed` thêm dữ liệu mẫu.

**8. Trên GitHub có để cấu hình database không?**
Chỉ có **file mẫu** `.env.example` (giá trị giả), **bản thiết kế** `schema.prisma` (25 bảng) và **dữ liệu mẫu** `seed.ts`. Không có `.env` thật, không có dữ liệu, và chưa có thư mục migrations. Tự kiểm tra bằng `git ls-files | Select-String env` và `git log --all --oneline -- .env`: lệnh sau trống nghĩa là `.env` chưa từng bị commit.

**9. Từ schema tạo database mới trên máy như thế nào?**
Ba lệnh: `npx prisma generate` → `npx prisma db push` (tự tạo DB nếu chưa có, rồi tạo bảng) → `npm run db:seed`. Mọi người dùng chung `schema.prisma` nên database giống nhau về **cấu trúc**, chỉ khác **dữ liệu**.

**10. Mình đổi database rồi push, người khác có đổi theo không?**
- Đổi **cấu trúc** qua `schema.prisma`: họ pull về rồi **phải tự chạy** `prisma generate` + `db push`.
- Đổi **dữ liệu**: không bao giờ lên GitHub. Muốn chia sẻ thì đưa vào `seed.ts`.
- Sửa **trực tiếp trong pgAdmin**: đừng làm.

**11. Pull về sao biết có thay đổi database?**
Nhìn danh sách file sau khi pull, hoặc chạy `git diff --stat ORIG_HEAD HEAD`: có `prisma/schema.prisma` là có đổi. Chắc nhất là chạy `prisma migrate diff` (Phần C4). Thực hành ở bài B9.

**12. Làm sao biết PR đã được merge?**
Nhãn 🟣 **Merged** trên trang PR, thông báo hoặc email của GitHub, hoặc lệnh `gh pr view <số>` (Phần A6).

---

## Phần F: Tự kiểm tra

Trả lời trong đầu trước, rồi mới bấm để xem đáp án.

<details><summary>1. Mình commit rồi nhưng đồng đội pull không thấy. Tại sao?</summary>

Vì chưa `git push`. Commit chỉ nằm trên máy mình cho tới khi push.
</details>

<details><summary>2. <code>git status</code> báo "up to date" nhưng đồng đội nói vừa push. Có mâu thuẫn không?</summary>

Không. `status` chỉ so với lần hỏi GitHub gần nhất. Chạy `git fetch` rồi xem lại (bài B4).
</details>

<details><summary>3. Chuyển sang nhánh khác thì file thay đổi. Code của mình có bị mất không?</summary>

Không, nếu đã commit trên nhánh cũ. Chuyển lại nhánh đó là code hiện ra. Còn phần **chưa commit** thì Git sẽ mang theo sang nhánh mới, hoặc báo lỗi và đòi commit/stash trước.
</details>

<details><summary>4. Push bị <code>rejected (fetch first)</code>. Làm gì?</summary>

`git pull` (gỡ conflict nếu có), rồi `git push`. **Không** dùng `--force`.
</details>

<details><summary>5. Sau khi pull, thấy <code>prisma/schema.prisma</code> trong danh sách. Chạy gì?</summary>

`npx prisma generate` rồi `npx prisma db push`.
</details>

<details><summary>6. Commit sai đã push lên nhánh chung. Dùng <code>reset</code> hay <code>revert</code>?</summary>

`revert`. Nó tạo commit mới đảo ngược lại. `reset` và `amend` chỉ dùng cho commit **chưa push**.
</details>

<details><summary>7. Bạn cùng nhóm clone về, chạy BE nhưng không nhận được mail OTP. Vì sao?</summary>

`.env` (có App Password Gmail) không lên GitHub. Họ phải tự điền `SMTP_USER` / `SMTP_PASS`. Ngoài ra FE của họ phải đặt `VITE_USE_MOCK=false`, nếu không FE sẽ chạy bằng dữ liệu giả.
</details>

<details><summary>8. Muốn cả nhóm có con ngựa mẫu "Thunderbolt Swift" trong database. Làm sao?</summary>

Thêm vào `prisma/seed.ts`, rồi commit, push, mở PR. Người khác pull về và chạy `npm run db:seed`. Thêm trực tiếp vào DB máy mình thì người khác không thấy.
</details>

<details><summary>9. Đang code dở trên nhánh thì cần pull <code>main</code> mới. Các bước?</summary>

Commit (hoặc `git stash`) phần đang làm → `git pull origin main` (đứng trên nhánh của mình) → gỡ conflict nếu có → `git stash pop` nếu đã stash.
</details>

<details><summary>10. Lỡ <code>git reset --hard</code> làm mất commit. Cứu thế nào?</summary>

`git reflog` để tìm vị trí trước khi lỡ tay, rồi `git reset --hard 'HEAD@{n}'` (trong PowerShell nhớ dấu nháy đơn), hoặc `git branch cuu-ho <mã commit>`. Bài B10f.
</details>
