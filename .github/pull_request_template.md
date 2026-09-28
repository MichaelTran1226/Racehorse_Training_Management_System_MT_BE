## 1. Thông tin định danh & Truy nguyên (Traceability)

- **Target Repository:** `MichaelTran1226/Racehorse_Training_Management_System_MT_BE` (hoặc `FE`)
- **Linked Issue:** closes #<issue-number>
- **Blueprint ID / Work ID:** e.g., `FR-001` / `AUTH-LOGIN`
- **Loại thay đổi:** [ ] Feature [ ] Bugfix [ ] Refactor [ ] Test

---

## 2. Cam kết Tuân thủ Phạm vi & Boundary (Scope & Boundary Compliance)

*Người tạo PR bắt buộc phải tích chọn tất cả các cam kết dưới đây. Bất kỳ sự thiếu trung thực hoặc vi phạm nào sẽ bị Bot/Lead tự động Reject PR:*

- [ ] **Repository Boundary Check:** Tôi xác nhận PR này **CHỈ CHỨA** mã nguồn thuộc trách nhiệm của repo này:
  - Nếu là **Backend repo:** Không có file `.tsx`, `.jsx`, `.vue`, `client/`, `frontend/`, UI styling.
  - Nếu là **Frontend repo:** Không có file `.sqlite`, DB migrations, server controllers/routes.
- [ ] **Zero Scope Creep:** Mọi thay đổi trong PR này **TUÂN THỦ 100%** theo Acceptance Criteria (AC) của Issue/Blueprint đã duyệt. Tôi **KHÔNG TỰ Ý** thêm tính năng, thay đổi luồng nghiệp vụ hoặc bỏ bớt tiêu chí AC đã quy định.
- [ ] **Quy tắc Kiến trúc & Stack:** Tuân thủ đúng công nghệ và quy chuẩn đã được phê duyệt trong Blueprint (không tự ý cài thêm package/thư viện lạ khi chưa được duyệt).

---

## 3. Bằng chứng Kiểm thử & Chất lượng (Quality & Test Evidence)

- [ ] **White-box Tests:** Đã chạy và PASS 100% các bài unit/integration tests (`npm test` hoặc `npm run test:unit`).
- [ ] **Black-box Tests:** Đã chạy và PASS kiểm thử API contract / Playwright E2E.
- [ ] **Lint & Typecheck:** Không có lỗi linter hoặc TypeScript type escape (`any`, `@ts-ignore`).
- [ ] **SonarQube / Code Quality:** Đạt Quality Gate, không có Security Vulnerabilities hoặc Code Smells nghiêm trọng.

---

## 4. Tóm tắt nội dung thay đổi kỹ thuật

<!-- Mô tả ngắn gọn những gì bạn đã thực hiện trong PR này -->

