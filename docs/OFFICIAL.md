# OFFICIAL PROJECT STATUS & HANDOFF FOR AI AGENTS
> **Vị trí lưu:** `E:\01_Academic_FPT\Courses\Se_5_Active\SWP391\MINH_Racehorse_Branch\OFFICIAL.md`
> **Mục tiêu:** Cung cấp bức tranh toàn cảnh (Overview) về tiến độ hiện tại, tech stack, và tài liệu để AI Agent tiếp theo có thể dễ dàng nạp context và lên kế hoạch (plan) cho các Flow 4, 5, và 6.

---

## 1. Tổng quan Kiến trúc & Tech Stack (Đã chốt tại `main.md`)
- **Backend (BE):** `Racehorse_Training_Management_System_MT_BE`
  - Stack: Node.js LTS, NestJS ^11.x, TypeScript strict, Prisma ORM 6.x, PostgreSQL.
  - Cổng (Port): 3000 (Prefix `/api`).
  - Xác thực (Auth): JWT Stateless (Access 15p RAM, Refresh 7 ngày HttpOnly Cookie). 8 trạng thái User.
- **Frontend (FE):** `Racehorse_Training_Management_System_MT_FE`
  - Stack: React 19.2, Vite 8.3, TypeScript ~6.0.
  - Cổng (Port): 5173. 
  - CSS: Pure CSS + CSS Modules (Không dùng Tailwind).
- **Quy tắc chung:** Mọi xung đột kiến trúc cũ (như Express session vs NestJS JWT) đã được giải quyết tại `main.md`. AI cần bám sát các thiết lập này.

---

## 2. Tiến độ Dự án (Project Progress)
Hệ thống được chia làm 6 Flows lớn (tài liệu nằm trong thư mục `Tai_Lieu/`). Dựa trên nhánh Git và lịch sử commit của FE và BE, tiến độ như sau:

| Flow / Module | Tài liệu tham chiếu | Trạng thái hiện tại | Ghi chú |
|---|---|---|---|
| **Flow 1: Hồ sơ ngựa & Auth** | `Flow1_HoSoNgua.md` | 🟢 **Hoàn thành** | Đã merge các nhánh `feat/1-foundation`, `feat/31-fe-foundation-auth`, `feat/38-ho-so-ngua` vào `main`. |
| **Flow 2: Giáo án (Training)** | `Flow2_GiaoAn.md` | ⚪ **Chưa bắt đầu** | Chưa thấy nhánh/chức năng nào được merge hoặc đang xử lý. |
| **Flow 3: Y tế (Medical)** | `Flow3_YTe.md` | 🟡 **Đang hoàn thiện (Sắp xong)** | Các PR liên quan (46, 47, 48, 49, 50) gồm Bệnh án, Khóa huấn luyện (Training Lock), Lịch chăm sóc đã lên code. FE đang dùng một số mock data chờ BE hoàn tất tích hợp API. |
| **Flow 4: Chuồng trại (Stables)**| `Flow4_ChuongTrai.md` | ⚪ **Chưa bắt đầu** | Nằm trong kế hoạch tiếp theo. |
| **Flow 5: Thi đấu (Racing)** | `Flow5_ThiDau.md` | ⚪ **Chưa bắt đầu** | Nằm trong kế hoạch tiếp theo. |
| **Flow 6: AI Architecture** | `Flow6_AI.md`, `Flow6_AI_Architecture_Blueprint.md` | ⚪ **Chưa bắt đầu (Đã có Docs)** | Đã lên kiến trúc, Schema Prisma (AIInsight), nhưng chưa implement code. |

---

## 3. Chỉ dẫn cho AI Agent tiếp theo (Lên kế hoạch Flow 4, 5, 6)

Chào AI Agent, khi bạn đọc file này để lập kế hoạch cho **Flow 4, 5, và 6**, hãy tuân thủ các bước sau:

