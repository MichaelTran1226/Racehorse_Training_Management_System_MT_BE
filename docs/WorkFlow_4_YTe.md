# WorkFlow 4 · Y tế & Xử lý Chấn thương

> **Bộ WorkFlow — mỗi flow một file, chỉ mô tả luồng chạy thật.**
> Chủ sở hữu: **Cặp 2** · Feature: `features/health/`
> Stack: Vite + React + TS ↔ Express 5 + Prisma + PostgreSQL · session cookie.
>
> ⚠️ **Flow này chứa nửa còn lại của exception path 2** (§5 và §6). Nửa kia ở `WorkFlow_3_GiaoAn.md` §7.
> Môn học yêu cầu Workflow 2 có **2 exception path chạy được thật trước Milestone 2** —
> nếu Flow 4 chưa xong kịp, **màn đặt khóa phải dời lên làm cùng Flow 3**.
>
> ⚠️ Chưa code, chưa có artboard. Endpoint là **đề xuất**, viết theo quy ước của `docs/API_CONTRACT.md`.

---

## 0. Luồng này chạm vào những gì

**Màn hình** — 9 màn, `features/health/pages/`

`HerdHealth` · `MedicalRecords` (4 tab) · `Treatments` · `InjuryMap` · `TrainingLock` (đặt + danh sách + gỡ) · `CareSchedule`

**Bảng DB**: `health_records` · `diagnoses` · `treatments` · `injury_markers` · `next_appointments`
Cộng **`training_lock`** — bảng thuộc Flow 3 theo ERD, nhưng **bản ghi do Flow 4 tạo và gỡ**.

**Quyền** — ba key đã có sẵn: `viewMedical` · `placeLock` · `liftLock`

> Thiếu key cho thao tác **đổi trạng thái sức khỏe**. Đề xuất `changeHealthStatus`, mặc định chỉ bật cho
> Veterinarian — **kể cả Club Manager cũng không có**. `[chưa chốt]`

**Phụ thuộc**: Flow 1 (đăng nhập) · Flow 2 (`HorsePicker`, `HealthBadge`, `supplies_catalog` loại Medical) · **Flow 3** (đếm số buổi tập sẽ bị hủy khi đặt khóa)

**Thứ tự làm**: `HerdHealth` → `MedicalRecords` + `Treatments` + `InjuryMap` → **`TrainingLock`** → `CareSchedule`.

Nếu thời gian gấp, làm `TrainingLock` **trước** `MedicalRecords` — nó là phần chấm điểm, phần kia không.

---

## 1. Sơ đồ sức khỏe toàn đàn

`/health/herd` · cần `viewMedical` · `pages/HerdHealth.tsx`

1. Veterinarian đăng nhập → vào thẳng màn này.
2. **Bốn cột theo trạng thái**, mỗi cột một danh sách thẻ ngựa:

| Cột | Enum | Màu | Nghĩa |
|---|---|---|---|
| Fit | `FIT` | ok | Đủ điều kiện tập và thi đấu |
| Under Observation | `UNDER_OBSERVATION` | warn | Cần theo dõi, tập nhẹ |
| Injured | `INJURED` | danger | Chấn thương, thường kèm khóa huấn luyện |
| Quarantined | `QUARANTINED` | tím | Cách ly, tách khỏi đàn |

3. Mỗi thẻ: ảnh · tên (link) · mã · chuồng · ngày khám gần nhất · **badge khóa** nếu đang bị khóa huấn luyện.
4. Đầu màn: 4 ô đếm + bộ lọc theo dãy chuồng + ô tìm kiếm.
5. Panel phải — **Reminders**, bốn nhóm có số đếm: lịch hẹn quá hạn · sắp đến hạn 7 ngày · ngựa được Head Trainer gắn cờ · **đề nghị gỡ khóa đang chờ**.

