# [FR-001,FR-002,FR-003,FR-005,FR-010,FR-011][MVP-QA] Nghiệm thu MVP xuyên suốt

Work ID: MVP-QA
Blueprint ID: FR-001,FR-002,FR-003,FR-005,FR-010,FR-011
Target repository: MichaelTran1226/Racehorse_Training_Management_System_MT_BE
Related repository: MichaelTran1226/Racehorse_Training_Management_System_MT_FE
Project: https://github.com/users/MichaelTran1226/projects/2
Status: Backlog — draft local, chưa đồng bộ.
Priority: P0 Critical
Type: Story
Area: governance
Milestone/Iteration đề xuất: M2
Owner/Target date: chưa gán; phải có người thật trước Ready.
Lead đề xuất: QA + FE + BE
Risk: Critical

## Context và phạm vi

Triển khai nghiệm thu mvp xuyên suốt theo SRS/blueprint EquiFlow và UI V2. Nguồn local chưa publish: RACEHORSE-TRAINING-BP, bộ stitch-v2; thay bằng URL file thực sau PR tài liệu. Không dùng yêu cầu Sports Center cũ. Không có phả hệ hoặc video trong scope.

Screens: AUTH01, AUTH02, AUTH03, AUTH04, AUTH05, AUTH06, AUTH07, AUTH08, SYS01, SYS02, H01, H02, H03, H04, T02, T03, T05, V03, V04, V05, O01, M01, M02, M03. Xem SCREEN-MAP.md trong gói UI; chỉ dùng màn có evidence review khi bắt đầu FE.

## Acceptance criteria

- [ ] E2E signup→verify→login→horse→injury→lock→blocked scheduling→unlock→reschedule đạt.
- [ ] Năm role và hai Owner kiểm tra API/UI; asset và marker đúng ở ba viewport.
- [ ] CI/build/test thực được đính kèm PR; review/merge và rollback có evidence trước Done.

## Công việc và ownership

- [ ] Chốt contract, validation, quyền, state lỗi và quyết định còn mở liên quan trong DECISIONS.md.
- [ ] BE: schema/migration/API/service theo stack đã chốt, tích hợp quyền và audit khi cần.
- [ ] FE: màn theo screen ID, state/routing/accessibility và tích hợp contract thực.
- [ ] QA: test dương, âm, quyền và concurrency thích hợp với AC; ghi evidence thật.

Phạm vi file dự kiến: module governance trong từng repo, test cùng module và tài liệu API. Chưa đặt đường dẫn framework khi chưa chốt stack. Chia thành subtask ≤1 buổi làm nếu ước lượng vượt năng lực một slice; không đánh dấu các checkbox chỉ vì scaffold.

## Dependency / Blocker

- FR-003 (thay bằng URL issue thật sau sync)
- FR-005 (thay bằng URL issue thật sau sync)
- FR-007 (thay bằng URL issue thật sau sync)
- FR-010 (thay bằng URL issue thật sau sync)
- FR-012 (thay bằng URL issue thật sau sync)

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
