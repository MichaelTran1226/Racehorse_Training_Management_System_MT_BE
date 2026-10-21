# WorkFlow 2 · Quản lý Hồ sơ Ngựa

> Tài liệu dành cho **Frontend**. Mô tả: ai được làm gì · có những chức năng nào · mỗi chức năng chạy ra sao và gặp ngoại lệ nào.
> Không bàn về API và cơ sở dữ liệu — phần đó nằm ở `API_CONTRACT.md` khi backend chốt.
>
> Chủ sở hữu: **Cặp 1** · Cập nhật 29/09/2026 · Phả hệ đã bỏ khỏi phạm vi (xem §6).

---

# 1. Năm actor — ai thấy gì, làm được gì

## 1.1 Bảng quyền

Bốn mức, mỗi mức là một cách hiển thị khác nhau trên giao diện:

| Ký hiệu | Nghĩa | FE phải làm gì |
|---|---|---|
| **Làm được** | Đủ quyền | Nút bình thường |
| **Chỉ xem** | Vào được màn, không sửa | Không có nút sửa, hoặc nút khóa |
| **Khóa** | Thấy nút nhưng bấm không được | `disabled` + tooltip nói rõ ai mới làm được |
| **Ẩn** | Không bao giờ có quyền | Không render nút, không hiện mục trong sidebar |
| **Chặn** | Không vào được màn | Gõ tay URL → trang 403 |

| Chức năng | Head Trainer | Veterinarian | Groom | Horse Owner | Club Manager |
|---|---|---|---|---|---|
| Xem danh sách ngựa | Chỉ xem | Chỉ xem | **Chặn** | ngựa của mình | Làm được |
| Thêm hồ sơ ngựa | **Khóa** | **Khóa** | Chặn | Ẩn | Làm được |
| Sửa hồ sơ ngựa | **Khóa** | **Khóa** | Chặn | Ẩn | Làm được |
| Đổi trạng thái sức khỏe | Khóa | **Làm được** | Ẩn | Ẩn | **Khóa** |
| Xem chi tiết hồ sơ | Chỉ xem | Chỉ xem | Chỉ xem | ngựa của mình | Làm được |
| Gán / đổi chủ sở hữu | Khóa | Khóa | Ẩn | Ẩn | Làm được |
| Vô hiệu hóa / xóa hồ sơ | Khóa | Khóa | Ẩn | Ẩn | Làm được |
| Quản lý nhân sự | Chỉ xem | Chặn | Chặn | Chặn | Làm được |
| Quản lý vật tư | Chặn | Chỉ xem | Chỉ xem | Chặn | Làm được |
| Quản lý chuồng trại | Chỉ xem | Chỉ xem | Chỉ xem | Chặn | Làm được |

## 1.2 Từng actor vào hệ thống thấy gì

**Club Manager** — người duy nhất tạo, sửa, xóa hồ sơ ngựa và quản lý cả ba danh mục. Sidebar có đủ: Horses · Staff · Supplies · Stalls. Nhưng **không** đổi được trạng thái sức khỏe — đó là quyết định y tế.

**Head Trainer** — đọc được mọi hồ sơ để lập giáo án, nhưng không sửa được gì. Mở hồ sơ ngựa thì **nút Edit vẫn hiện ra và bị khóa**, tooltip ghi *"Only the Club Manager can edit horse records."* Đọc thêm được danh mục nhân sự để biết ai rảnh mà phân công.

**Veterinarian** — đọc hồ sơ ngựa và danh mục vật tư y tế. Là người **duy nhất** đổi được trạng thái sức khỏe của ngựa, nhưng thao tác đó làm ở màn của WorkFlow 4, không phải ở form sửa hồ sơ.

**Horse Owner** — chỉ đọc, và **chỉ những con mình sở hữu**. Có màn riêng dạng lưới thẻ thay vì bảng. Mọi nút sửa/xóa **không render** chứ không phải khóa — khóa một nút vĩnh viễn chỉ làm rối mắt.

**Groom** — không vào được danh sách ngựa, nhưng **mở được hồ sơ ngựa** khi bấm từ sơ đồ chuồng. Đây là chủ ý: Groom làm việc theo chuồng chứ không theo danh sách ngựa. Đọc thêm được danh mục vật tư và sơ đồ chuồng.

## 1.3 Ba quy tắc hiển thị quyền