**Bốn cột luôn hiện đủ, kể cả cột rỗng** — người dùng cần thấy "không có con nào chấn thương", đừng ẩn cột đi.

### Đổi trạng thái sức khỏe

Nút **Change status** trên thẻ → modal: dropdown trạng thái mới + **ô lý do bắt buộc**.

**State machine — không phải trạng thái nào cũng chuyển sang trạng thái nào được:**

| Từ | Sang được | Chặn |
|---|---|---|
| `FIT` | `UNDER_OBSERVATION` · `INJURED` · `QUARANTINED` | — |
| `UNDER_OBSERVATION` | `FIT` · `INJURED` · `QUARANTINED` | — |
| `INJURED` | `UNDER_OBSERVATION` · `QUARANTINED` | **`FIT` trực tiếp** — phải qua `UNDER_OBSERVATION` trước |
| `QUARANTINED` | `FIT` · `UNDER_OBSERVATION` | — |

**Ba quy tắc**

- **Chỉ Veterinarian** đổi được. Club Manager cũng không — đây là quyết định y tế
- Đổi trạng thái **không tự đặt hay tự gỡ** khóa huấn luyện. Hai việc độc lập, làm riêng
- Chuyển sang `INJURED` → modal gợi ý bước tiếp: *"Do you want to create a medical record and place a training lock?"* + hai nút dẫn đi. **Gợi ý thôi, không tự làm**

`healthStatus` hiển thị đồng bộ ở bốn nơi: màn này · danh sách ngựa · hồ sơ ngựa · sơ đồ chuồng. Một nguồn duy nhất.

```
GET /health/herd
→ { counts: { FIT: 4, UNDER_OBSERVATION: 2, INJURED: 1, QUARANTINED: 1 },
    horses: [{ id, code, name, photoUrl, stall, healthStatus,
               lastExamAt, hasActiveLock }] }
PUT /horses/{id}/health-status  { status, reason }
    → 400 INVALID_TRANSITION { from: "INJURED", to: "FIT" }
GET /health/reminders
```

---

## 2. Hồ sơ khám & chẩn đoán

`/health/records/:id` · `/health/records/new` · cần `viewMedical` · `pages/MedicalRecords.tsx`

Một hồ sơ khám có **4 tab**:

| Tab | Nội dung | Bảng |
|---|---|---|
| Examination | Triệu chứng, dấu hiệu sinh tồn, ghi chú | `health_records` |
| Diagnosis | Chẩn đoán, mức độ, tiên lượng | `diagnoses` |
| Injury Marker | Đánh dấu vị trí trên ảnh 2D (§4) | `injury_markers` |
| Treatment | Phác đồ và đơn thuốc (§3) | `treatments` |

Header hồ sơ luôn hiện: tên ngựa (link) · ngày khám · bác sĩ · trạng thái hồ sơ.

**Examination** — Exam date & time (mặc định hiện tại) · Chief complaint · Symptoms (chọn nhiều + ô tự do) · Vital signs: Temperature, Heart rate, Respiratory rate, Weight · Examination notes

**Diagnosis** — Diagnosis · Severity (`MILD`/`MODERATE`/`SEVERE`) · Affected body area · Prognosis · Expected recovery days

Lưu → hồ sơ ở trạng thái `OPEN`.

**Rẽ nhánh**

- Severity = `SEVERE` → Alert gợi ý: *"This is a severe diagnosis. Consider placing a training lock."* + nút dẫn sang §5. **Gợi ý, không tự đặt** — quyết định vẫn là của bác sĩ
- Ngựa đã có hồ sơ `OPEN` → cảnh báo `warn` + nút **Open it** hoặc **Create another**. Nhiều hồ sơ `OPEN` cùng lúc là hợp lệ (nhiều bệnh khác nhau)
- Ngày khám ở tương lai → chặn
- Nhiệt độ ngoài 35–42 °C → cảnh báo, không chặn
- Hồ sơ `CLOSED` → **chỉ đọc**, phải Reopen mới sửa được, và Reopen ghi audit
- Head Trainer mở hồ sơ → chỉ đọc, mọi ô disable + tooltip

