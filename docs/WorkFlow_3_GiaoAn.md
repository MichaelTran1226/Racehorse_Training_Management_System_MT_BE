# WorkFlow 3 · Giáo án Huấn luyện

> **Bộ WorkFlow — mỗi flow một file, chỉ mô tả luồng chạy thật.**
> Chủ sở hữu: **Cặp 2** · Feature: `features/training/`
> Stack: Vite + React + TS ↔ Express 5 + Prisma + PostgreSQL · session cookie.
>
> ⚠️ **Đây là Workflow 2 của môn học — trọng số điểm cao nhất.** Bắt buộc có **1 main flow + 2 exception path
> chạy được thật**, không phải chỉ vẽ. Exception path 1 ở §6, exception path 2 ở §7–§8.
>
> ⚠️ Chưa code, chưa có artboard. Endpoint là **đề xuất**, viết theo quy ước của `docs/API_CONTRACT.md`.

---

## 0. Luồng này chạm vào những gì

**Màn hình** — 15 màn, `features/training/pages/`

`PlanList` · `PlanWizard` (4 bước) · `TrainingCalendar` · `TrialRuns` · `SessionMetrics` · `PlanHistory` · `LiveMonitor` (4 trạng thái) · `AlertList`

**Bảng DB**: `training_plans` · `training_sessions` · `performance_metrics` · `training_lock` · `alerts`

**Quyền** — bốn key đã có sẵn: `createPlan` · `assignSchedule` · `recordMetrics` · `ackAlerts`

**Phụ thuộc**

- Flow 1: đăng nhập, RoleGuard
- Flow 2: `HorsePicker`, `HorseLink`, `HealthBadge`, bảng `staff` để phân công
- **Flow 4**: bảng `training_lock` — quyết định ngựa có được tập không

> **Vòng phụ thuộc 3 ↔ 4 xử lý thế nào.** Flow 3 đọc khóa qua hook `useTrainingLock(horseId)`;
> Flow 4 đếm buổi tập qua endpoint riêng. Hai flow **không import code của nhau**, chỉ gọi API.

**Thứ tự làm**: `PlanList` → `PlanWizard` → `TrainingCalendar` → `SessionMetrics` → `TrialRuns` → `PlanHistory` → **`LiveMonitor` + `AlertList`** (exception 1) → **màn giáo án bị khóa** (exception 2).

Hai cái cuối làm sau nhưng **đừng để tới tuần chót** — đó là phần chấm điểm nặng nhất.

---

## 1. Danh sách giáo án

`/training/plans` · cần `createPlan` để tạo, `viewHorses` để xem

1. Bảng: Horse (link) · Plan name · Phase · Start · End · Status badge · Sessions done/total.
2. **Mặc định lọc `ACTIVE`** — đây là việc đang làm, không phải kho lưu trữ.
3. Bộ lọc: Horse · Status · Phase · khoảng thời gian.

**Năm trạng thái giáo án — phân biệt cho đúng**

| Enum | Hiển thị | Badge | Nghĩa |
|---|---|---|---|
| `DRAFT` | Draft | neutral | Đang soạn |
| `ACTIVE` | Active | ok | Đang chạy |
| `PAUSED` | Paused | warn | **Head Trainer tự bấm, tự gỡ được** |
| `COMPLETED` | Completed | neutral | Xong |
| `SUSPENDED` | Suspended | danger | **Bác sĩ khóa, Head Trainer KHÔNG gỡ được** |

`PAUSED` và `SUSPENDED` render nhầm nhau là mất điểm. Một cái do mình bấm, một cái do người khác áp đặt.

**Rẽ nhánh**

- Bấm hàng `SUSPENDED` → mở màn giáo án có `LockBanner` (§7), không phải màn thường
- Nút **Resume** trên giáo án `SUSPENDED` → **disable + tooltip**: *"This plan is suspended by a training lock. Ask the Veterinarian to lift the lock."*
- Một con ngựa chỉ có **tối đa một** giáo án `ACTIVE` tại một thời điểm