**Khóa hay ẩn?** Nếu vai trò đó *về nguyên tắc* có thể được cấp quyền thì **khóa + tooltip**, để người dùng biết chức năng tồn tại và ai mới làm được. Nếu vai trò đó *không bao giờ* có quyền (Horse Owner với nút Xóa ngựa) thì **ẩn hẳn**.

**Chặn hay chuyển hướng?** Horse Owner gõ `/horses` → **chuyển hướng** sang màn ngựa của mình, vì họ có quyền xem ngựa, chỉ là xem ở chỗ khác. Horse Owner gõ `/horses/TM-05` mà không sở hữu TM-05 → **trang 403**. Hai xử lý khác nhau, đừng gộp.

**Sidebar chỉ liệt kê nơi vào được.** Groom không thấy mục "Horses" trong sidebar. Đây là ngoại lệ hợp lý của quy tắc "khóa thay vì ẩn" — không ai liệt kê một trang rồi khóa nó lại.

---

# 2. Có những chức năng gì

| # | Chức năng | Màn hình | Ai làm được |
|---|---|---|---|
| 1 | Xem & tìm danh sách ngựa | `HorseList` | HT · Vet · CM |
| 2 | Thêm hồ sơ ngựa | `HorseForm` | **chỉ CM** |
| 3 | Sửa hồ sơ ngựa | `HorseForm` | **chỉ CM** |
| 4 | Xem chi tiết hồ sơ (4 tab) | `HorseDetail` | mọi vai trò, theo phạm vi |
| 5 | Gán / đổi chủ sở hữu | modal `AssignOwner` | **chỉ CM** |
| 6 | Vô hiệu hóa / xóa hồ sơ | modal xác nhận | **chỉ CM** |
| 7 | Chủ ngựa xem ngựa của mình | `MyHorses` | **chỉ Owner** |
| 8 | Quản lý nhân sự | `StaffDirectory` | CM ghi · HT đọc |
| 9 | Quản lý vật tư y tế & thức ăn | `SuppliesCatalog` | CM ghi · Vet, Groom đọc |
| 10 | Quản lý sơ đồ chuồng trại | `StallMap` | CM ghi · Vet, Groom đọc |

**Thứ tự làm:** ba màn danh mục (8, 9, 10) trước — vì form thêm ngựa cần dropdown chuồng và chủ, không có chúng thì không test được. Rồi mới tới 1 → 2 → 3 → 4 → 5 → 6 → 7.

---

# 3. Luồng đi từng chức năng

---

## 3.1 Xem & tìm danh sách ngựa

**Ai:** Head Trainer, Veterinarian (chỉ xem) · Club Manager (làm được)
**Màn hình:** `HorseList`

### Luồng chính

1. Vào từ sidebar → mục **Horses**
2. Màn hiện bảng 8 cột: Code · Name · Breed · Age · Sex · Owner · Stall · Health
3. Tên ngựa và tên chủ đều là **link bấm được**
4. Tuổi hiển thị là số năm, **tính từ ngày sinh** — không lưu sẵn, nếu không sang năm sẽ sai
5. Thanh công cụ phía trên: ô tìm kiếm + 4 bộ lọc (Breed · Owner · Health · Stall) + nút **Add horse**
6. Gõ vào ô tìm kiếm → chờ 300 ms mới tìm, để không gọi liên tục từng ký tự
7. Tìm theo **mã và tên**, **bỏ dấu tiếng Việt** — gõ `hac phong` phải ra `Hắc Phong`
8. Đổi bộ lọc → danh sách nhảy **về trang 1**
9. Bộ lọc và từ khóa ghi vào địa chỉ URL — F5 không mất, gửi link cho người khác vẫn ra đúng kết quả đó
10. Mỗi trang 20 dòng, bấm số trang thì tải trang mới
11. Mặc định **ẩn ngựa đã vô hiệu hóa**, có ô tick "Show deactivated" để hiện lại

### Ngoại lệ