**Hồ sơ khám không xóa được**, chỉ đóng. Yêu cầu truy vết.

Vào từ: `HerdHealth` · từ cảnh báo ở `AlertList` (Flow 3, tự điền sẵn ngựa và ghi chú) · từ tab Health của hồ sơ ngựa.

---

## 3. Phác đồ điều trị & đơn thuốc

Tab trong `MedicalRecords` · `pages/Treatments.tsx`

**Khối Treatment plan** — mô tả phác đồ · Start date · Expected end date · checkbox **Rest required** · Follow-up date

**Khối Prescription** — bảng thêm dòng:

| Cột | Ghi chú |
|---|---|
| Supply | dropdown từ `supplies_catalog`, **lọc `category = MEDICAL`**, `isActive = true` |
| Dosage | liều mỗi lần |
| Frequency | số lần/ngày |
| Duration | số ngày |
| Total quantity | **tự tính** = dosage × frequency × duration, không nhập tay |
| Unit cost | lấy từ danh mục, chỉ đọc |
| Line total | **tự tính** |

Dưới bảng: **Total treatment cost** tự cộng — con số này vào báo cáo chi phí y tế của Flow 5.

Lưu → hệ thống **trừ `stockOnHand`** của từng vật tư đã kê.

**Bốn quy tắc**

- Sửa đơn đã lưu → **hoàn kho cũ rồi trừ kho mới, trong một transaction**
- Tồn kho không đủ → **cảnh báo, không chặn**: *"Only 3 doses of Phenylbutazone remain; this prescription needs 10."* Thực tế bác sĩ vẫn phải kê, Club Manager đi mua thêm
- Đơn thuốc **rỗng là hợp lệ** — có phác đồ nghỉ ngơi mà không cần thuốc
- Tick **Rest required** → Alert `info` gợi ý đặt khóa huấn luyện

Horse Owner **đọc được** đơn thuốc của ngựa mình — vì họ trả tiền.

---

## 4. Đánh dấu chấn thương trên ảnh 2D

Tab trong `MedicalRecords` · `pages/InjuryMap.tsx`

**Phạm vi**: dùng **ảnh 2D có tọa độ điểm đánh dấu**, **không** dựng mô hình 3D.

1. Hiển thị ảnh sơ đồ cơ/xương ngựa nhìn ngang (SVG hoặc PNG, tỷ lệ cố định), bên phải là danh sách điểm đã đánh.
2. Click lên ảnh → điểm mới + popover nhập: Body area (tự điền theo vùng click, sửa được) · Severity · Note.
3. Điểm hiện trên ảnh với **màu và kích thước theo mức độ**:

| Severity | Màu | Đường kính |
|---|---|---|
| `MILD` | warn vàng | 12px |
| `MODERATE` | cam | 16px |
| `SEVERE` | danger đỏ | 20px |

4. Danh sách bên phải đồng bộ hai chiều: hover dòng thì điểm trên ảnh nổi bật, và ngược lại.

**Quy tắc quan trọng nhất của màn này**

> **Tọa độ lưu theo phần trăm kích thước ảnh, KHÔNG theo pixel.**
> Ảnh hiển thị ở nhiều kích thước (1440px, 1280px, 390px). Lưu pixel là điểm đánh dấu lệch trên mobile.

Các quy tắc khác:

- Mỗi điểm bắt buộc có **vùng cơ thể** và **mức độ**
- Điểm gắn với **một hồ sơ khám cụ thể**, không gắn thẳng vào ngựa — để tra được chấn thương ngày nào
- Vùng cơ thể phải đồng bộ với trường "Affected area" ở tab Diagnosis
- Nút **Compare with previous** hiện điểm của lần khám trước dạng mờ chồng lên
- Head Trainer xem: click lên ảnh **không tạo điểm**, hiện tooltip giải thích

