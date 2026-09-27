# Kế hoạch website EquiFlow — Flow 1, 2, 3

Nguồn chuẩn: [EquiFlow_Sprint_Plan_3_Weeks.xlsx](EquiFlow_Sprint_Plan_3_Weeks.xlsx), 20 task. Tên/mã task bên dưới được lấy từ workbook; chi tiết kỹ thuật giữ trong từng issue. Chỉ website desktop, không mobile. Không flow optional, cây phả hệ hoặc video.

[Project nhóm](https://github.com/users/MichaelTran1226/projects/2) · [Stitch theo task](https://stitch.withgoogle.com/projects/1737930245422720673) · [Danh mục màn hình](ui/SCREEN-MAP.md) · [Quy chuẩn thiết kế](ui/DESIGN.md)

## Lịch ba sprint

| Sprint | Thời gian | Task | Đầu ra |
|---|---|---|---|
| Sprint 1 | 28/09–04/10/2026 | 9 | Nền tảng, UI, auth/RBAC, audit, hồ sơ ngựa |
| Sprint 2 | 05/10–11/10/2026 | 6 | Ô chuồng và Flow 3 y tế/ảnh 2D/Medical Lock |
| Sprint 3 | 12/10–18/10/2026 | 5 | Flow 2 huấn luyện và nghiệm thu xuyên suốt |

Lịch này là kế hoạch trong workbook, không phải bằng chứng đã hoàn tất hay đảm bảo tiến độ. Các vị trí Frontend Dev/Backend Dev/Fullstack Dev/QA chưa được suy thành username GitHub.

## 20 đầu việc

| Mã tra cứu | Work ID | Tên task thống nhất | Sprint | Phụ thuộc |
|---|---|---|---|---|
| GH-FE-01 | UI-V2 | [Duyệt bộ giao diện Stitch V2, xây dựng Design System tokens (màu Forest Green #315D4B, font Manrope), Master layout (Sidebar 224px, Header 64px, Content 1440px) và routing cơ bản trên Frontend](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_FE/issues/1) | Sprint 1 | — |
| GH-BE-01 | FOUNDATION | [Khởi tạo Backend, chốt Stack kỹ thuật (Node/NestJS hoặc Express/TS + SQLite/Postgres ORM), thiết kế Database Schema ban đầu, cấu hình Migration, Docker setup, CI pipeline và Health check endpoint](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/1) | Sprint 1 | — |
| GH-BE-02 | AUTH-LOGIN | [Xác thực Đăng nhập & Quản lý Session/JWT](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/2) | Sprint 1 | FOUNDATION, UI-V2 |
| GH-BE-03 | AUTH-REGISTER | [Đăng ký tài khoản Chủ sở hữu ngựa (Horse Owner) & Xác thực OTP qua Email](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/3) | Sprint 1 | AUTH-LOGIN |
| GH-BE-04 | AUTH-RESET | [Quy trình Quên mật khẩu & Đặt lại mật khẩu an toàn](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/4) | Sprint 1 | AUTH-LOGIN |
| GH-BE-05 | AUTH-STAFF | [Mời nhân sự nội bộ (Manager, Trainer, Vet, Groom) & Quản lý danh sách nhân sự](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/5) | Sprint 1 | AUTH-LOGIN, FR-021 |
| GH-BE-06 | AUTH-SCOPE | [Phân quyền RBAC 5 vai trò & Cách ly dữ liệu Chủ ngựa](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/6) | Sprint 1 | AUTH-LOGIN |
| GH-BE-07 | FR-021 | [Hệ thống Nhật ký kiểm toán bất biến (Audit Trail Logging)](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/7) | Sprint 1 | AUTH-LOGIN |
| GH-BE-08 | FR-002 | [Quản lý Hồ sơ & Định danh ngựa (Microchip RFID)](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/8) | Sprint 1 | AUTH-SCOPE, FR-021 |
| GH-BE-09 | FR-003 | [Sơ đồ phân bổ ô chuồng trại (Stall Allocation)](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/9) | Sprint 2 | FR-002 |
| GH-BE-10 | FR-008 | [Bảng theo dõi trạng thái sức khỏe đàn ngựa theo mã màu (Health Status Board)](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/10) | Sprint 2 | FR-002 |
| GH-BE-11 | FR-009 | [Bệnh án điện tử, chẩn đoán, phác đồ điều trị & Kê đơn thuốc](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/11) | Sprint 2 | FR-008, FR-021 |
| GH-BE-12 | FR-010 | [Bản đồ chấn thương 2D trên mô hình hệ xương giải phẫu (2D Skeletal Injury Mapper)](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/12) | Sprint 2 | FR-009, UI-V2 |
| GH-BE-13 | FR-011 | [Quy trình Ban hành Lệnh Khóa huấn luyện khẩn cấp (Medical Lock) & Tái khám mở khóa](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/13) | Sprint 2 | FR-009, FR-021 |
| GH-BE-18 | FR-012 | [Quản lý Lịch trình y tế dự phòng (Tiêm phòng vaccine, tẩy giun, kiểm tra móng Farrier)](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/18) | Sprint 2 | FR-009 |
| GH-BE-14 | FR-004 | [Lập kế hoạch giáo án huấn luyện chi tiết theo từng giai đoạn](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/14) | Sprint 3 | FR-002, FR-011 |
| GH-BE-15 | FR-005 | [Thực thi cơ chế Chặn xếp lịch tự động bởi Lệnh 'Khóa huấn luyện' (Medical Lock Enforcement)](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/15) | Sprint 3 | FR-011, FR-004 |
| GH-BE-16 | FR-006 | [Phân công lịch tập luyện hàng ngày & Điều phối lượt chạy thử (Time Trial)](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/16) | Sprint 3 | FR-004, FR-005, FR-003 |
| GH-BE-17 | FR-007 | [Ghi nhận kết quả buổi tập, đánh giá phong độ & Cập nhật biểu đồ thể lực](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/17) | Sprint 3 | FR-006 |
| GH-BE-19 | MVP-QA | [Nghiệm thu toàn trình liên luồng MVP-QA (End-to-End Integration Testing)](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/19) | Sprint 3 | FR-003, FR-005, FR-007, FR-010, FR-012 |

## Thực hiện từng phần

1. Nhận FOUNDATION và UI-V2 trước; chốt stack/DB/runtime/contract. FE và BE làm song song theo contract đã thống nhất.
2. Hoàn tất auth/session, audit và owner isolation trước API hồ sơ/chuồng.
3. Triển khai y tế và Medical Lock trước enforcement của huấn luyện. Chỉ Vet khóa/mở; Manager không duyệt thay.
4. Tạo branch theo workbook; PR liên kết URL issue đầy đủ khi đi qua FE/BE. Không đóng primary issue trước khi các PR liên quan hoàn tất.
5. QA kiểm tra luồng đăng ký → hồ sơ → chấn thương 2D → khóa → lịch bị chặn → tái khám/mở → xếp lịch mới. Không mở optional trong đợt này.

## Thiết kế bàn giao

31 màn chính theo workbook + 5 biến thể của task hiện có: T03-CREATE (tạo lịch), V02-RX (thêm thuốc), V06-CREATE (lập lịch dự phòng), H04-GROOM (đọc phân công), H03-OWNER (đọc hồ sơ sở hữu). Không tạo task hay flow mới. T04 bổ sung ô nhập chỉ số thay cho telemetry ngoài phạm vi. Mỗi tên Canvas được ghi nguyên văn trong SCREEN-MAP.md và task-screen-map.json.

## Quyết định và nghiệm thu

- Theo task: OTP 6 số/15 phút; lời mời 48 giờ; lịch dự phòng hiển thị cửa sổ sắp đến hạn 7 ngày. SRS trước đó nhắc trước 3 ngày: giữ mốc nhắc gửi 3 ngày nếu chưa có quyết định thay đổi, tách khỏi bộ lọc 7 ngày của UI.
- Stack, cơ chế cấp Manager đầu tiên, provider email và thời hạn refresh token cần chốt trong FOUNDATION; workbook đưa lựa chọn, chưa chốt framework.
- Ảnh giải phẫu đúng nguồn 900×600; marker theo tọa độ chuẩn hóa; một góc hệ xương, không 3D.
- Ready: AC rõ, contract và dependency được giải quyết, có assignee thật. Todo không đồng nghĩa Ready.
- Done: AC đạt, API/RBAC/concurrency và UI desktop kiểm tra thật; PR review/merge; build/test và rollback có evidence. Thiết kế Stitch không phải ứng dụng đã triển khai.