```
GET  /training/plans?horseId=&status=ACTIVE&phase=&page=1&size=20
→ { content: [{ id, horse, name, phase, startDate, endDate, status,
                sessionsDone, sessionsTotal,
                lock: { isActive, scope, reason, placedBy, placedAt } | null }] }
POST /training/plans/{id}/pause    { reason }
POST /training/plans/{id}/resume   → 409 PLAN_SUSPENDED_BY_LOCK
```

---

## 2. Lập giáo án — wizard 4 bước

`/training/plans/new` · cần `createPlan` · `pages/PlanWizard.tsx`

```
[1] Chọn ngựa & mục tiêu → [2] Chia giai đoạn → [3] Chi tiết bài tập → [4] Xem lại & phân công
```

Thanh tiến trình `WizardStepper` hiện ở cả 4 bước. Mỗi bước validate xong mới cho bấm Next. Nút Back giữ nguyên dữ liệu đã nhập.

**Bước 1** — Horse (`HorsePicker`) · Plan name · Goal · Start date · Target end date

**Bước 2** — bốn giai đoạn chuẩn, chỉnh được số tuần từng cái:

`PREPARATION` (làm quen) → `BASE` (sức bền) → `INTENSITY` (cường độ) → `PEAK` (đỉnh phong độ)

Bỏ bớt giai đoạn được, tối thiểu còn 1.

**Bước 3** — nhập cho **từng giai đoạn**: Distance (m) · Workload (`LIGHT`/`MODERATE`/`HIGH`) · Track surface (`TURF`/`DIRT`/`SYNTHETIC`/`SAND`) · Frequency (buổi/tuần) · Rest days

**Bước 4** — tóm tắt 3 bước trước + chọn **care team** (`staff` có `employmentStatus = ACTIVE`) + hai nút **Save as draft** / **Save and activate**

Bấm **Save and activate** → tạo giáo án rồi gọi tiếp `activate`, chuyển `ACTIVE` và **sinh sẵn các buổi tập** theo tần suất × số tuần.

### Chỗ quan trọng nhất của wizard — bước 1 với ngựa bị khóa

Chọn một con đang có `training_lock` đang hoạt động:

1. FE gọi `GET /horses/{id}/training-lock` ngay khi chọn ngựa
2. Hiện **`LockBanner`** ngay dưới combobox: ai khóa, lúc nào, lý do, thời hạn
3. Nút **Next** → **disable + tooltip**: *"Tuyết Mã is under a training lock placed by Lê Minh Châu. You cannot create a plan for this horse."*

Đây là **một nửa của exception path 2**. Hội đồng sẽ thử đúng thao tác này: khóa một con rồi thử lập giáo án cho nó.

**Rẽ nhánh khác**

- Ngựa đã có giáo án `ACTIVE` → cảnh báo `warn`, vẫn cho tiếp; khi activate thì giáo án cũ chuyển `PAUSED`, **không xóa**
- Ngựa bị khóa **sau khi** đã qua bước 1 → bước 4 bấm Save trả `409 HORSE_LOCKED` → Alert `danger` + đưa về bước 1
- Tổng số tuần các giai đoạn ≠ khoảng thời gian ở bước 1 → cảnh báo, không chặn

```
GET  /horses?trainable=true       ← BE loại sẵn ngựa bị khóa và ngựa inactive
GET  /horses/{id}/training-lock
POST /training/plans  { horseId, name, goal, startDate, endDate,
                        phases: [{ phase, weeks, distance, workload,
                                   surface, frequency, restDays }],
                        careTeamIds: [3, 7] }
     → 409 HORSE_LOCKED { scope, reason, placedBy, placedAt }
POST /training/plans/{id}/activate  → { sessionsCreated: 36 }
```

