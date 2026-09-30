# Phân chia task — 2 cặp (mỗi cặp 1 FE + 1 BE) · Flow 1–3

Nguồn: `Tai_Lieu` — `Flow1_HoSoNgua.md`, `Flow2_GiaoAn.md`, `Flow3_YTe.md` (mã `SC-x.xx` = màn hình, `FR-x.xx` = chức năng).
Auth không có trong Tai_Lieu, giữ theo các issue Auth đã có trên GitHub. Flow 4 (Chuồng trại), Flow 5 (Thi đấu), Flow 6 (AI) để sau.

| Cặp | Frontend (`MT_FE`) | Backend (`MT_BE`) | Phạm vi |
|---|---|---|---|
| **Cặp 1** | _FE Cặp 1_ | _BE Cặp 1_ | Auth + Flow 1 Hồ sơ & định danh ngựa (gồm sơ đồ chuồng) + Sơ đồ sức khỏe SC-3.01 |
| **Cặp 2** | _FE Cặp 2_ | _BE Cặp 2_ | Flow 3 Y tế & chấn thương + Flow 2 Giáo án huấn luyện |

Quy ước: mỗi task có 2 phần — **FE** làm màn hình trong repo `MT_FE`, **BE** làm API trong repo `MT_BE`. Hai người trong cùng cặp chốt API (endpoint, body, mã lỗi) trước khi code. Mã `GH-FE-xx` / `GH-BE-xx` là issue cũ trên GitHub mà task đó thay thế hoặc bao gồm.

---

## Việc chung (cả nhóm)