---

# EXCEPTION PATH 2 — nguồn phát sinh

## 5. Đặt lệnh khóa huấn luyện

> **Đây là nơi sinh ra `training_lock`.** Hệ quả hiển thị bên Flow 3.

`/health/locks/new` · cần `placeLock` · `pages/TrainingLock.tsx`

**Form**

| Trường | Ghi chú |
|---|---|
| Horse | Chỉ ngựa `isActive`; con đã bị khóa hiện badge cảnh báo |
| Lock scope | radio 2 lựa chọn — **`FULL`** chặn mọi buổi tập và lượt chạy thử · **`HIGH_INTENSITY_ONLY`** chỉ chặn bài nặng và lượt chạy thử |
| Reason | **Bắt buộc**, 10–500 ký tự. **Đây là chữ sẽ hiện trên `LockBanner` mà Head Trainer đọc** |
| Expected duration | 1–365 ngày |
| Link to medical record | Tùy chọn, liên kết hồ sơ khám làm căn cứ |

### Khối hậu quả — phần không được bỏ

Ngay khi chọn ngựa, FE gọi `GET /horses/{id}/lock-impact?scope=FULL` và hiện:

```
┌─────────────────────────────────────────────────────────┐
│ What this lock will do                                  │
│                                                          │
│  • 1 active training plan will be suspended             │
│  • 5 scheduled sessions in the next 7 days will be      │
│    cancelled                                             │
│  • 1 trial run on 22 Sep will be cancelled              │
│  • Trần Văn Nam (Head Trainer) will be notified         │
└─────────────────────────────────────────────────────────┘
```

**Con số phải cập nhật lại khi đổi `scope`** — `HIGH_INTENSITY_ONLY` hủy ít buổi hơn. Đây là chỗ dễ quên nhất.

### Chạy

1. Bấm **Place lock** → modal xác nhận **nhắc lại hậu quả bằng con số**:
   *"Place a full training lock on Tuyết Mã? This will suspend 1 training plan and cancel 5 scheduled sessions in the next 7 days."*
2. Xác nhận → `POST /health/training-locks`
3. BE trong **một transaction**: tạo `training_lock` → chuyển giáo án sang `SUSPENDED` → hủy buổi tập kèm `cancelReason` → ghi phiên bản giáo án với `changedBy = SYSTEM` → ghi audit `TRAINING_LOCK_PLACED`
4. Toast *"Training lock placed. 5 sessions cancelled."*, điều hướng sang danh sách lock

**Lỗi giữa transaction → rollback toàn bộ.** Không được có trường hợp lock đã tạo nhưng buổi tập chưa hủy.

**Rẽ nhánh**

| Tình huống | Xử lý |
|---|---|
| Ngựa đã có lock cùng mức | Chặn: *"This horse is already under a full training lock placed on 19 Sep 2026."* + nút View lock |
| Nâng `HIGH_INTENSITY_ONLY` → `FULL` | Cho phép: gỡ lock cũ + tạo lock mới, trong một transaction, hậu quả tính lại |
| Hạ `FULL` → `HIGH_INTENSITY_ONLY` | **Chặn**: *"Lift the full lock first, then place a partial lock."* Hạ cấp cần khôi phục buổi tập, quá phức tạp |
| Đặt lock cho ngựa chưa `INJURED` | Cảnh báo, **không chặn** + gợi ý đổi trạng thái sức khỏe |
| Head Trainer gõ tay URL | `403` |

**Đặt khóa không tự đổi `healthStatus`**, chỉ gợi ý — đối xứng với quy tắc ở §1.

