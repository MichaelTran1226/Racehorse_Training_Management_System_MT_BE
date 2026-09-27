# [GH-BE-03][AUTH-REGISTER] Đăng ký tài khoản Chủ sở hữu ngựa (Horse Owner) & Xác thực OTP qua Email

Work ID: AUTH-REGISTER
Mã tra cứu: GH-BE-03
Blueprint ID: FR-001
Sprint: Sprint 1
Thời gian kế hoạch: 01/10/2026 – 03/10/2026
Lead theo workbook: Backend Dev + Frontend Dev
Vị trí phân công theo workbook: Fullstack Dev 2 (chưa phải username GitHub)
Branch: `feat/3-auth-register-otp`

## Nội dung task gốc

Đăng ký tài khoản Chủ sở hữu ngựa (Horse Owner) & Xác thực OTP qua Email: Gửi mã xác minh 6 số, giới hạn thời gian hết hạn OTP, kích hoạt tài khoản chính chủ

Nguồn: [kế hoạch 3 sprint](../EquiFlow_Sprint_Plan_3_Weeks.xlsx). Chỉ website desktop Flow 1–3; không mobile, phả hệ, video hoặc flow optional.

## Giao diện

[Stitch chuẩn theo task](https://stitch.withgoogle.com/projects/1737930245422720673) · [Danh mục tên thống nhất](../../GENERATE/ui-design/stitch-v2/SCREEN-MAP-CORE.md)

Screen IDs: AUTH02, AUTH03, AUTH04. Bộ có 31 màn chính và 5 biến thể thao tác/quyền của cùng task; không thêm flow. Tên Canvas dùng cùng mã tra cứu, Work ID và tên task ở trên.

## Acceptance criteria theo task

- [ ] Đăng ký chỉ gán role Horse Owner
- [ ] OTP 6 số hết hạn sau 15p
- [ ] Giới hạn gửi lại mã (Rate limit)
- [ ] Xác thực xong kích hoạt tài khoản

## Checklist thực hiện

- [ ] Chốt API/DTO, validation, quyền, trạng thái lỗi và các quyết định còn mở.
- [ ] FE: layout, routing, form, state và tích hợp API theo screen ID; desktop 1280/1440/1920px.
- [ ] BE: API/service, migration, quyền và audit phù hợp task; không chỉ vô hiệu hóa nút UI.
- [ ] QA: kiểm tra dương/âm, RBAC, owner isolation và concurrency phù hợp AC.
- [ ] PR liên kết issue chính; review, merge, build/test thật và tài liệu/rollback trước Done.

## Dependency

- [AUTH-LOGIN](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/2)

## Giới hạn và quyết định

Stack trong FOUNDATION vẫn là lựa chọn cần chốt, không tự chọn framework. OTP 15 phút, lời mời 48 giờ và cửa sổ cảnh báo y tế 7 ngày theo workbook hiện tại; thay thế đề xuất UI cũ. Mọi lệnh mở Medical Lock chỉ do Vet; không tự mở theo ngày dự kiến. Màn mockup không chứng minh API hoặc kiểm thử nghiệp vụ đã hoàn thành.

Status triển khai: Todo. Chưa có implementation/test evidence; không gán username giả.