---

## 3. Lịch tập tuần

`/training/calendar` · cần `assignSchedule` để sửa · `pages/TrainingCalendar.tsx`

1. Lịch 7 cột, **mặc định mở tuần chứa 19/09/2026** (mốc dữ liệu mẫu).
2. Mỗi ô: giờ · tên ngựa (link) · loại bài · người phụ trách · badge trạng thái.
3. Bấm ô trống → modal **Add session**. Bấm ô có buổi → **Edit session**.

**Năm trạng thái buổi tập**

| Enum | Vẽ thế nào |
|---|---|
| `SCHEDULED` | Nền thường |
| `IN_PROGRESS` | Viền nhấp nháy nhẹ + link sang `LiveMonitor` |
| `COMPLETED` | Nền nhạt + dấu tick |
| `CANCELLED` | **Gạch ngang + nhãn lý do, KHÔNG xóa khỏi lịch** |
| `MISSED` | Nền vàng — quá 24 giờ mà chưa ghi chỉ số |

**Hai mức khóa chặn khác nhau**

| Mức khóa | Hệ quả trên lịch |
|---|---|
| `FULL` | Không xếp được buổi nào. Chọn con đó trong modal → Alert `danger`, nút Save disable |
| `HIGH_INTENSITY_ONLY` | Vẫn xếp được bài nhẹ. Chọn Workload = `HIGH` → ô đó disable + tooltip: *"High-intensity sessions are blocked while this horse is under a partial training lock."* |

**Rẽ nhánh**

- Hai buổi trùng giờ cùng một con ngựa → **chặn cứng**: *"Hắc Phong already has a session at 07:00."*
- Một nhân sự bị gán 2 buổi trùng giờ → **chỉ cảnh báo** — thực tế một người dắt được hai con
- Xếp buổi vào quá khứ → chặn
- Groom xem lịch → mặc định lọc **chỉ buổi được gán cho mình**
- Horse Owner xem lịch → chỉ thấy buổi của ngựa mình sở hữu

```
GET  /training/sessions?from=2026-09-14&to=2026-09-20&horseId=&staffId=
POST /training/sessions
POST /training/sessions/{id}/cancel  { reason }
409  HORSE_LOCKED { scope } · HIGH_INTENSITY_BLOCKED · HORSE_TIME_CONFLICT { conflictAt }
```

---

## 4. Ghi chỉ số sau buổi tập

`/training/sessions/:id/metrics` · cần `recordMetrics` · `pages/SessionMetrics.tsx`

Hai tab: **Metrics** và **Notes**.

**Metrics** — Average HR · Peak HR · Recovery HR (sau 5 phút) · Average speed · Top speed · Actual distance · Duration · Track surface · Weather · Temperature

**Notes** — nhận xét chuyên môn (10–2000 ký tự) · Rating (`EXCELLENT`/`GOOD`/`AVERAGE`/`POOR`) · checkbox **Flag for veterinary review**

1. Lưu → buổi chuyển `COMPLETED`, dữ liệu vào `performance_metrics`.
2. Biểu đồ ở tab Training của hồ sơ ngựa và Dashboard cập nhật theo.

**Bốn quy tắc**

- `Average HR > Peak HR` → **chặn cứng**
- `Peak HR > 200 bpm` → cảnh báo dưới ô, vẫn cho lưu, và **tự sinh một bản ghi `alerts`** — kể cả khi nhập tay sau buổi
- Sửa chỉ số chỉ trong **48 giờ**; sau đó ô disable + tooltip
- Không ghi chỉ số cho buổi `CANCELLED`

Tick **Flag for veterinary review** → tạo mục cần xem cho bác sĩ ở Flow 4, **không** tự tạo hồ sơ khám.

---

## 5. Lượt chạy thử & lịch sử phiên bản

### TrialRuns — `/training/trial-runs`