```
GET  /horses/{id}/lock-impact?scope=FULL
→ { activePlans: 1, scheduledSessions7d: 5, trialRuns: 1,
    headTrainer: { id, fullName } }
POST /health/training-locks  { horseId, scope, reason, expectedDays, medicalRecordId }
→ { id, isActive: true, scope, placedAt,
    suspendedPlans: 1, cancelledSessions: 5, cancelledTrialRuns: 1 }
409 LOCK_ALREADY_EXISTS · CANNOT_DOWNGRADE
403 FORBIDDEN
```

---

## 6. Gỡ khóa & xử lý đề nghị gỡ khóa

`/health/locks` · cần `liftLock`

1. Bảng các lock: Horse (link) · Scope · Placed at · Placed by · Expected until · Days remaining · **Review requested**.
2. **Mặc định lọc "Active"**.
3. Dòng có đề nghị gỡ khóa từ Head Trainer → badge `info` *"Review requested"*.
4. Bấm **Lift lock** → modal: tóm tắt lock, **nguyên văn lý do Head Trainer viết** (nếu có), ô **Lift reason bắt buộc**, và câu nêu hậu quả: *"Trần Văn Nam will be notified and can reschedule the 5 cancelled sessions."*
5. Xác nhận → `isActive = false`, giáo án `SUSPENDED` → `ACTIVE` **nếu không còn lock nào khác**, tạo thông báo cho Head Trainer, ghi audit `TRAINING_LOCK_LIFTED`.

**Xử lý đề nghị gỡ khóa**

Head Trainer gửi đề nghị từ Flow 3 → hiện ở panel Reminders (§1) và badge trên dòng. Bác sĩ có hai lựa chọn:

- **Lift lock** — đồng ý, theo luồng trên
- **Decline request** — từ chối, **bắt buộc nhập lý do**. Head Trainer nhận thông báo, **lock giữ nguyên**

**Năm quy tắc**

1. **Chỉ Veterinarian gỡ được khóa.** Head Trainer chỉ đề nghị
2. Lý do gỡ **bắt buộc**
3. **Lock không tự gỡ khi hết hạn dự kiến** — phải có bác sĩ quyết định. Hết hạn chỉ hiện badge `warn` *"Expired 3 days ago"* và xuất hiện trong Reminders
4. Giáo án chỉ về `ACTIVE` khi ngựa **không còn lock nào** đang hoạt động
5. Buổi tập đã `CANCELLED` **không tự khôi phục** — Head Trainer xếp lại thủ công

Nút **Extend** gia hạn thêm ngày + lý do, không tạo lock mới.

Lịch sử đặt và gỡ khóa lưu **vĩnh viễn**, hiện ở tab Health của hồ sơ ngựa.

```
GET  /health/training-locks?status=ACTIVE&horseId=
→ [{ id, horse, scope, reason, placedBy, placedAt, expectedUntil,
     daysRemaining, isExpired,
     reviewRequest: { id, requestedBy, requestedAt, reason } | null }]
POST /health/training-locks/{id}/lift    { reason }
→ { id, isActive: false, liftedAt, resumedPlans: 1, cancelledSessions: 5 }
POST /health/training-locks/{id}/extend  { extraDays, reason }
POST /lock-review-requests/{id}/decline  { reason }
```

---

## 7. Lịch hẹn định kỳ

`/health/appointments` · cần `viewMedical` · `pages/CareSchedule.tsx`

**Phạm vi**: chỉ là **field ngày hẹn + danh sách sắp đến hạn**. **Không có notification engine** — không gửi email, không gửi SMS. Nhắc việc hiển thị trong app.

**Bốn loại lịch hẹn**

| Loại | Enum | Chu kỳ gợi ý |
|---|---|---|
| Tiêm phòng | `VACCINATION` | 6 hoặc 12 tháng |
| Tẩy giun | `DEWORMING` | 3 tháng |
| Kiểm tra móng | `FARRIER` | 6–8 tuần |
| Tái khám | `FOLLOW_UP` | theo chỉ định |

