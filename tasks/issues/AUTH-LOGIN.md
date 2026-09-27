# [GH-BE-02][AUTH-LOGIN] Xác thực Đăng nhập & Quản lý Session/JWT

Work ID: AUTH-LOGIN
Mã tra cứu: GH-BE-02
Blueprint ID: FR-001
Sprint: Sprint 1
Thời gian kế hoạch: 01/10/2026 – 02/10/2026
Lead theo workbook: Backend Dev + Frontend Dev
Vị trí phân công theo workbook: Fullstack Dev 1 (chưa phải username GitHub)
Branch: `feat/2-auth-login-session`

## Nội dung task gốc

Xác thực Đăng nhập & Quản lý Session/JWT: Mã hóa mật khẩu an toàn, sinh JWT access/refresh token, xử lý đăng xuất, lưu phiên đăng nhập và điều hướng chính xác theo 5 vai trò người dùng

Nguồn: [kế hoạch 3 sprint](../EquiFlow_Sprint_Plan_3_Weeks.xlsx). Chỉ website desktop Flow 1–3; không mobile, phả hệ, video hoặc flow optional.

## Giao diện

[Stitch chuẩn theo task](https://stitch.withgoogle.com/projects/1737930245422720673) · [Danh mục tên thống nhất](../../GENERATE/ui-design/stitch-v2/SCREEN-MAP-CORE.md)

Screen IDs: AUTH01, SYS01, SYS02. Bộ có 31 màn chính và 5 biến thể thao tác/quyền của cùng task; không thêm flow. Tên Canvas dùng cùng mã tra cứu, Work ID và tên task ở trên.

## Acceptance criteria theo task

- [ ] Đăng nhập thành công trả về JWT & Role
- [ ] 5 vai trò vào đúng Dashboard riêng
- [ ] Sai mật khẩu báo lỗi
- [ ] Đăng xuất hủy token

## Checklist thực hiện

- [ ] Chốt API/DTO, validation, quyền, trạng thái lỗi và các quyết định còn mở.
- [ ] FE: layout, routing, form, state và tích hợp API theo screen ID; desktop 1280/1440/1920px.
- [ ] BE: API/service, migration, quyền và audit phù hợp task; không chỉ vô hiệu hóa nút UI.
- [ ] QA: kiểm tra dương/âm, RBAC, owner isolation và concurrency phù hợp AC.
- [ ] PR liên kết issue chính; review, merge, build/test thật và tài liệu/rollback trước Done.

## Dependency

- [FOUNDATION](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/1)
- [UI-V2](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_FE/issues/1)

## Giới hạn và quyết định

Stack trong FOUNDATION vẫn là lựa chọn cần chốt, không tự chọn framework. OTP 15 phút, lời mời 48 giờ và cửa sổ cảnh báo y tế 7 ngày theo workbook hiện tại; thay thế đề xuất UI cũ. Mọi lệnh mở Medical Lock chỉ do Vet; không tự mở theo ngày dự kiến. Màn mockup không chứng minh API hoặc kiểm thử nghiệp vụ đã hoàn thành.

Status triển khai: Todo. Chưa có implementation/test evidence; không gán username giả.
