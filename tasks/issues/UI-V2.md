# [FR-022][UI-V2] Duyệt bộ giao diện Stitch V2

Work ID: UI-V2
Blueprint ID: FR-022
Target repository: MichaelTran1226/Racehorse_Training_Management_System_MT_FE
Related repository: MichaelTran1226/Racehorse_Training_Management_System_MT_BE
Project: https://github.com/users/MichaelTran1226/projects/2
Status: Backlog — draft local, chưa đồng bộ.
Priority: P0 Critical
Type: Task
Area: ui
Milestone/Iteration đề xuất: M0
Owner/Target date: chưa gán; phải có người thật trước Ready.
Lead đề xuất: FE + Điều phối
Risk: Medium

## Context và phạm vi

Triển khai duyệt bộ giao diện stitch v2 theo SRS/blueprint EquiFlow và UI V2. Nguồn local chưa publish: RACEHORSE-TRAINING-BP, bộ stitch-v2; thay bằng URL file thực sau PR tài liệu. Không dùng yêu cầu Sports Center cũ. Không có phả hệ hoặc video trong scope.

Screens: Nền tảng, không màn riêng. Xem SCREEN-MAP.md trong gói UI; chỉ dùng màn có evidence review khi bắt đầu FE.

## Acceptance criteria

- [ ] Screen map truy nguyên Flow 1–3 + auth/audit; optional tạm hoãn, màn hình riêng và link Stitch thực.
- [ ] Không phả hệ/video; V03 dùng đúng file ảnh; AUTH01/02/03 tách rõ.
- [ ] Review website desktop 1280/1440/1920px và state checklist; mọi lệch thiết kế có issue.

## Công việc và ownership

- [ ] Chốt contract, validation, quyền, state lỗi và quyết định còn mở liên quan trong DECISIONS.md.
- [ ] BE: schema/migration/API/service theo stack đã chốt, tích hợp quyền và audit khi cần.
- [ ] FE: màn theo screen ID, state/routing/accessibility và tích hợp contract thực.
- [ ] QA: test dương, âm, quyền và concurrency thích hợp với AC; ghi evidence thật.

Phạm vi file dự kiến: module ui trong từng repo, test cùng module và tài liệu API. Chưa đặt đường dẫn framework khi chưa chốt stack. Chia thành subtask ≤1 buổi làm nếu ước lượng vượt năng lực một slice; không đánh dấu các checkbox chỉ vì scaffold.

## Dependency / Blocker

Không có dependency công việc; cần review và owner.

D-01 stack và D-02 onboarding chưa duyệt là blocker của implementation liên quan. Owner/iteration/date hiện chưa được cam kết.

## Verification / Done

- [ ] Lệnh lint/typecheck/build và test hẹp theo stack đã chọn chạy thật, lưu output.
- [ ] Unit/integration trước, API/E2E sau; UI ở 1280/1440/1920px nếu có.
- [ ] PR FE và BE liên kết issue chính, review/merge đầy đủ; tài liệu/rollback cập nhật.
- [ ] Đọc lại Project item, chỉ chuyển Done khi AC đạt. Không suy số issue từ FR.

## Progress comment

Progress: Not started
Summary: Draft kế hoạch từ UI V2
Evidence: Chưa có implementation/test evidence
Branch/PR: Chưa tạo
Next: Gán owner, chốt dependency và AC
Blocker: Xem mục Dependency / Blocker