| Tình huống | Màn hình phản ứng |
|---|---|
| CLB chưa có con ngựa nào | *"No horses yet."* + nút **Add the first horse** (Club Manager), hoặc *"Ask the Club Manager to add horses."* (vai trò khác) |
| Lọc ra 0 kết quả | **Câu khác hẳn**: *"No horses match your filters."* + nút **Clear filters** |
| Đang tải | Khung xám 8 dòng, giữ nguyên chiều cao bảng và thanh lọc. Không xoay vòng giữa màn |
| Tải thất bại | Thông báo đỏ thay chỗ bảng + nút **Retry**. Thanh lọc vẫn giữ nguyên |
| Head Trainer / Vet bấm Add horse | Nút **khóa** + tooltip: *"Only the Club Manager can add horses."* |
| Horse Owner gõ `/horses` | **Chuyển hướng** sang `/my-horses` |
| Groom gõ `/horses` | Trang **403** |

> Hai ô đầu bảng trên phải là **hai câu khác nhau**. Gộp làm một là lỗi kinh điển: người dùng lọc hụt rồi tưởng câu lạc bộ không có con ngựa nào.

---

## 3.2 Thêm hồ sơ ngựa

**Ai:** chỉ Club Manager
**Màn hình:** `HorseForm`

### Luồng chính

1. Bấm **Add horse** ở danh sách → mở form trống
2. Form chia 3 nhóm:

| Nhóm | Trường |
|---|---|
| Identity | Registration code · Name · Microchip number |
| Physical | Breed · Date of birth · Sex · Coat colour |
| Assignment | Owner · Stall · Notes |

3. Dropdown **Owner** chỉ liệt kê tài khoản Horse Owner đang hoạt động
4. Dropdown **Stall** chỉ liệt kê chuồng **đang trống**
5. Dưới ô Registration code có dòng gợi ý luôn hiện: *"Format: TM-01. This cannot be changed later."*
6. Bấm **Save horse** → kiểm tra toàn bộ trường ngay tại máy
7. Có lỗi → dừng lại, **cuộn lên trường lỗi đầu tiên**, chưa gửi đi đâu cả
8. Hợp lệ → nút chuyển "Saving…", cả form khóa lại để không bấm hai lần
9. Lưu xong → chuyển sang trang chi tiết con ngựa vừa tạo, hiện thông báo nhỏ góc dưới *"Horse created."*

### Bảng kiểm tra dữ liệu

| Trường | Bắt buộc | Điều kiện | Câu báo lỗi |
|---|---|---|---|
| Registration code | có | dạng `TM-##`, chưa ai dùng | "Enter a registration code." / "This registration code is already in use." |
| Name | có | 2–60 ký tự, cho phép dấu tiếng Việt | "Enter the horse's name." |
| Microchip number | không | 15 chữ số nếu có nhập | "Microchip number must be 15 digits." |
| Breed | có | chọn trong danh sách | "Select a breed." |
| Date of birth | có | không ở tương lai, không quá 40 năm | "Date of birth cannot be in the future." |
| Sex | có | Stallion / Mare / Gelding | "Select the horse's sex." |
| Coat colour | có | 2–30 ký tự | "Enter the coat colour." |
| Owner | không | — | — |
| Stall | không | chuồng đang trống | "This stall is already occupied." |
| Notes | không | ≤ 1000 ký tự | "Notes must be 1000 characters or fewer." |

### Ngoại lệ

| Tình huống | Màn hình phản ứng |
|---|---|
| Mã đăng ký trùng | Lỗi đỏ **dưới ô Registration code**, không phải thông báo trên đầu form |
| Số microchip trùng | Lỗi đỏ dưới ô Microchip |
| Chuồng vừa bị người khác chiếm | Lỗi dưới dropdown Stall + tự tải lại danh sách chuồng trống |
| Chưa có tài khoản Horse Owner nào | Dropdown hiện *"No horse owners yet."* + link sang màn tài khoản. **Vẫn lưu được** với Owner để trống |
| Không còn chuồng trống | Dropdown hiện *"All stalls are occupied."* + link sang sơ đồ chuồng. **Vẫn lưu được** với Stall để trống |
| Bấm Cancel khi đã nhập dở | Hộp xác nhận: *"Discard this horse?"* |
| Mất mạng khi đang lưu | Thông báo đỏ trên đầu form + nút Retry. **Giữ nguyên mọi thứ đã nhập**, không xóa form |
| Vai trò khác gõ tay URL | Trang **403** |

> Owner và Stall để trống được là cố ý. Đừng chặn Club Manager nhập hồ sơ chỉ vì chưa có chủ hoặc chưa có chuồng — gán sau được.