- [ ] `C-01` Nền tảng FE: design tokens, Master layout, routing — `GH-FE-01` (issue #1 còn mở; PR #2 foundation đã merge) — **FE Cặp 1** dựng, FE Cặp 2 review
- [x] `C-02` Nền tảng BE: NestJS + Prisma, CI, health check — `GH-BE-01` (PR #20)
- [ ] `C-03` Nghiệm thu toàn trình MVP-QA — `GH-FE-19` / `GH-BE-19` — Sprint 3, cả 2 cặp

---

## CẶP 1 — Auth + Flow 1: Hồ sơ & định danh ngựa (+ SC-3.01)

### Sprint 1 (28/09 – 04/10/2026) — Auth & phân quyền

- [ ] `P1-01` Đăng nhập, JWT, điều hướng 5 vai trò — AUTH01 — `GH-FE-02` / `GH-BE-02` (BE đã merge PR #21)
- [ ] `P1-02` Đăng ký Chủ ngựa + xác thực OTP email — AUTH02 — `GH-FE-03` / `GH-BE-03`
- [ ] `P1-03` Quên & đặt lại mật khẩu — AUTH03, AUTH04 — `GH-FE-04` / `GH-BE-04`
- [ ] `P1-04` Mời nhân sự nội bộ & danh sách nhân sự — SYS01, SYS02 — `GH-FE-05` / `GH-BE-05`
- [ ] `P1-05` RBAC 5 vai trò, route guard, cách ly dữ liệu Chủ ngựa — `GH-FE-06` / `GH-BE-06`
- [ ] `P1-06` Nhật ký kiểm toán (Audit trail) — `GH-FE-07` / `GH-BE-07`

### Sprint 2 (05/10 – 11/10/2026) — Hồ sơ ngựa & chuồng

- [ ] `P1-07` Danh sách, tạo/sửa, chi tiết hồ sơ ngựa (6 tab) — SC-1.01, SC-1.02, SC-1.03 — FR-1.01…1.04, FR-1.26 — `GH-FE-08` / `GH-BE-08`
- [ ] `P1-08` Trạng thái ngựa, nhóm y tế, badge/banner Khóa huấn luyện, lịch sử trạng thái — FR-1.05, 1.06, 1.07, 1.17
- [ ] `P1-09` Sơ đồ chuồng trại, gán/chuyển/trả ô, danh mục khu & ô chuồng, lịch sử ô chuồng — SC-1.04, SC-1.07 — FR-1.09…1.12, 1.18, 1.24 — `GH-FE-09` / `GH-BE-09`

### Sprint 3 (12/10 – 18/10/2026) — Phần còn lại Flow 1 & sơ đồ sức khỏe

- [ ] `P1-10` Nhân viên chăm sóc chính/phụ, lịch sinh hoạt hằng ngày & lịch mẫu — SC-1.08 — FR-1.13, 1.14, 1.15, 1.25
- [ ] `P1-11` Chủ sở hữu & tỷ lệ, ngừng quản lý/kích hoạt lại, xóa mềm & khôi phục — SC-1.05 — FR-1.08, 1.16, 1.20, 1.21
- [ ] `P1-12` Danh mục Giống & Màu lông — SC-1.06 — FR-1.22, 1.23
- [ ] `P1-13` Dòng thời gian vòng đời ngựa (tổng hợp từ Flow 2, 3) — FR-1.19
- [ ] `P1-14` Sơ đồ sức khỏe đàn ngựa 4 mã màu (thuộc Flow 3, dựa trên sơ đồ chuồng `P1-09`) — SC-3.01 — FR-3.01 — `GH-FE-10` / `GH-BE-10`

---

## CẶP 2 — Flow 3: Y tế & chấn thương + Flow 2: Giáo án huấn luyện

### Sprint 1 (28/09 – 04/10/2026) — Hồ sơ y tế & bệnh án

- [ ] `P2-01` Hồ sơ y tế ngựa (6 tab), ghi chú quan sát, quyền xem Owner/Groom — SC-3.02 — FR-3.02, 3.17, 3.18
- [ ] `P2-02` Bệnh án: danh sách, tạo/sửa, chi tiết, chốt/kết thúc/mở lại, phác đồ, kê đơn — SC-3.03, SC-3.04, SC-3.09 — FR-3.03…3.07, 3.20 — `GH-FE-11` / `GH-BE-11`

### Sprint 2 (05/10 – 11/10/2026) — Chấn thương, Khóa huấn luyện, lịch định kỳ

- [ ] `P2-03` Mô hình chấn thương 2D & tiến trình hồi phục — SC-3.05 — FR-3.08, 3.09 — `GH-FE-12` / `GH-BE-12`
- [ ] `P2-04` Khóa huấn luyện: đặt/gỡ/gia hạn, danh sách & lịch sử, thông báo — SC-3.06 — FR-3.10, 3.11, 3.12, 3.19 — `GH-FE-13` / `GH-BE-13`
- [ ] `P2-05` Lịch chăm sóc định kỳ (tiêm phòng, tẩy giun, móng) & danh mục loại — SC-3.07, SC-3.08 — FR-3.13…3.16 — `GH-FE-18` / `GH-BE-18`

### Sprint 3 (12/10 – 18/10/2026) — Giáo án huấn luyện

- [ ] `P2-06` Giáo án: danh sách, tạo/sửa theo giai đoạn, chi tiết, kích hoạt, hoàn thành/hủy, nhân bản — SC-2.02, SC-2.03, SC-2.04 — FR-2.02…2.05, 2.08, 2.18, 2.19, 2.21 — `GH-FE-14` / `GH-BE-14`
- [ ] `P2-07` Chặn bài tập nặng khi có Khóa huấn luyện, khôi phục sau khi gỡ — FR-2.06, 2.07, 2.17 — `GH-FE-15` / `GH-BE-15`
- [ ] `P2-08` Lịch tập, phân công Groom/nài, điều phối chạy thử, Lịch tập của tôi — SC-2.05, SC-2.08 — FR-2.09…2.12 — `GH-FE-16` / `GH-BE-16`
- [ ] `P2-09` Kết quả buổi tập, biểu đồ thể lực, tổng quan huấn luyện, Owner xem — SC-2.01, SC-2.06, SC-2.07 — FR-2.01, 2.13…2.16, 2.20 — `GH-FE-17` / `GH-BE-17`

---

## Điểm nối giữa 2 cặp (cần thống nhất API)

| Cặp cung cấp | Cặp dùng | Nội dung |
|---|---|---|
| Cặp 1 (`P1-05`) | Cặp 2 | Đăng nhập, vai trò, cách ly dữ liệu Owner — mọi API của Cặp 2 dùng chung guard |
| Cặp 1 (`P1-07`, `P1-09`, `P1-10`) | Cặp 2 | Danh sách ngựa, trạng thái, ô chuồng, nhân viên chăm sóc phụ trách |
| Cặp 2 (`P2-04`) | Cặp 1 (`P1-08`, `P1-14`) | Sự kiện đặt/gỡ Khóa huấn luyện → đổi trạng thái ngựa, bật/tắt banner, màu trên sơ đồ sức khỏe |
| Cặp 2 (`P2-02`, `P2-06`…`P2-09`) | Cặp 1 (`P1-13`) | Sự kiện y tế & huấn luyện cho dòng thời gian ngựa |

Trong Sprint 1, Cặp 2 dùng dữ liệu ngựa giả (mock) cho tới khi `P1-07` có API.
