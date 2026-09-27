# Kế hoạch triển khai website EquiFlow — Flow 1, 2, 3

Ngày 27/09/2026. Phạm vi đã chốt: **website desktop, không mobile**. Flow 4–6 (chăm sóc mở rộng, tồn kho, giải đua, tài chính, AI) **tạm hoãn**. Không cây phả hệ, không video.

[Project của nhóm](https://github.com/users/MichaelTran1226/projects/2) · [Thiết kế Stitch](https://stitch.withgoogle.com/projects/381590170997471617) · [Danh mục giao diện](ui/SCREEN-MAP.md) · [Quy chuẩn thiết kế](ui/DESIGN.md) · [Quyết định còn mở](ui/DECISIONS.md)

## Bắt đầu làm từ đâu

1. Nhóm nhận [FOUNDATION](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/1) để chốt stack/DB/runtime và contract. Song song review [UI-V2](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_FE/issues/1). Không coi demo React/Vite là quyết định chọn stack.
2. Chia người FE, BE, QA, review; gán assignee thật trên từng issue. Chọn iteration/ngày theo sức làm thực tế. Hiện chưa tự gán thành viên hoặc deadline.
3. Làm auth/session và audit; sau đó hồ sơ/ô chuồng.
4. Làm y tế/Medical Lock trước phần enforcement của huấn luyện; FE có thể làm layout giáo án/lịch bằng contract đã thống nhất.
5. Nghiệm thu xuyên suốt trước khi mở lại optional.

## Milestone và đầu ra

| Mốc | Nội dung | Điều kiện hoàn thành |
|---|---|---|
| M0 | UI, stack, auth/RBAC, audit | Năm vai trò vào đúng phạm vi; đăng ký/xác minh/reset/mời nhân sự; không tự nâng quyền |
| M1 — Flow 1 | Hồ sơ ngựa, chip, ô chuồng, chủ sở hữu | Chip duy nhất; hai request không chiếm cùng ô; Owner không đọc ngựa người khác |
| M2a — Flow 3 | Bảng sức khỏe, bệnh án, ảnh 2D, khóa/mở khóa, dự phòng | Đúng ảnh gốc; marker lưu đúng; chỉ Vet khóa/mở và có audit |
| M2b — Flow 2 | Giáo án, lịch/phân công, kết quả, nhật ký Owner | Medical Lock chặn ở API/transaction; không tự khôi phục buổi đã đình chỉ |
| MVP-QA | Kiểm thử liên luồng | Đăng ký → hồ sơ → chấn thương → khóa → lịch bị chặn → khám lại/mở → xếp lịch mới |

Thứ tự xây Flow 3 trước enforcement Flow 2 là dependency kỹ thuật, không đổi số flow nghiệp vụ.

## 20 đầu việc đã tạo trên GitHub

Mỗi issue là một slice phối hợp FE/BE/QA, không phải BE làm xong toàn bộ rồi FE mới bắt đầu. Issue UI nằm repo FE; các slice nghiệp vụ có primary issue ở BE và liên kết PR của cả hai repo.

| Work ID | Mốc | Đầu việc | Lead đề xuất | Phụ thuộc |
|---|---|---|---|---|
| FOUNDATION | M0 | [Chốt stack, contract và nền dự án](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/1) | Điều phối + FE + BE | — |
| UI-V2 | M0 | [Duyệt bộ giao diện Stitch V2](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_FE/issues/1) | FE + Điều phối | — |
| AUTH-LOGIN | M0 | [Đăng nhập và session](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/2) | BE + FE | [FOUNDATION](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/1), [UI-V2](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_FE/issues/1) |
| AUTH-REGISTER | M0 | [Đăng ký chủ ngựa và xác minh email](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/3) | BE + FE | [AUTH-LOGIN](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/2) |
| AUTH-RESET | M0 | [Khôi phục mật khẩu](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/4) | BE + FE | [AUTH-LOGIN](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/2) |
| AUTH-STAFF | M0 | [Mời nhân sự và quản lý quyền](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/5) | BE + FE | [AUTH-LOGIN](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/2), [FR-021](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/7) |
| AUTH-SCOPE | M0 | [RBAC và dữ liệu theo chủ sở hữu](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/6) | BE + FE + QA | [AUTH-LOGIN](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/2) |
| FR-021 | M0 | [Nhật ký kiểm toán](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/7) | BE + FE | [AUTH-LOGIN](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/2) |
| FR-002 | M1 | [Hồ sơ định danh ngựa](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/8) | BE + FE | [AUTH-SCOPE](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/6), [FR-021](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/7) |
| FR-003 | M1 | [Phân bổ ô chuồng](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/9) | BE + FE | [FR-002](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/8) |
| FR-008 | M2 | [Bảng sức khỏe đàn ngựa](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/10) | BE + FE | [FR-002](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/8) |
| FR-009 | M2 | [Bệnh án và phác đồ](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/11) | BE + FE | [FR-008](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/10), [FR-021](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/7) |
| FR-010 | M2 | [Đánh dấu chấn thương trên ảnh 2D](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/12) | FE + BE | [FR-009](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/11), [UI-V2](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_FE/issues/1) |
| FR-011 | M2 | [Ban hành và mở khóa y tế](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/13) | BE + FE | [FR-009](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/11), [FR-021](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/7) |
| FR-004 | M2 | [Giáo án theo giai đoạn](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/14) | BE + FE | [FR-002](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/8), [FR-011](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/13) |
| FR-005 | M2 | [Enforcement Medical Lock](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/15) | BE + FE + QA | [FR-011](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/13), [FR-004](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/14) |
| FR-006 | M2 | [Lịch tập và phân công](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/16) | BE + FE | [FR-004](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/14), [FR-005](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/15), [FR-003](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/9) |
| FR-007 | M2 | [Kết quả và nhật ký huấn luyện](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/17) | BE + FE | [FR-006](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/16) |
| FR-012 | M2 | [Lịch y tế dự phòng](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/18) | BE + FE | [FR-009](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/11) |
| MVP-QA | M2 | [Nghiệm thu MVP xuyên suốt](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/19) | QA + FE + BE | [FR-003](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/9), [FR-005](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/15), [FR-007](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/17), [FR-010](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/12), [FR-012](https://github.com/MichaelTran1226/Racehorse_Training_Management_System_MT_BE/issues/18) |

## Quyết định cần chốt trong FOUNDATION

- D-01: FE/BE, ngôn ngữ, DB/ORM, API, test, runtime/deploy. Chưa có stack được nhóm phê duyệt.
- D-02: đề xuất public signup chỉ Horse Owner; nhân sự nhận lời mời từ Manager. Chốt OTP/email/reset, cấp Manager đầu tiên, thời hạn và giới hạn gửi. Các giá trị trong mockup là đề xuất thiết kế.
- D-03: MVP không có ngoại lệ rehab vượt Medical Lock; chỉ Vet mở khóa sau tái khám; Manager không duyệt thay Vet.
- D-04: dùng ảnh hệ xương nhìn nghiêng nguyên bản 900×600; tọa độ marker chuẩn hóa theo ảnh, vùng/bên cơ thể chọn riêng; không mô hình 3D hay lớp giải phẫu khác.

## Cách nhận việc và mở PR

1. Chọn issue không còn dependency chưa giải quyết; đọc AC và screen ID. FE/BE thống nhất DTO, enum, validation, quyền và lỗi trước code.
2. Gán một assignee chịu trách nhiệm; bổ sung checklist FE/BE/QA hoặc sub-issue khi quá lớn. Không đánh dấu xong bằng scaffold.
3. Tạo branch `feat/<issue-number>-<slug>` trong repo tương ứng; PR ghi `Refs <primary issue URL>` và liên kết PR liên quan. Không đóng primary issue trước khi cả FE/BE hoàn tất.
4. Gắn evidence thật: build/test, ảnh UI, test quyền, lỗi và concurrency. Review rồi merge theo quy định nhóm.

## Definition of Ready / Done

**Ready:** scope + AC rõ, contract thống nhất, dependency giải quyết, owner thật và kế hoạch làm được nhóm xác nhận. Project đang dùng trạng thái có sẵn Todo/In Progress/Done; Todo là backlog, không có nghĩa đã Ready.

**Done:** AC đạt; unit/integration và API/E2E thích hợp; kiểm tra website ở 1280/1440/1920px; không lỗi console nghiêm trọng; review/merge mọi PR liên quan; tài liệu setup/migration/rollback; đọc lại trạng thái Project. Không coi bản Stitch là ứng dụng có API đang chạy.

## Phạm vi thiết kế và giới hạn

Bộ V2 theo nền sáng, xanh rừng, Manrope. Đăng nhập/đăng ký/xác minh/khôi phục tách riêng. Dữ liệu trong mockup được ghi là minh họa. Review layout desktop không thay thế test đăng nhập, RBAC, database hay Medical Lock thật. Flow 4–6 giữ trong backlog cục bộ để xem lại sau, không tạo issue optional trong đợt này.

## Bằng chứng đồng bộ

20 issue có URL thật trong bảng; Project #2 đã kiểm tra quyền ghi. Priority, Work type, Area, Blueprint ID, Risk, Work ID và Iteration đề xuất được gắn theo issue. Không gán deadline/assignee giả. File env giữ nguyên dry-run mặc định; lần ghi core này thực hiện theo yêu cầu trực tiếp “PLAN TRÊN GITHUB” của người dùng và có bản dry-run riêng.