---

## 3.3 Sửa hồ sơ ngựa

**Ai:** chỉ Club Manager
**Màn hình:** `HorseForm` (cùng màn với thêm mới, đã điền sẵn dữ liệu)

### Luồng chính

1. Từ trang chi tiết bấm **Edit**, hoặc từ menu ⋯ trên dòng ở danh sách
2. Form giống hệt màn thêm mới, nhưng **ba ô bị khóa**:

| Ô bị khóa | Tooltip |
|---|---|
| Registration code | *"Registration codes cannot be changed."* |
| Health status | *"Only the Veterinarian can change health status."* |
| Owner | *"Use Assign owner to change the owner."* — bấm tooltip dẫn sang chức năng 3.5 |

3. Dropdown Stall liệt kê chuồng trống **cộng chuồng hiện tại của con này**
4. Sửa xong bấm **Save changes** → thông báo *"Horse updated."* → quay về trang chi tiết

### Ngoại lệ

| Tình huống | Màn hình phản ứng |
|---|---|
| Người khác vừa sửa con này | Thông báo vàng: *"This horse was updated by someone else. Reload to see the latest version."* + nút **Reload**. **Không tự ghi đè** |
| Rời màn khi chưa lưu | Hộp xác nhận: *"Discard unsaved changes?"* |
| Ngựa đã bị vô hiệu hóa | Form chuyển sang chỉ đọc, banner vàng: *"This horse is deactivated. Reactivate it to make changes."* |
| Đổi sang chuồng đã có ngựa | Lỗi dưới dropdown kèm tên con đang ở đó |

> Ba ô bị khóa ở trên **luôn hiện ra**, kể cả với Club Manager. Chúng là bằng chứng trực quan rằng hệ thống phân quyền chặt.

---

## 3.4 Xem chi tiết hồ sơ ngựa

**Ai:** mọi vai trò, theo phạm vi của mình
**Màn hình:** `HorseDetail` — một trang, bốn tab

### Bố cục

```
┌────────────────────────────────────────────────┐
│ [ảnh]  Hắc Phong  TM-01         [Edit]  [⋯]    │ ← luôn hiện ở CẢ 4 TAB
│        Thoroughbred · 6 tuổi · Nguyễn Hoàng Anh │
│        [Fit]  [A-02]                            │
├────────────────────────────────────────────────┤
│ [Banner đỏ nếu ngựa đang bị khóa huấn luyện]    │ ← cũng hiện ở CẢ 4 TAB
├────────────────────────────────────────────────┤
│  Overview │ Race Record │ Health │ Training     │
└────────────────────────────────────────────────┘
```

| Tab | Hiển thị gì | Của flow nào |
|---|---|---|
| Overview | Thông tin định danh, thể chất, ghi chú + 4 ô đếm nhanh: buổi tập 30 ngày qua · hồ sơ y tế · giải đã đua · lịch hẹn y tế gần nhất | WorkFlow 2 |
| Race Record | Bảng thành tích: ngày · giải · cự ly · vị trí · tiền thưởng, mới nhất trước | WorkFlow 7 |
| Health | Dòng thời gian khám bệnh, chẩn đoán gần nhất, lịch hẹn sắp tới, lịch sử khóa huấn luyện | WorkFlow 4, **chỉ đọc** |
| Training | Giáo án đang chạy, lịch sử giáo án, biểu đồ chỉ số 30 ngày | WorkFlow 3, **chỉ đọc** |

### Luồng chính

1. Bấm tên ngựa ở bất kỳ màn nào trong hệ thống → mở trang này, tab Overview
2. Header hồ sơ và banner khóa **không cuộn mất** khi đổi tab
3. Mỗi tab có địa chỉ riêng (`/horses/TM-01/health`) — F5 và nút Back của trình duyệt phải đúng
4. Mỗi tab chỉ tải dữ liệu khi được mở lần đầu, sau đó nhớ lại trong phiên
5. Menu ⋯ gồm: Assign owner · Deactivate — mục nào không đủ quyền thì **khóa + tooltip**

### Ngoại lệ