Bảng: Date · Horse · Track · Lane · Distance · Target time · Actual time · Result badge (`Faster`/`On target`/`Slower`).

Đặt lịch trước, nhập kết quả sau khi chạy.

**Lượt chạy thử luôn tính là bài cường độ cao** — khóa `HIGH_INTENSITY_ONLY` **cũng chặn** lượt chạy thử, không chỉ khóa `FULL`. Một đường chạy chỉ một ngựa tại một thời điểm. Lượt bị hủy vẫn giữ trong bảng, gạch ngang.

### PlanHistory — `/training/plans/:id/history`

Mỗi lần sửa giáo án tạo **một phiên bản mới**, không ghi đè. Panel diff tô nền trường đã đổi.

Thay đổi do hệ thống gây ra cũng ghi phiên bản, với `changedBy = SYSTEM` kèm tên bác sĩ: *"Suspended automatically — training lock placed by Lê Minh Châu."*

Chỉ đọc, **không khôi phục được** phiên bản cũ.

---

# EXCEPTION PATH 1 — cảnh báo vượt ngưỡng realtime

## 6. LiveMonitor & AlertList

`/training/monitor/:sessionId` · `/training/alerts` · cần `ackAlerts`

**Nguồn dữ liệu**: giả lập, **không** nối thiết bị thật. Bộ sinh phía BE đẩy mẫu mỗi **5 giây**, hoặc nhập tay khi mất kết nối.

### Bốn trạng thái — bốn artboard

**(a) Normal** — hai biểu đồ đường: nhịp tim và vận tốc theo thời gian, có **đường ngưỡng an toàn** vẽ ngang nhãn "200 bpm". Ba ô số lớn: HR hiện tại · Speed · Elapsed. Badge xanh *"Receiving data"*.

**(b) Approaching** — kích hoạt ở **90% ngưỡng** (180 bpm). Biểu đồ đổi tông `warn`, Alert vàng. **Chưa** sinh bản ghi `alerts`.

**(c) THRESHOLD EXCEEDED** ← *artboard quan trọng nhất của exception 1*

Kích hoạt khi HR > 200 bpm **duy trì ≥ 30 giây**. Vượt thoáng qua thì không tính.

- Biểu đồ đổi tông `danger`, vùng vượt ngưỡng tô nền đỏ nhạt
- **Alert đỏ chiếm toàn chiều rộng, có icon, KHÔNG tự tắt**: *"Heart rate exceeded 200 bpm for 34 seconds. Stop the session and check the horse."*
- Toast đỏ góc dưới phải cùng lúc
- Khối **Acknowledge** bắt buộc: dropdown hành động đã thực hiện + ô ghi chú + nút xác nhận
- Bốn lựa chọn: `SESSION_STOPPED` · `INTENSITY_REDUCED` · `VET_NOTIFIED` · `FALSE_READING`
- **Chưa acknowledge thì Alert không biến mất**, kể cả khi HR đã về bình thường

**(d) Device disconnected** — quá 15 giây không nhận mẫu. Biểu đồ chuyển xám, *"Last reading 00:42 ago"*, nút **Enter readings manually** mở form nhập tay, nút **Retry connection**.

### Sáu quy tắc của exception 1

1. Ngưỡng nhịp tim: **> 200 bpm duy trì ≥ 30 giây**
2. Ngưỡng vận tốc: **> 60 km/h** ở bài không phải nước đại tối đa
3. Cảnh báo hiển thị **trong ≤ 3 giây** kể từ khi vượt ngưỡng
4. **Acknowledge bắt buộc chọn hành động**, không cho bấm suông
5. Bản ghi `alerts` **không xóa được**, kể cả cảnh báo giả — chỉ đánh dấu `isFalsePositive`
6. Dữ liệu biểu đồ lưu ở **server**. **F5 giữa buổi tập phải vẽ lại được đầy đủ, cảnh báo không mất**

### AlertList

