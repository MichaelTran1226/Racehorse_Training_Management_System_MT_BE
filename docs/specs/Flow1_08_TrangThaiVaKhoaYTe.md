# Đặc tả Nghiệp vụ: P1-08 (Trạng thái và Khóa y tế)

## 1. Discover

- **Bài toán:** Quản lý vòng đời trạng thái của ngựa (`HorseStatus`) và cơ chế "Khóa y tế" (Medical Lock / Khóa huấn luyện) khẩn cấp để bảo vệ sức khỏe ngựa.
- **Mục tiêu:** 
  - Đảm bảo ngựa ở trạng thái chấn thương/bệnh lý sẽ tự động bị chặn mọi hoạt động huấn luyện nặng, đăng ký thi đấu.
  - Cung cấp tính năng gỡ khóa chỉ dành cho Bác sĩ thú y (VET).
- **Phạm vi In/Out scope:** 
  - In scope: Thay đổi trạng thái, tạo/gỡ khóa y tế, ghi nhận lịch sử (audit/history).
  - Out scope: Các module gợi ý AI, hoặc tự động phân ca.
- **Vai trò:**
  - `CLUB_MANAGER`: Xem tổng quan trạng thái, không được can thiệp vào chuyên môn y tế.
  - `HEAD_TRAINER`: Có thể đổi trạng thái huấn luyện nhưng bị hạn chế nếu ngựa đang bị khóa y tế. Không thể gỡ khóa y tế.
  - `VETERINARIAN`: Người duy nhất có quyền đặt/gỡ khóa y tế.
  - `HORSE_OWNER`: Chỉ xem trạng thái ngựa của mình, không thấy thông tin rủi ro/khóa nội bộ.
  - `GROOM`: Xem trạng thái để thực hiện việc chăm sóc.
- **Giả định & Câu hỏi mở:**
  - `Q-1`: Medical Lock có tự động hết hạn không? (Giả định: Không tự động hết hạn, cần VET mở khóa tay dựa trên `recheckDate`).

## 2. Define

### 2.1. Phân quyền & Màn hình
- `SC-1.08.1` - Danh sách trạng thái ngựa (VET, HT, CM).
- `DL-1.08.1` - Dialog Đặt Khóa Y tế (VET).
- `DL-1.08.2` - Dialog Gỡ Khóa Y tế (VET).
- `FR-1.08.1` - Cập nhật trạng thái ngựa.
- `FR-1.08.2` - Khóa/Gỡ khóa y tế.

### 2.2. Vòng đời Trạng thái (HorseStatus)
- **ACTIVE, IN_TRAINING, UNDER_OBSERVATION, INJURED, ISOLATED, RESTING, RETIRED**
- Chuyển trạng thái:
  - Bất kỳ trạng thái -> `INJURED` (Khi VET đặt Medical Lock).
  - `INJURED` -> Trạng thái khác (Khi VET gỡ khóa).

### 2.3. User Stories & Acceptance Criteria (Gherkin)

**US-1: Đặt khóa y tế**
```gherkin
Given tôi là Bác sĩ thú y (VET)
When tôi chọn một con ngựa và áp dụng lệnh "Khóa y tế"
Then hệ thống chuyển isMedicalLocked = true
And trạng thái ngựa chuyển sang INJURED hoặc ISOLATED
And hệ thống chặn mọi nỗ lực xếp lịch tập nặng hoặc đăng ký giải đua cho con ngựa này.
```

**US-2: Gỡ khóa y tế**
```gherkin
Given tôi là Bác sĩ thú y (VET)
When tôi chọn gỡ "Khóa y tế" và nhập lý do
Then hệ thống chuyển isMedicalLocked = false
And cho phép cập nhật lại trạng thái thông thường.
```

### 2.4. Data Model (Prisma)
- **Horse:** `status` (HorseStatus), `isMedicalLocked` (Boolean, default: false).
- **MedicalLock:** bảng lưu lịch sử và chi tiết các lần khóa y tế.
  - Bắt buộc phải có `lockReason`, `lockedAt`, `veterinarianUserId`.
  - Khi gỡ khóa, cập nhật `unlockedAt`, `unlockVetUserId`, `unlockReason`, `isLocked = false`.

### 2.5. API Contract
- **POST /api/v1/medical-locks** (Chỉ VET)
  - Thêm khóa y tế cho ngựa.
  - Body: `{ horseId, expectedRestDays, appliedMedicalStatus, lockReason }`
  - Response: `{ statusCode: 201, success: true, data: { ...MedicalLock } }`
  - Errors: 
    - `HORSE_NOT_FOUND`: Ngựa không tồn tại.
    - `ALREADY_LOCKED`: Ngựa đang bị khóa y tế rồi.
- **PATCH /api/v1/medical-locks/:id/unlock** (Chỉ VET)
  - Gỡ khóa.
  - Body: `{ unlockReason }`
  - Response: `{ statusCode: 200, success: true, data: { ...MedicalLock } }`
  - Errors:
    - `LOCK_NOT_FOUND`: Lệnh khóa không tồn tại.
    - `ALREADY_UNLOCKED`: Lệnh khóa đã được gỡ.

### 2.6. Non-functional Requirements (NFR)
- Audit log đầy đủ cho mọi thay đổi trạng thái và khóa y tế (lưu vào bảng `AuditLog`).
- API response < 300ms.

## 3. Plan & Blueprint
- **Blueprint ID:** BP-P1-08.
- Các API và màn hình đã phủ đủ User Stories.

## 4. Prepare GitHub Sync
| Title | Priority | Type | Area | Owner | Iteration | Blueprint ID |
|---|---|---|---|---|---|---|
| BE: API Đặt/Gỡ Khóa Y Tế | P0 | Feature | Backend | Cặp 2 (BE) | Sprint 2 | BP-P1-08 |
| FE: UI/UX Khóa Y tế (Badge, Dialog) | P0 | Feature | Frontend | Cặp 2 (FE) | Sprint 2 | BP-P1-08 |
| BE: Cập nhật Trạng thái ngựa & Chặn logic | P0 | Feature | Backend | Cặp 1 (BE) | Sprint 2 | BP-P1-08 |

## 5. Verify & Quality Gate
- [x] Đã liệt kê mã lỗi và quyền rõ ràng (VET ưu tiên cao nhất).
- [x] Traceability: Req (Khóa huấn luyện khẩn cấp) -> API (POST /medical-locks) -> DB (MedicalLock).