| Tình huống | Màn hình phản ứng |
|---|---|
| Mã ngựa không tồn tại | Trang 404: *"Horse not found."* + nút **Back to horses** |
| **Horse Owner mở ngựa không phải của mình** | Trang **403** — không phải 404. Trả 404 là gián tiếp tiết lộ mã đó không tồn tại |
| Một tab tải lỗi | **Chỉ tab đó** hiện thông báo lỗi + Retry. Header và các tab khác vẫn dùng được bình thường |
| Ngựa chưa từng đua | Tab Race Record: *"This horse has no race records yet."* |
| Ngựa đang bị khóa huấn luyện | Banner đỏ dưới header, hiện ở cả 4 tab, ghi rõ ai khóa · lúc nào · lý do · thời hạn |
| Ngựa đã vô hiệu hóa | Banner vàng trên header, mọi nút trừ **Reactivate** đều khóa |

> Quy tắc số 3 quan trọng: một tab lỗi **không được làm sập cả trang**. Khoanh lỗi trong tab đó.

---

## 3.5 Gán & đổi chủ sở hữu

**Ai:** chỉ Club Manager
**Màn hình:** modal trên trang chi tiết

### Luồng chính

1. Menu ⋯ → **Assign owner** (chưa có chủ) hoặc **Change owner** (đã có chủ)
2. Modal mở ra và **lập tức đếm dữ liệu liên quan** để điền vào khối cảnh báo
3. Modal hiện: chủ hiện tại · dropdown chọn chủ mới · khối cảnh báo hậu quả
4. Khối cảnh báo nêu **con số cụ thể**, không nói chung chung:

> *"Nguyễn Hoàng Anh will lose access to this horse, including 3 training plans, 2 medical records and 12 months of cost reports. Lý Thu Hà will gain access to all of them."*

5. Chọn chủ mới → bấm **Assign** → thông báo *"Owner updated."*, header hồ sơ đổi tên chủ ngay

### Ngoại lệ

| Tình huống | Màn hình phản ứng |
|---|---|
| Chưa có tài khoản Horse Owner nào | Dropdown rỗng + link sang màn quản lý tài khoản |
| Chọn lại đúng chủ hiện tại | Nút Assign khóa |
| Tài khoản chủ mới vừa bị khóa | Lỗi dưới dropdown + tự tải lại danh sách |
| Muốn gỡ chủ, để trống | Nút riêng **Remove owner** + hộp xác nhận: *"This horse will have no owner. Owner reports will be unavailable until a new owner is assigned."* |

**Quy tắc:** một người sở hữu nhiều ngựa được; một con ngựa chỉ có **tối đa một** chủ; ngựa **không có chủ** là hợp lệ. Đổi chủ không xóa dữ liệu lịch sử — chủ cũ chỉ mất quyền xem từ thời điểm đổi.

---

## 3.6 Vô hiệu hóa & xóa hồ sơ

**Ai:** chỉ Club Manager
**Màn hình:** modal trên trang chi tiết

### Luồng chính

1. Menu ⋯ → **Deactivate**
2. Modal mở ra và **đếm dữ liệu liên quan** trước khi hiện nội dung
3. Modal liệt kê **đúng số lượng từng loại**:

> *"This horse has 12 training sessions, 3 medical records, 5 race records and 1 active training plan."*
> *"Deactivating keeps all history and hides the horse from active lists. This can be undone."*

4. Có ô **Reason** (không bắt buộc)
5. Nút chính **Deactivate**; bên dưới, chữ nhỏ hơn: *"Permanently delete instead"*
6. Xác nhận → ngựa ẩn khỏi danh sách, **chuồng được giải phóng**, giáo án đang chạy chuyển sang tạm đình chỉ
7. Trang chi tiết chuyển sang chế độ chỉ đọc kèm banner vàng

### Ngoại lệ

| Tình huống | Màn hình phản ứng |
|---|---|
| **Ngựa có dữ liệu liên quan, bấm xóa vĩnh viễn** | Nút Delete **khóa** + tooltip: *"This horse cannot be deleted because it has 12 training sessions and 3 medical records. Deactivate it instead."* |
| Ngựa sạch dữ liệu, bấm xóa vĩnh viễn | Cho phép, nhưng hộp xác nhận bắt **gõ đúng mã ngựa** (`TM-09`) mới mở được nút |
| Vô hiệu hóa ngựa đang có giáo án chạy | Thêm một dòng cảnh báo: *"1 active training plan will be suspended."* |
| Kích hoạt lại | Nút **Reactivate**; nếu chuồng cũ đã bị chiếm thì hỏi chọn chuồng mới |