Bảng: Raised at · Horse (link) · Type · Value vs threshold · Severity · Status · Acknowledged by.

**Mặc định lọc "Unacknowledged"**. Sidebar hiện badge số cảnh báo chưa xử lý, cập nhật mỗi 60 giây.

`WARNING` = vượt 1–10% · `CRITICAL` = vượt > 10% hoặc duy trì > 60 giây.

Veterinarian đọc được và có nút **Create medical record** dẫn sang Flow 4. Chỉ Head Trainer được acknowledge.

```
POST /training/sessions/{id}/start
GET  /training/sessions/{id}/telemetry?since=<timestamp>
→ { samples: [{ at, heartRate, speed }], deviceStatus: "CONNECTED"|"DISCONNECTED",
    thresholds: { heartRate: 200, speed: 60, sustainSeconds: 30 } }
POST /training/sessions/{id}/telemetry/manual  { heartRate, speed }
GET  /alerts?status=UNACKNOWLEDGED&horseId=&severity=
GET  /alerts/unacknowledged-count
POST /alerts/{id}/acknowledge  { actionTaken, note }  → 400 ACTION_REQUIRED
POST /training/sessions/{id}/end
```

---

# EXCEPTION PATH 2 — khóa huấn luyện khẩn cấp

## 7. Giáo án khi ngựa bị khóa

> **Đây là màn quan trọng nhất của cả Flow 3.** Hội đồng soi đúng màn này để chấm exception path 2.

### Chuyện gì xảy ra khi bác sĩ bấm khóa (Flow 4)

```
Veterinarian đặt lock
        ↓
training_lock.isActive = true, scope = FULL | HIGH_INTENSITY_ONLY
        ↓
1. Giáo án ACTIVE của con đó       → SUSPENDED
2. Buổi tập SCHEDULED tương lai    → CANCELLED, kèm cancelReason
3. Lượt chạy thử đã đặt            → CANCELLED
4. Ghi một phiên bản giáo án mới, changedBy = SYSTEM
5. Ghi audit TRAINING_LOCK_PLACED
```

Với `HIGH_INTENSITY_ONLY` thì bước 2 chỉ hủy buổi `workload = HIGH`, buổi nhẹ giữ nguyên, và **giáo án vẫn `ACTIVE`** chứ không `SUSPENDED`.

### Màn giáo án bị khóa phải có đủ bốn thứ

**1. `LockBanner` đỏ**, ngay dưới header, nêu đủ **ai khóa · lúc nào · lý do · thời hạn dự kiến · mức khóa**:

```
┌──────────────────────────────────────────────────────────┐
│ [!]  Training lock — Full                                │
│                                                           │
│  Placed by Lê Minh Châu (Veterinarian) on 19 Sep 2026,   │
│  14:20. Reason: Suspected tendon strain in the left fore │
│  leg. Expected duration: 14 days.                        │
│                                                           │
│  [ Request lock review ]                                  │
└──────────────────────────────────────────────────────────┘
```

**2. Bài tập cường độ cao bị disable rõ ràng** — dòng `workload = HIGH` làm mờ + icon khóa + tooltip *"Blocked by the active training lock."*

**3. Nút "Schedule session" vô hiệu, KHÔNG ẩn đi**

```
[ Schedule session ]   ← disable, xám
   tooltip: "You cannot schedule sessions while this horse is under a
             training lock. Ask the Veterinarian to lift the lock."
```

Đây là điểm hội đồng soi. **Ẩn nút đi là mất điểm** — người dùng phải nhìn thấy chức năng tồn tại nhưng đang bị chặn, và hiểu vì sao.

**4. Ô đề nghị gỡ khóa** gửi cho bác sĩ. Gửi xong nút chuyển "Review requested" + disable đến khi bác sĩ trả lời.

### Lịch tuần khi có buổi bị hủy