1. Hai chế độ xem: **List** và **Calendar (tháng)**.
2. Bảng: Due date · Horse (link) · Type · Status · Last done · Notes.
3. Badge trạng thái **tự tính** từ ngày hẹn so với hôm nay, không lưu cột:

`Overdue` (quá hạn, đỏ) · `Due soon` (trong **7 ngày**, vàng) · `Scheduled` (còn > 7 ngày) · `Completed` (xanh)

4. Thêm lịch: Horse · Type · Due date · Notes · checkbox **Recurring** + chu kỳ.
5. **Mark as done** → nhập ngày thực hiện + ghi chú; nếu là lịch định kỳ thì **tự tạo lịch hẹn tiếp theo** theo chu kỳ.

**Rẽ nhánh**

- Ngày hẹn ở quá khứ khi tạo mới → cảnh báo, **không chặn** (ghi lại lịch đã lỡ là hợp lệ)
- Trùng lịch cùng loại cho cùng con → cảnh báo
- Đánh dấu xong lịch ở tương lai → cảnh báo xác nhận
- **Lịch quá hạn không tự xóa** — giữ lại để thấy việc bị bỏ sót

Dùng bảng **`next_appointments`**, không dùng tên cũ `vaccination_schedule`.

---

## 8. Quyền — bốn ô quyết định

| Hành động | Head Trainer | **Veterinarian** | Groom | Horse Owner | Club Manager |
|---|---|---|---|---|---|
| Xem sơ đồ sức khỏe | đọc | **toàn quyền** | đọc | ngựa mình | đọc |
| **Đổi `healthStatus`** | không | **toàn quyền** | không | không | **KHÔNG** |
| Tạo / sửa hồ sơ khám | không | **toàn quyền** | không | không | không |
| Kê đơn thuốc | không | **toàn quyền** | không | đọc | đọc |
| **Đặt khóa huấn luyện** | **KHÔNG** | **toàn quyền** | không | không | **KHÔNG** |
| **Gỡ khóa huấn luyện** | **KHÔNG** | **toàn quyền** | không | không | **KHÔNG** |
| Đề nghị gỡ khóa | **toàn quyền** (Flow 3) | — | không | không | không |
| Lịch hẹn định kỳ | đọc | **toàn quyền** | đọc | ngựa mình | đọc |

**Hai ô hay làm sai:**

- **Club Manager × đổi `healthStatus` = KHÔNG** và **× khóa huấn luyện = KHÔNG.** Người ta hay cho Club Manager quyền tối cao, nhưng quản lý CLB không can thiệp vào quyết định y tế.
- **Head Trainer × đặt/gỡ khóa = KHÔNG.** Đây là toàn bộ ý nghĩa của exception path 2.

Groom đọc được sơ đồ sức khỏe — cần biết con nào đang cách ly để không dắt chung.

---

## 9. Xong khi nào

**Sức khỏe đàn**

- [ ] 4 cột luôn hiện đủ, cột rỗng hiện "None" chứ không biến mất
- [ ] Thử chuyển `INJURED` → `FIT` trực tiếp: **bị chặn** kèm câu giải thích
- [ ] Đổi trạng thái không nhập lý do: bị chặn
- [ ] Head Trainer: nút Change status **disable + tooltip**
- [ ] Màu 4 trạng thái **giống hệt** màu ở sơ đồ chuồng và hồ sơ ngựa

**Hồ sơ khám & điều trị**

- [ ] 4 tab hoạt động, mỗi tab có route riêng
- [ ] Chẩn đoán `SEVERE` → hiện gợi ý đặt khóa, **không tự đặt**
- [ ] Kê đơn trừ đúng tồn kho; sửa đơn hoàn kho cũ rồi trừ kho mới
- [ ] Thiếu kho → cảnh báo vàng, **vẫn lưu được**
- [ ] Total quantity và Line total không nhập tay được
- [ ] Hồ sơ `CLOSED` chỉ đọc