> **Mặc định là vô hiệu hóa, không phải xóa.** Xóa vĩnh viễn là ngoại lệ hiếm và phải gõ mã để xác nhận.

---

## 3.7 Chủ ngựa xem ngựa của mình

**Ai:** chỉ Horse Owner
**Màn hình:** `MyHorses`

### Luồng chính

1. Đăng nhập với vai trò Horse Owner → vào thẳng màn này
2. Hiển thị dạng **lưới thẻ**, không phải bảng — chủ sở hữu thường chỉ có 2–3 con, bảng là thừa
3. Mỗi thẻ: ảnh · tên · mã · giống · tuổi · trạng thái sức khỏe · dòng tóm tắt *"Last trained 3 days ago"*
4. Bấm thẻ → mở trang chi tiết ở **chế độ chỉ đọc hoàn toàn**: không có nút Edit, không có menu ⋯

### Ngoại lệ

| Tình huống | Màn hình phản ứng |
|---|---|
| Chưa sở hữu con nào | *"You do not own any horses yet. Contact the Club Manager."* |
| Có ngựa đang bị khóa huấn luyện | Thẻ hiện badge cảnh báo; mở ra thấy banner với **lý do của bác sĩ** — đó là thông tin về tài sản của họ |
| Có ngựa đang chấn thương | Thẻ hiện badge đỏ nổi bật |
| Gõ `/horses` | **Chuyển hướng** sang màn này |
| Gõ `/horses/TM-05` mà không sở hữu TM-05 | Trang **403** |
| Gõ `/horses/new` | Trang **403** |

> Ở màn này, nút Edit / Delete / Assign owner **không render**. Khóa một nút mà người dùng không bao giờ có quyền chỉ làm rối giao diện.

---

## 3.8 Quản lý nhân sự

**Ai:** Club Manager (làm được) · Head Trainer (chỉ xem)
**Màn hình:** `StaffDirectory`

### Điều cần hiểu trước

**Nhân sự khác tài khoản.** Đây là chỗ hay nhầm nhất của WorkFlow này:

| | Tài khoản | Nhân sự |
|---|---|---|
| Là gì | Đăng nhập được vào hệ thống | Hồ sơ người làm việc ở CLB |
| Ai tạo | Tự đăng ký hoặc được mời | Club Manager nhập tay |
| Dùng để | Xác thực, phân quyền | Phân công lịch tập, giao việc chăm sóc |
| Bắt buộc có tài khoản? | — | **Không** |

Một nhân sự **có thể** liên kết tới một tài khoản, nhưng không bắt buộc. Thợ đóng móng đến theo lịch thì không cần tài khoản đăng nhập.

### Luồng chính

1. Vào từ sidebar → **Staff**
2. Bảng: Full name · Position · Phone · Email · Linked account · Employment status
3. Bấm **Add staff** → form: Full name · Position · Phone · Email · Linked account · Employment status
4. Position chọn trong: Trainer · Assistant Trainer · Veterinarian · Groom · Farrier · Other
5. Employment status: Active · On leave · Left
6. Dropdown Linked account chỉ liệt kê tài khoản **chưa bị liên kết với nhân sự nào khác**

### Ngoại lệ

| Tình huống | Màn hình phản ứng |
|---|---|
| Nhân viên nghỉ việc | Đặt trạng thái **Left**, **không xóa bản ghi** — lịch tập cũ vẫn phải tra được ai phụ trách |
| Xóa nhân viên đang được phân công buổi tập | Chặn: *"This staff member is assigned to 7 upcoming training sessions. Set their status to Left instead."* |
| Liên kết một tài khoản đã liên kết chỗ khác | Chặn: *"This account is already linked to another staff record."* |
| Head Trainer bấm Add staff | Nút **khóa** + tooltip: *"Only the Club Manager can manage staff."* |

> Chỉ nhân sự trạng thái **Active** mới xuất hiện trong dropdown phân công ở WorkFlow 3 và 6.

---

## 3.9 Quản lý vật tư y tế & thức ăn

**Ai:** Club Manager (làm được) · Veterinarian, Groom (chỉ xem)
**Màn hình:** `SuppliesCatalog`

### Luồng chính