- Buổi bị hủy **gạch ngang, nền xám, KHÔNG xóa khỏi lịch**
- Dưới tên ngựa có nhãn `danger` nhỏ: *"Cancelled — training lock"*
- Bấm vào vẫn mở được chi tiết, ở chế độ chỉ đọc
- Trên đầu lịch có dải tóm tắt: *"5 sessions cancelled this week by training locks."*

### Bốn quy tắc không được sai

1. **Head Trainer không gỡ được khóa.** Chỉ Veterinarian gỡ, ở Flow 4
2. **Nút bị chặn disable + tooltip, không ẩn.** Tooltip phải nói **ai** mới gỡ được
3. **BE chặn độc lập với FE.** Gọi thẳng `POST /training/sessions` bằng Postman với ngựa bị khóa vẫn phải trả `409`
4. Nhiều lock chồng nhau → lấy mức **nghiêm ngặt nhất**: `FULL` thắng `HIGH_INTENSITY_ONLY`

```
GET  /horses/{id}/training-lock
→ { isActive, scope, reason, expectedDays,
    placedBy: { id, fullName, role }, placedAt, reviewRequestPending }
POST /training/plans/{id}/request-lock-review  { reason }
     → 409 REVIEW_ALREADY_PENDING
```

---

## 8. Gỡ khóa & xếp lại lịch

1. Bác sĩ gỡ khóa ở Flow 4 → `isActive = false`.
2. Giáo án `SUSPENDED` → `ACTIVE` trở lại, **chỉ khi không còn lock nào khác** đang hoạt động.
3. Head Trainer thấy **banner xanh `ok`** trên Dashboard và trên giáo án đó:

> *"The training lock on Tuyết Mã was lifted by Lê Minh Châu on 26 Sep 2026. 5 sessions were cancelled during the lock."*

4. Banner có nút **Reschedule sessions** → mở lịch tuần với panel gợi ý danh sách buổi đã bị hủy, mỗi buổi một nút xếp lại.
5. Hoặc bấm **Dismiss** để bỏ qua.

**Ba quy tắc**

- Buổi đã `CANCELLED` **không tự khôi phục**. Xếp lại nghĩa là **tạo buổi mới**; buổi cũ giữ nguyên `CANCELLED` để lịch sử không bị sửa
- Thông báo phải nêu **số buổi đã bị hủy** trong thời gian khóa
- Ngựa có lock thứ hai vẫn hoạt động → giáo án **giữ `SUSPENDED`**, banner vẫn hiện lock còn lại

---

## 9. Quyền — ba ô quyết định exception path 2

| Hành động | Head Trainer | Veterinarian | Club Manager |
|---|---|---|---|
| Lập giáo án, xếp lịch, ghi chỉ số | **toàn quyền** | không | không |
| Acknowledge cảnh báo | **toàn quyền** | đọc | đọc |
| Đề nghị gỡ khóa | **toàn quyền** | — | không |
| **Đặt / gỡ khóa huấn luyện** | **KHÔNG** | **toàn quyền** (Flow 4) | **KHÔNG** |

Ô cuối là toàn bộ ý nghĩa của exception path 2: bác sĩ có quyền chặn huấn luyện viên, và huấn luyện viên không tự tháo được. Club Manager cũng không — đó là quyết định y tế.

Groom chỉ đọc lịch của mình. Horse Owner chỉ đọc lịch và nhận xét của ngựa mình sở hữu, lọc ở **tầng API**.

---

## 10. Xong khi nào

**Main flow**

- [ ] Wizard 4 bước, mỗi bước validate riêng, Back giữ dữ liệu
- [ ] Kích hoạt giáo án sinh **đúng số buổi** theo tần suất × số tuần
- [ ] Lịch tuần mặc định mở đúng tuần chứa **19/09/2026**
- [ ] Phân biệt đúng `PAUSED` và `SUSPENDED`
- [ ] Form ghi chỉ số chặn `Average HR > Peak HR`
- [ ] Peak HR > 200 bpm khi nhập tay **cũng sinh** bản ghi `alerts`

