# [GH-FE-01][UI-V2] Duyệt bộ giao diện Stitch V2, xây dựng Design System tokens (màu Forest Green #315D4B, font Manrope), Master layout (Sidebar 224px, Header 64px, Content 1440px) và routing cơ bản trên Frontend

Work ID: UI-V2
Mã tra cứu: GH-FE-01
Blueprint ID: FR-022
Sprint: Sprint 1
Thời gian kế hoạch: 28/09/2026 – 30/09/2026
Lead theo workbook: Lead + Frontend Dev
Vị trí phân công theo workbook: Frontend Dev 1 (chưa phải username GitHub)
Branch: `feat/1-ui-v2-design-system`

## Nội dung task gốc

Duyệt bộ giao diện Stitch V2, xây dựng Design System tokens (màu Forest Green #315D4B, font Manrope), Master layout (Sidebar 224px, Header 64px, Content 1440px) và routing cơ bản trên Frontend

Nguồn: [kế hoạch 3 sprint](../EquiFlow_Sprint_Plan_3_Weeks.xlsx). Chỉ website desktop Flow 1–3; không mobile, phả hệ, video hoặc flow optional.

## Giao diện

[Stitch chuẩn theo task](https://stitch.withgoogle.com/projects/1737930245422720673) · [Danh mục tên thống nhất](../../GENERATE/ui-design/stitch-v2/SCREEN-MAP-CORE.md)

Screen IDs: AUTH01, AUTH02, AUTH03, AUTH04, AUTH05, AUTH06, AUTH07, AUTH08, SYS01, SYS02, H01, H02, H03, H04, T01, T02, T03, T04, T05, V01, V02, V03, V04, V05, V06, O01, O02, M01, M02, M03, M04, T03-CREATE, V02-RX, V06-CREATE, H04-GROOM, H03-OWNER. Bộ có 31 màn chính và 5 biến thể thao tác/quyền của cùng task; không thêm flow. Tên Canvas dùng cùng mã tra cứu, Work ID và tên task ở trên.

## Acceptance criteria theo task

- [ ] Duyệt 31 màn hình Stitch
- [ ] Khởi tạo project FE chạy mượt 1280/1440/1920px
- [ ] Setup Router, Theme, Button, Modal, Table chuẩn

## Checklist thực hiện

- [ ] Chốt API/DTO, validation, quyền, trạng thái lỗi và các quyết định còn mở.
- [ ] FE: layout, routing, form, state và tích hợp API theo screen ID; desktop 1280/1440/1920px.
- [ ] BE: API/service, migration, quyền và audit phù hợp task; không chỉ vô hiệu hóa nút UI.
- [ ] QA: kiểm tra dương/âm, RBAC, owner isolation và concurrency phù hợp AC.
- [ ] PR liên kết issue chính; review, merge, build/test thật và tài liệu/rollback trước Done.

## Dependency

- Không có dependency công việc; cần review và phân công.

## Giới hạn và quyết định

Stack trong FOUNDATION vẫn là lựa chọn cần chốt, không tự chọn framework. OTP 15 phút, lời mời 48 giờ và cửa sổ cảnh báo y tế 7 ngày theo workbook hiện tại; thay thế đề xuất UI cũ. Mọi lệnh mở Medical Lock chỉ do Vet; không tự mở theo ngày dự kiến. Màn mockup không chứng minh API hoặc kiểm thử nghiệp vụ đã hoàn thành.

Status triển khai: Todo. Chưa có implementation/test evidence; không gán username giả.