1. Vào từ sidebar → **Supplies**
2. Hai tab: **Medical** (bác sĩ kê đơn dùng) và **Feed** (khẩu phần ăn dùng)
3. Bảng: Name · Category · Unit · Stock on hand · Low-stock threshold · Status
4. Cột Status là badge **tự tính**, không nhập tay:

| Badge | Khi nào |
|---|---|
| Out of stock (đỏ) | tồn kho = 0 |
| Low stock (vàng) | tồn kho ≤ ngưỡng cảnh báo |
| In stock (xanh) | còn lại |

5. Có bộ lọc **Low stock only** — Club Manager dùng để biết cần đặt hàng gì
6. Sửa tồn kho: bấm **Adjust stock** → modal nhập số lượng cộng/trừ + **ô lý do bắt buộc**

### Ngoại lệ

| Tình huống | Màn hình phản ứng |
|---|---|
| Sửa thẳng ô Stock trong bảng | **Không cho.** Phải qua modal Adjust stock để có ghi chép lý do |
| Trừ quá số đang có | Chặn: tồn kho không được âm |
| Xóa vật tư đã dùng trong đơn thuốc | Chặn: *"This supply is used in 4 treatment records. Deactivate it instead."* |
| Ngưỡng cảnh báo lớn hơn tồn kho | Cho phép — hợp lệ, badge Low stock hiện ngay |
| Vet / Groom bấm Add supply | Nút **khóa** + tooltip |

---

## 3.10 Quản lý sơ đồ chuồng trại

**Ai:** Club Manager (làm được) · Veterinarian, Groom (chỉ xem)
**Màn hình:** `StallMap`

### Luồng chính

1. Vào từ sidebar → **Stalls**
2. Hiển thị **lưới ô chuồng** nhóm theo dãy: Barn A (8 ô) · Barn B (6 ô)
3. Mỗi ô hiện: mã chuồng · tên ngựa đang ở · màu nền theo **trạng thái sức khỏe của con ngựa đó**

| Trạng thái | Màu ô |
|---|---|
| Trống | xám nhạt |
| Fit | xanh |
| Under Observation | vàng |
| Injured | đỏ |
| Quarantined | tím + **viền đứt nét** |

4. **Chú giải màu luôn hiện ngay dưới lưới** — không giấu trong tooltip, người dùng không phải nhớ 5 màu
5. Bấm một ô → panel bên phải hiện chi tiết: thông tin chuồng, tên ngựa (bấm được), nút **Move horse** và **Edit stall**
6. Chuyển ngựa: modal chọn chuồng đích trong danh sách **chuồng trống**; lưu xong chuồng cũ thành trống ngay

### Ngoại lệ

| Tình huống | Màn hình phản ứng |
|---|---|
| Chuyển ngựa vào chuồng đã có ngựa | Chặn kèm tên con đang ở: *"Stall A-05 is occupied by Kim Long."* |
| Xóa chuồng đang có ngựa | Chặn: *"Move Hắc Phong to another stall before deleting A-02."* |
| Chuồng đang bảo trì | Ô gạch chéo, không gán ngựa vào được |
| Chuyển ngựa đang cách ly vào cạnh ngựa khỏe | **Cảnh báo, không chặn**: *"Hỏa Diệm is quarantined. Consider an isolated stall."* |
| Groom bấm Move horse | Nút **khóa** + tooltip: *"Only the Club Manager can move horses between stalls."* |
| Chưa có chuồng nào | *"No stalls yet."* + nút Add stall |

> Màu ô chuồng lấy từ trạng thái sức khỏe của **con ngựa**, không phải thuộc tính của chuồng. Màu này phải **giống hệt** badge sức khỏe ở danh sách ngựa và hồ sơ ngựa — một bảng màu duy nhất cho toàn hệ thống.

---

# 4. Trạng thái màn hình — áp dụng cho mọi chức năng

Mỗi màn phải vẽ đủ sáu trạng thái. Thiếu empty state hoặc error state là lỗi hay gặp nhất.

| Trạng thái | Nghĩa | Cách thể hiện |
|---|---|---|
| Bình thường | Có dữ liệu, đủ quyền | — |
| Đang tải | Đang chờ dữ liệu | Khung xám giữ đúng chiều cao, không xoay vòng giữa màn |
| Rỗng | Không có bản ghi nào | Câu gợi ý hành động tiếp theo, không chỉ nói "không có dữ liệu" |
| Lỗi | Tải thất bại | Thông báo đỏ + nút Retry |
| Bị chặn thao tác | Vào được màn, một số nút không dùng được | Khóa nút + tooltip nói rõ **ai** mới làm được |
| Không được vào | Thiếu quyền vào màn | Trang 403 |