**Exception 1 — phải chạy thật, không chỉ vẽ**

- [ ] Bộ sinh dữ liệu đẩy mẫu mỗi **5 giây**
- [ ] Vượt ngưỡng **dưới 30 giây** → **không** sinh cảnh báo (test cả trường hợp âm)
- [ ] Vượt ngưỡng **≥ 30 giây** → cảnh báo hiện trong **≤ 3 giây**, đo bằng đồng hồ thật
- [ ] Cả 4 trạng thái LiveMonitor dựng được bằng thao tác thật
- [ ] Alert đỏ **không tự tắt** khi HR về bình thường
- [ ] Bấm Acknowledge mà chưa chọn hành động → bị chặn
- [ ] Ngắt kết nối 15 giây → chuyển sang màn nhập tay
- [ ] **F5 giữa buổi tập → biểu đồ vẽ lại đầy đủ, cảnh báo không mất**
- [ ] Không có nút xóa cảnh báo ở bất kỳ đâu

**Exception 2 — phần soi kỹ nhất**

- [ ] Khóa `FULL` → giáo án `SUSPENDED`, mọi buổi tương lai `CANCELLED`
- [ ] Khóa `HIGH_INTENSITY_ONLY` → giáo án **vẫn `ACTIVE`**, chỉ bài nặng bị hủy
- [ ] Màn giáo án bị khóa có **đủ cả bốn**: LockBanner đủ 5 thông tin · bài nặng mờ có icon · nút Schedule **disable + tooltip** · ô đề nghị gỡ khóa
- [ ] **Kiểm lại từng nút bị chặn: DISABLE, không ẩn**
- [ ] Lịch tuần: buổi bị hủy **gạch ngang kèm lý do, vẫn nằm trên lịch**
- [ ] Wizard bước 1 chọn ngựa bị khóa → nút Next disable + LockBanner
- [ ] **Gọi thẳng `POST /training/sessions` bằng Postman với ngựa bị khóa → BE trả `409`**
- [ ] Head Trainer không có bất kỳ đường nào gỡ được khóa
- [ ] Gỡ khóa → giáo án về `ACTIVE`, banner nêu **đúng số buổi đã bị hủy**
- [ ] Xếp lại tạo buổi **mới**, buổi cũ vẫn `CANCELLED`

**Chung**

- [ ] Dùng lại `HorseLink`, `HealthBadge`, `LockBanner`, `WizardStepper`, `DisabledHint`
- [ ] Mỗi màn có mock chạy được
- [ ] `npm run build` không lỗi

---

## 11. Chưa chốt

1. **Toàn bộ endpoint là đề xuất**, chưa có trong `docs/API_CONTRACT.md`.
2. **Enum của Flow 3** (`training_plans.status`, `training_sessions.status`, `workload`, `surface`, `scope`) chưa có trong `schema.prisma` — schema hiện mới tới Priority 1.
3. **Cơ chế realtime**: polling 5 giây hay SSE/WebSocket. Polling đơn giản hơn và đủ đạt mốc ≤ 3 giây; chốt với BE.
4. **Chưa có artboard.** 15 màn chưa vẽ. Hai màn đáng đầu tư nhất khi vẽ: LiveMonitor trạng thái vượt ngưỡng, và màn giáo án bị khóa.
5. **Thời điểm làm màn đặt khóa (Flow 4)**: môn học yêu cầu Workflow 2 có đủ 2 exception path chạy được **trước Milestone 2**. Nếu Flow 4 chưa xong kịp, form đặt khóa phải dời lên làm cùng Flow 3.

---

*Viết 29/09/2026 · quy ước theo `docs/API_CONTRACT.md` và `CLAUDE.md` trong repo `Horse-Training-Club`.*