**Chấn thương 2D**

- [ ] Click lên ảnh tạo điểm đúng vị trí
- [ ] **Thu nhỏ cửa sổ xuống 390px: điểm vẫn đúng vị trí** — bằng chứng lưu theo phần trăm
- [ ] 3 mức độ ra 3 màu và 3 kích thước khác nhau
- [ ] Head Trainer click lên ảnh: **không tạo điểm**

**Exception path 2 — phần chấm điểm**

- [ ] Màn đặt khóa hiện **khối hậu quả bằng con số** ngay khi chọn ngựa
- [ ] Đổi `scope` từ `FULL` sang `HIGH_INTENSITY_ONLY` → **con số hậu quả thay đổi**
- [ ] Modal xác nhận nhắc lại hậu quả bằng con số
- [ ] Đặt khóa `FULL` → sang Flow 3 kiểm: giáo án `SUSPENDED`, buổi tập `CANCELLED` **có gạch ngang và lý do**
- [ ] Đặt khóa `HIGH_INTENSITY_ONLY` → giáo án **vẫn `ACTIVE`**, chỉ bài nặng bị hủy
- [ ] **Giả lập lỗi giữa transaction → rollback sạch**, không có lock mồ côi
- [ ] Đặt lock lần hai cùng mức: **bị chặn** kèm thông tin lock cũ
- [ ] Head Trainer gõ tay `/health/locks/new` → **403**
- [ ] **Gọi thẳng `POST /health/training-locks` bằng tài khoản Head Trainer → BE trả `403`**
- [ ] Gỡ khóa không nhập lý do: bị chặn
- [ ] Gỡ khóa → sang Flow 3 kiểm: giáo án về `ACTIVE`, Head Trainer thấy banner với **đúng số buổi đã bị hủy**
- [ ] Ngựa có 2 lock: gỡ 1 cái, giáo án **vẫn `SUSPENDED`**
- [ ] Đề nghị gỡ khóa của Head Trainer hiện đúng ở Reminders và badge
- [ ] Từ chối đề nghị không nhập lý do: bị chặn

**Lịch hẹn**

- [ ] 4 badge trạng thái tính đúng theo mốc **19/09/2026**
- [ ] Lịch định kỳ: đánh dấu xong → **tự tạo lịch tiếp theo** đúng chu kỳ
- [ ] Panel Reminders đếm đúng 4 nhóm

**Chung**

- [ ] Dùng lại `HorseLink`, `HealthBadge`, `LockBanner`, `ConfirmModal`, `DisabledHint`
- [ ] Mỗi màn có mock chạy được
- [ ] `npm run build` không lỗi

---

## 10. Chưa chốt

1. **Toàn bộ endpoint là đề xuất**, chưa có trong `docs/API_CONTRACT.md`.
2. **PermissionKey `changeHealthStatus`** chưa tồn tại. Hiện `PermissionKey` mới có `viewMedical` / `placeLock` / `liftLock`.
3. **Enum của Flow 4** (`healthStatus`, `severity`, loại lịch hẹn, `scope`) chưa có trong `schema.prisma`.
4. **Ảnh sơ đồ cơ/xương ngựa cho `InjuryMap`** — chưa có. Cần một file SVG hoặc PNG, tỷ lệ cố định, và một danh sách vùng cơ thể chuẩn.
5. **Chưa có artboard.** 9 màn chưa vẽ. Ba màn đáng vẽ trước: đặt khóa, modal xác nhận có con số, và danh sách lock.
6. **Thời điểm làm màn đặt khóa** — xem cảnh báo ở đầu file. Đây là điểm mở đã ghi trong `LO_TRINH.md` từ 21/09, cặp 2 quyết.

---

*Viết 29/09/2026 · quy ước theo `docs/API_CONTRACT.md` và `CLAUDE.md` trong repo `Horse-Training-Club`.*