**Ba quy tắc chung toàn hệ thống**

1. **Tên ngựa luôn bấm được**, ở mọi bảng, mọi màn hình
2. **Nút bị chặn thì khóa kèm tooltip, không ẩn** — trừ trường hợp vai trò đó không bao giờ có quyền
3. Modal cho hành động không hoàn tác được phải **nêu hậu quả bằng con số**, không nói chung chung

---

# 5. Dữ liệu mẫu để chạy thử

Mốc ngày trong toàn bộ dữ liệu mẫu: **Thứ Bảy 19/09/2026**.

| Mã | Tên | Giống | Chủ | Chuồng | Sức khỏe |
|---|---|---|---|---|---|
| TM-01 | Hắc Phong | Thoroughbred | Nguyễn Hoàng Anh | A-02 | Fit |
| TM-02 | Bạch Vân | Arabian | Nguyễn Hoàng Anh | A-03 | Under Observation |
| TM-03 | Kim Long | Thoroughbred | Lý Thu Hà | A-05 | Fit |
| TM-04 | Tuyết Mã | Akhal-Teke | Lý Thu Hà | A-06 | **Injured** |
| TM-05 | Lôi Vũ | Thoroughbred | Vũ Đình Khôi | B-01 | Fit |
| TM-06 | Hỏa Diệm | Arabian | Vũ Đình Khôi | B-02 | **Quarantined** |
| TM-07 | Ngân Hà | Warmblood | Nguyễn Hoàng Anh | B-04 | Fit |
| TM-08 | Thiên Lý | Thoroughbred | Lý Thu Hà | A-08 | Under Observation |

Bộ này cố ý có đủ 4 trạng thái sức khỏe, 1 con để thử khóa huấn luyện (TM-04), 1 con cách ly (TM-06), và 3 chủ sở hữu để thử lọc theo quyền.

**Cách thử quyền nhanh nhất:** đăng nhập bằng tài khoản của Nguyễn Hoàng Anh → phải **chỉ thấy 3 con** TM-01, TM-02, TM-07.

---

# 6. Ghi chú & việc chưa chốt

**Đã bỏ cây phả hệ** khỏi phạm vi ngày 29/09/2026. Hồ sơ ngựa còn 4 tab thay vì 5. Ba chỗ khác cần dọn theo:

- `SRS_Phan1` §7.1 ghi "25 entity" → sửa thành **24**
- `US-F2-02` và `US-F2-03` trong SRS còn nhắc "pedigree" → bỏ chữ đó
- `LO_TRINH.md` Priority 2 còn liệt kê 2.6 và 2.7 → xóa hai dòng, còn 14 mục

*Nếu sau này làm lại phả hệ: mô hình đã chốt là bảng dẹt 6 ô (cha, mẹ, hai ông bà nội, hai ông bà ngoại), mỗi ô hoặc chọn ngựa trong CLB hoặc gõ tay tên. Ghi lại để khỏi bàn lại từ đầu.*

**Chưa chốt — chặn việc bắt đầu code**

Thư mục `features/intake/` đã có trong repo với ba màn `HorseIntake`, `BoardingRequests`, `OwnerPendingHome`, nhưng **chưa ai viết luồng**. Biết được: tài khoản Horse Owner có trạng thái chờ khai báo ngựa, và chỉ hoạt động khi đã gắn ít nhất một con.

Câu hỏi phải trả lời trước khi code chức năng 3.2: **ai tạo hồ sơ ngựa — chủ ngựa tự khai qua màn intake, hay Club Manager nhập?** Nếu chủ tự khai thì `HorseForm` không còn là màn duy nhất tạo ngựa, và luồng ở 3.2 phải viết lại.

**Chưa có thiết kế.** 13 màn trong tài liệu này chưa vẽ artboard. Tài liệu này là căn cứ để vẽ, hoặc để code thẳng nếu không kịp vẽ.

---

*Viết 29/09/2026 · dành cho Frontend · dựa trên quy tắc giao diện trong `CLAUDE.md` của repo.*
