---
mode: agent
description: "Thiết kế EquiFlow trên Stitch theo ảnh mẫu V2 và đúng năm vai trò."
---

# EquiFlow — Stitch UI V2

Đọc `docs/stitch-ui-prompts-by-feature.md`, `docs/srs.txt`, `docs/blueprint.md`, đặc tả `docs/specs/Flow*.md` và `docs/ui-design/` (`SCREEN-MAP.md` + `screens/`). Dùng SCREEN-MAP.md (31 màn chính + 5 biến thể) làm chuẩn tên và mã màn; không dùng archive làm chuẩn thiết kế.

1. Vai trò: Club Manager, Head Trainer, Veterinarian, Groom / Stable Hand, Horse Owner. Không dùng Member/Receptionist/Coach của dự án khác.
2. Nền sáng, forest green, bảng gọn theo ảnh tham chiếu. Bỏ cây phả hệ/video; dùng đúng ảnh giải phẫu 2D được chỉ định.
3. Tách từng màn xác thực AUTH01…AUTH08; không gộp nhiều màn thành poster.
4. Đọc project/screen hiện có trước khi sửa, bảo toàn reference. Dùng tool schema thật khi kết nối; không hard-code modelId/tool từ tài liệu cũ.
5. Tạo/áp DESIGN.md, sinh màn theo giai đoạn, kiểm tra kết quả. Asset không tải được phải báo đúng; không thay hình AI rồi tuyên bố đúng nguyên bản.
6. Lưu projectId/screenId/preview/export và review thực; không công cụ hoặc credential thì ghi blocker, không bịa URL.
7. GitHub mục tiêu theo kế hoạch là Project #2 MichaelTran1226; xác minh live trước sync. Không suy số issue từ FR.

Review: auth rõ bước; đúng quyền; Owner chỉ thấy ngựa mình; Medical Lock không bypass; annotation đúng ảnh; responsive; empty/error/loading/success. Tạo UI không đồng nghĩa hoàn thành tính năng; Done cần code/test/review/merge có evidence.
