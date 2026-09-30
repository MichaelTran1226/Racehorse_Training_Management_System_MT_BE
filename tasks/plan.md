# Kế hoạch triển khai — Flow 1–3

Nguồn: đặc tả `Tai_Lieu` (Flow1_HoSoNgua, Flow2_GiaoAn, Flow3_YTe) · [SRS](../docs/srs.txt) · [Blueprint](../docs/blueprint.md) (ERD, API contract) · [Project 2](https://github.com/users/MichaelTran1226/projects/2)

## 1. Phạm vi

- **Làm:** Auth & phân quyền, Flow 1 Hồ sơ & định danh ngựa (gồm sơ đồ chuồng), Flow 3 Y tế & chấn thương, Flow 2 Giáo án huấn luyện. Website desktop.
- **Để sau:** Flow 4 Chuồng trại & dinh dưỡng, Flow 5 Thi đấu & tài chính, Flow 6 AI.

## 2. Đội hình

| Cặp | Frontend (`MT_FE`) | Backend (`MT_BE`) | Phạm vi |
|---|---|---|---|
| **Cặp 1** | _FE Cặp 1_ | _BE Cặp 1_ | Auth + Flow 1 Hồ sơ ngựa (gồm sơ đồ chuồng) + Sơ đồ sức khỏe SC-3.01 |
| **Cặp 2** | _FE Cặp 2_ | _BE Cặp 2_ | Flow 3 Y tế & chấn thương + Flow 2 Giáo án huấn luyện |

## 3. Lịch 3 sprint

| Sprint | Thời gian | Cặp 1 | Cặp 2 | Chung |
|---|---|---|---|---|
| Sprint 1 | 28/09 – 04/10/2026 | P1-01 Đăng nhập, JWT & điều hướng 5 vai trò<br>P1-02 Đăng ký Chủ ngựa & xác thực OTP email<br>P1-03 Quên & đặt lại mật khẩu<br>P1-04 Mời nhân sự nội bộ & danh sách nhân sự<br>P1-05 RBAC 5 vai trò, route guard & cách ly dữ liệu Chủ ngựa<br>P1-06 Nhật ký kiểm toán (Audit trail) | P2-01 Hồ sơ y tế ngựa (6 tab), ghi chú quan sát, quyền xem Owner/Groom<br>P2-02 Bệnh án, phác đồ điều trị & kê đơn thuốc | C-01 Nền tảng FE: design tokens, Master layout & routing |
| Sprint 2 | 05/10 – 11/10/2026 | P1-07 Danh sách, tạo/sửa, chi tiết hồ sơ ngựa (6 tab)<br>P1-08 Trạng thái ngựa, nhóm y tế, badge/banner Khóa huấn luyện, lịch sử trạng thái<br>P1-09 Sơ đồ chuồng trại, gán/chuyển/trả ô, danh mục khu & ô chuồng | P2-03 Mô hình chấn thương 2D & tiến trình hồi phục<br>P2-04 Khóa huấn luyện: đặt/gỡ/gia hạn, danh sách & thông báo<br>P2-05 Lịch chăm sóc định kỳ (tiêm phòng, tẩy giun, móng) & danh mục loại | — |
| Sprint 3 | 12/10 – 18/10/2026 | P1-10 Nhân viên chăm sóc, lịch sinh hoạt hằng ngày & lịch mẫu<br>P1-11 Chủ sở hữu, ngừng quản lý/kích hoạt lại, xóa mềm & khôi phục<br>P1-12 Danh mục Giống & Màu lông<br>P1-13 Dòng thời gian vòng đời ngựa<br>P1-14 Sơ đồ sức khỏe đàn ngựa 4 mã màu | P2-06 Giáo án huấn luyện: lập, sửa, kích hoạt, kết thúc, nhân bản<br>P2-07 Chặn bài tập nặng khi có Khóa huấn luyện & khôi phục<br>P2-08 Lịch tập, phân công Groom/nài, điều phối chạy thử<br>P2-09 Kết quả buổi tập, biểu đồ thể lực, tổng quan huấn luyện | C-03 Nghiệm thu toàn trình MVP-QA |

Hai cặp chạy song song từ Sprint 1. Trong Sprint 1, Cặp 2 dùng dữ liệu ngựa giả (mock) cho tới khi `P1-07` có API.

## 4. Điểm nối giữa 2 cặp (cần thống nhất API)

| Cặp cung cấp | Cặp dùng | Nội dung |
|---|---|---|
| Cặp 1 (P1-05) | Cặp 2 | Đăng nhập, vai trò, cách ly dữ liệu Owner — mọi API của Cặp 2 dùng chung guard |
| Cặp 1 (P1-07, P1-09, P1-10) | Cặp 2 | Danh sách ngựa, trạng thái, ô chuồng, nhân viên chăm sóc phụ trách |
| Cặp 2 (P2-04) | Cặp 1 (P1-08, P1-14) | Đặt/gỡ Khóa huấn luyện → đổi trạng thái ngựa, bật/tắt banner, màu trên sơ đồ sức khỏe |
| Cặp 2 (P2-02, P2-06 → P2-09) | Cặp 1 (P1-13) | Sự kiện y tế & huấn luyện cho dòng thời gian ngựa |

## 5. Cách làm việc

Cài đặt, tạo nhánh, chạy kiểm tra và mở PR để qua bot CI: xem [docs/HUONG_DAN_GITHUB.md](../docs/HUONG_DAN_GITHUB.md).

1. Nhận task trên [Project 2](https://github.com/users/MichaelTran1226/projects/2), đọc **đặc tả trong issue** (luồng, việc FE/BE, API, tiêu chí nghiệm thu), chuyển Status sang **In Progress**.
2. FE và BE trong cặp chốt API (endpoint, body, mã lỗi) trước khi code, dựa theo đặc tả trong `Tai_Lieu`.
3. Mỗi người làm trên nhánh riêng trong repo của mình: `feat/<số issue>-<tên-ngắn>`.
4. PR ghi `Refs MichaelTran1226/Racehorse_Training_Management_System_MT_BE#<số issue>`; PR cuối cùng của task (khi cả FE và BE xong) ghi `Closes …#<số issue>`. Cần review trước khi merge.
5. Task **Done** khi cả phần FE và BE đã merge, chạy thật được và đạt đặc tả.

## 6. Ưu tiên

- **P0 Critical:** nền tảng, Auth/RBAC, các task liên quan Khóa huấn luyện (P1-08, P2-04, P2-07).
- **P1 High:** các task chức năng chính còn lại.
- **P3 Low:** task chỉ gồm chức năng [BỔ SUNG] (P1-11, P1-12).