1. **Nạp Ngữ Cảnh Nhanh (Context Projection):**
   - Đọc trước file `Tai_Lieu/AI_PROJECT_CONTEXT_INDEX.md`. Đây là danh mục siêu dữ liệu (Metadata Catalog) chứa các quy tắc bất biến (Invariants) như `RULE-MED-01` (Khóa y tế tuyệt đối), `RULE-RBAC-01` (Phân quyền). Phải đảm bảo Flow 4, 5, 6 không vi phạm các luật này.
   - **Với Flow 4 (Chuồng trại):** Đọc kỹ `Tai_Lieu/Flow4_ChuongTrai.md` để lấy nghiệp vụ quản lý dinh dưỡng, dọn chuồng, checklist.
   - **Với Flow 5 (Thi đấu):** Đọc kỹ `Tai_Lieu/Flow5_ThiDau.md` để lấy nghiệp vụ đăng ký đua, đánh giá thành tích.
   - **Với Flow 6 (AI):** Đọc kỹ `Flow6_AI.md` và `Flow6_AI_Architecture_Blueprint.md`. Chú ý `AIInsight` schema trong `prisma/schema.prisma`.

2. **Chiến lược Triển khai (Implementation Strategy):**
   - Luôn dựng Entity / Prisma schema bên BE trước.
   - Sinh các NestJS Modules, Services, Controllers (tuân thủ RESTful, Prefix `/api`).
   - Sang FE dựng Router, Pages, và Call API bằng file `api.ts` tương ứng của feature.
   - Thiết kế giao diện bằng CSS Modules (tham khảo các pages đã làm trong `src/features/health`).
   - Đảm bảo tính Authorization (JWT) bằng các role-based guards.

3. **Lưu ý Cấp thiết:** 
   - Hiện tại FE và BE đang tồn đọng một số tech-debt nhỏ tại Flow 3 (FE dư linter warnings, BE thiếu một số endpoint cho Medical). Hãy nhắc Developer/Team dọn dẹp (xem `handoff_PR46.md`) trước khi bung sức làm quá sâu vào Flow 4, 5, 6 để tránh conflict chồng chéo.

## 4. Quy trình Cập nhật Kế hoạch (Plan, Todo, Docs & Sheets)

Để đảm bảo luồng công việc giữa các lập trình viên và AI Agent được xuyên suốt, bắt buộc tuân thủ quy trình sau khi tạo mới hoặc cập nhật các Task, Todo, Plan hay Docs:

1. **Tạo và Cập nhật Sheet Kế hoạch (Plan/Todo):**
   - **Định dạng:** Sử dụng Markdown Table (`.md`) hoặc CSV cho các file `TODO.md` / `PLAN.md` đặt ngay tại thư mục gốc hoặc `docs/`.
   - **Cấu trúc cột chuẩn:** `[ID] | [Task Name] | [Assignee (AI/Người)] | [Trạng thái: ToDo/In-Progress/Done] | [PR Link] | [Notes]`.
   - Mỗi khi một AI Agent hoặc Lập trình viên nhận task, phải đổi trạng thái thành `In-Progress`. Khi code xong, cập nhật thành `Done` và điền PR Link.

2. **Cập nhật Tài liệu (`docs/`):**
   - Mọi thay đổi về Database Schema (Prisma), API Contract, hay luồng nghiệp vụ (Flow) đều phải được cập nhật ngay lập tức vào thư mục `docs/`.
   - Nếu thay đổi chung cho cả dự án, ghi nhận tại `Tai_Lieu/` hoặc `main.md` ở root workspace.
   - Nếu thay đổi đặc thù cho FE hoặc BE, ghi nhận vào `docs/` của repo tương ứng.
   - Bắt buộc cập nhật **Bảng băm (Hash Registry)** trong `AI_PROJECT_CONTEXT_INDEX.md` nếu có chỉnh sửa nội dung tài liệu gốc để AI sau có thể nhận diện sự thay đổi.

3. **Đồng bộ File OFFICIAL.md:**
   - File `OFFICIAL.md` này là kim chỉ nam của toàn dự án. Nó được duy trì ở thư mục gốc (Workspace Root) và được **tự động copy (import)** vào thư mục `docs/` của cả hai repo `FE` và `BE`. 
   - Lệnh copy đồng bộ (Có thể cấu hình chạy tự động trong pre-commit hook hoặc gõ tay):
     ```bash
     cp OFFICIAL.md Racehorse_Training_Management_System_MT_FE/docs/OFFICIAL.md
     cp OFFICIAL.md Racehorse_Training_Management_System_MT_BE/docs/OFFICIAL.md
     ```
   - Điều này giúp lập trình viên khi mở riêng repo FE hay BE bằng VSCode vẫn đọc được tổng quan tiến độ của cả dự án mà không cần mở thư mục cha.
