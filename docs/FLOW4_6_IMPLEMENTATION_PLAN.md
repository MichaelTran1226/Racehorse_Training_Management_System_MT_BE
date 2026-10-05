# Implementation Plan — Flow 4, Flow 5 và Flow 6

## 1. Mục tiêu

Chuẩn bị và triển khai các Flow 4–6 theo lát cắt dọc BE → API contract → FE → test. Kế hoạch này được thêm song song với `tasks/plan.md` hiện hữu của Flow 1–3, không thay đổi trạng thái hay quyền sở hữu các task đang mở.

## 2. Nguồn chuẩn và luật cứng

- Nguồn nghiệp vụ: `Flow4_ChuongTrai.md`, `Flow5_ThiDau.md`, `Flow6_AI.md`.
- Kiến trúc AI: `Flow6_AI_Architecture_Blueprint.md`.
- Context và invariant: `AI_PROJECT_CONTEXT_INDEX.md`.
- `RULE-MED-01`: khóa y tế chặn tuyệt đối bài nặng và đăng ký thi đấu.
- `RULE-RBAC-01`: Owner/Groom chỉ truy cập dữ liệu đúng phạm vi.
- `RULE-AI-01`: AI không tự ghi/sửa dữ liệu thật hoặc tự kích hoạt giáo án.
- `RULE-AI-02`: mọi nội dung AI có nhãn “Do AI tạo” và miễn trừ trách nhiệm y khoa.
- `RULE-RISK-01`: ACWR trên `1.50` là tín hiệu nguy cơ cao.
- `RULE-CONF-01`: tối đa 50 câu hỏi/người/ngày và 10 gợi ý/HT/ngày theo mặc định.

## 3. Thứ tự phụ thuộc

```text
Flow 4: danh mục → ca trực/khẩu phần → checklist → tồn kho
Flow 5: giải đua → eligibility/đăng ký → kết quả → tài chính/báo cáo
Flow 6: dữ liệu Flow 2–5 → risk engine/context → AI features → phát hành
```

Các foundation độc lập của Flow 4 và Flow 5 có thể được chuẩn bị khi Flow 1–3 còn đang hoàn thiện. Mỗi lát cắt tích hợp chỉ bắt đầu khi API phụ thuộc tương ứng đã ổn định. Flow 6 chỉ bắt đầu phần tích hợp AI sau khi có dữ liệu thật và quyết định chính sách nhà cung cấp.

## 4. Phân công ownership

| Cặp | Task chủ trì | Lý do giữ ownership |
|---|---|---|
| **Cặp 1** | F4-01, F4-02, F4-05, F4-06; F5-01, F5-04, F5-05; F6-01, F6-06, F6-07 | Tiếp nối dữ liệu ngựa/chuồng, vận hành, RBAC, audit, tài chính và báo cáo |
| **Cặp 2** | F4-03, F4-04; F5-02, F5-03; F6-02, F6-03, F6-04, F6-05 | Tiếp nối y tế/huấn luyện, Medical Lock, eligibility và risk engine |
| **Chung** | F6-00 | Lead chốt provider/chính sách; Cặp 1 ghi Decision, Cặp 2 phản biện phạm vi dữ liệu y tế |

Ownership là theo cặp FE+BE. Tên cá nhân được lấy từ sheet `Thành viên` của bảng phân công sau khi team điền GitHub username. Các task vẫn ở `ToDo`, chưa có sprint và issue cho đến khi Lead đưa vào GitHub Project.

Thứ tự bắt đầu trong mỗi cặp:

- **Cặp 1:** F4-01 → F4-02 → F4-05 → F4-06; F5-01 có thể làm song song sau khi Flow 1–3 ổn định; tiếp theo F5-04 → F5-05; Flow 6 đi F6-01 → F6-06 → F6-07.
- **Cặp 2:** F4-03 → F4-04; F5-02 → F5-03; Flow 6 đi F6-02 → F6-03/F6-04 → F6-05.

## 5. Các phase triển khai

### Phase 1 — Flow 4: Chuồng trại, dinh dưỡng và chăm sóc

#### F4-01: Danh mục vật tư và ca trực

**Acceptance criteria:** CM quản lý danh mục; vai trò khác chỉ xem theo quyền; dữ liệu ngừng dùng không được chọn cho bản ghi mới.  
**Verification:** BE unit/API tests, FE role tests, lint/typecheck/build.  
**Dependencies:** Danh mục khu/ô chuồng và phạm vi Groom của Flow 1.

#### F4-02: Phân ca theo ngày × ca × khu

**Acceptance criteria:** CM phân/sao chép ca; GROOM chỉ thấy ca và ngựa thuộc phạm vi; chống trùng phân công.  
**Verification:** API integration và UI tại `/stable/shifts`.  
**Dependencies:** F4-01 và Flow 1 khu/ô chuồng.

#### F4-03: Vòng đời khẩu phần

**Acceptance criteria:** HT tạo/sửa/gửi duyệt/rút; VET duyệt hoặc từ chối; GROOM chỉ thấy phiên bản đã duyệt có hiệu lực.  
**Verification:** Test transition trạng thái, cảnh báo 1.5–3.0% cân nặng và UI `/nutrition/rations`.  
**Dependencies:** F4-01.

#### F4-04: Sinh checklist chăm sóc hằng ngày

**Acceptance criteria:** Job 00:05 tạo idempotent task từ khẩu phần, lịch sinh hoạt, y tế và buổi tập; Medical Lock hủy/chặn đúng task.  
**Verification:** Chạy job hai lần không nhân đôi; test liên kết Flow 2/3.  
**Dependencies:** F4-02, F4-03, Flow 2 sessions và API y tế ổn định của Flow 3.

#### F4-05: Thực hiện và giám sát công việc

**Acceptance criteria:** GROOM hoàn tất/báo không làm được/hoàn tác trong 15 phút; xác nhận offline được gửi lại an toàn; CM/HT/VET giám sát và giao lại.  
**Verification:** Playwright mobile và API conflict/idempotency tests.  
**Dependencies:** F4-04.

#### F4-06: Tồn kho và đề xuất bổ sung

**Acceptance criteria:** Tiêu hao tự động/thủ công theo khu; tồn âm tạo cảnh báo; CM kiểm kê/đặt định mức/duyệt đề xuất; chỉ CM thấy đơn giá.  
**Verification:** Transaction tests và RBAC/data masking tests.  
**Dependencies:** F4-01, F4-05.

### Checkpoint Flow 4

- Checklist một ngày được sinh, thực hiện, ghi tiêu hao và phản ánh trong care log.
- Owner không truy cập Flow 4; Groom không vượt phạm vi khu/ngựa được giao.

### Phase 2 — Flow 5: Thi đấu, thành tích và tài chính

#### F5-01: Danh mục và vòng đời giải đua

**Acceptance criteria:** CM tạo/sửa/hủy giải; danh sách và lịch tháng lọc đúng; không sửa giải ở trạng thái bị khóa.  
**Verification:** API state transition và UI `/races`.

#### F5-02: Eligibility và đăng ký thi đấu

**Acceptance criteria:** HT thấy lý do đạt/không đạt; Medical Lock và thời gian ngưng thuốc chặn cứng tại lúc lưu; đăng ký không vượt số suất.  
**Verification:** Race-condition tests và end-to-end Lock → register rejection.  
**Dependencies:** F5-01, Flow 2 metrics và Medical Lock/withdrawal data của Flow 3.

#### F5-03: Tạm treo/rút đăng ký và kết quả

**Acceptance criteria:** Lock mới tạm treo đăng ký; đến giờ đua còn khóa thì tự rút; HT/CM nhập kết quả và CM chốt/sửa có audit.  
**Verification:** Time-based integration tests và performance history UI.  
**Dependencies:** F5-02.

#### F5-04: Sổ tài chính

**Acceptance criteria:** Tự ghi phí giải, vật tư và tiền thưởng; phân bổ theo tỷ lệ sở hữu tại ngày phát sinh; chi phí chung thuộc CLB.  
**Verification:** Decimal/rounding, ownership-effective-date và authorization tests.  
**Dependencies:** F5-03, F4-06.

#### F5-05: Báo cáo và dashboard

**Acceptance criteria:** Báo cáo tháng được CM duyệt/phát hành; Owner chỉ thấy phần của mình và tải PDF; dashboard tổng hợp số liệu đã chốt.  
**Verification:** Snapshot số liệu, PDF render và Owner isolation tests.  
**Dependencies:** F5-04.

### Checkpoint Flow 5

- Luồng tạo giải → đăng ký → Medical Lock → kết quả → tài chính → báo cáo chạy end-to-end.
- Audit lưu tối thiểu 2 năm và truy vấn mỗi lần tối đa 90 ngày.

### Phase 3 — Flow 6: AI Insights

#### F6-00: Chốt provider và chính sách dữ liệu

**Acceptance criteria:** Có Decision về OpenAI/Gemini/local, trường dữ liệu được gửi ra ngoài, retention, secret management và fallback.  
**Verification:** Decision được duyệt trước khi kết nối provider.  
**Dependencies:** Không.

#### F6-01: Chuẩn hóa schema và lifecycle AIInsight

**Acceptance criteria:** Schema hỗ trợ generating/generated/acknowledged/applied/dismissed/expired/failed; JSON được validate bằng typed schema; seed idempotent.  
**Verification:** `prisma generate`, `prisma db push` trên DB test và unit tests lifecycle.  
**Dependencies:** F6-00.

#### F6-02: Context Projection và Risk Engine

**Acceptance criteria:** Context tuân thủ RBAC; ACWR và rule y tế được tính deterministic; dữ liệu thiếu làm giảm confidence thay vì bịa.  
**Verification:** Unit tests biên ACWR 1.50, Medical Lock và Owner/Groom isolation.  
**Dependencies:** Dữ liệu thật và API ổn định của Flow 2–5.

#### F6-03: Gợi ý giáo án

**Acceptance criteria:** HT tạo/tạo lại/từ chối/áp dụng thành Draft; AI không tự kích hoạt; gợi ý hết hạn sau 7 ngày hoặc khi ngựa bị khóa.  
**Verification:** Contract tests, rate limit 10/ngày và Flow 2 Draft integration.  
**Dependencies:** F6-01, F6-02, Flow 2.

#### F6-04: Cảnh báo nguy cơ chấn thương

**Acceptance criteria:** Tính hằng ngày và sau buổi tập; HT/VET xác nhận và ghi hành động; Owner không thấy điểm nguy cơ.  
**Verification:** Scheduler idempotency, threshold transition và RBAC tests.  
**Dependencies:** F6-02.

#### F6-05: Trợ lý AI có nguồn

**Acceptance criteria:** Câu trả lời có citation, nhãn AI và disclaimer; từ chối thao tác ghi; hội thoại chỉ chủ sở hữu xem; giới hạn 50 câu/ngày.  
**Verification:** Prompt injection, scope isolation, rate limit và retention tests.  
**Dependencies:** F6-00, F6-01, F6-02.

#### F6-06: Tóm tắt và báo cáo AI

**Acceptance criteria:** Tạo tuần/tháng idempotent; CM sửa/duyệt/phát hành; Owner chỉ xem bản phát hành đúng phạm vi.  
**Verification:** Scheduler tests, approval workflow và PDF/export tests.  
**Dependencies:** F6-01, dữ liệu Flow 3–5.

#### F6-07: Cấu hình, observability và kill switch

**Acceptance criteria:** CM cấu hình ngưỡng/limit/feature flags; lưu audit; có metrics chi phí, latency, lỗi, confidence và kill switch.  
**Verification:** Authorization, config rollback và provider failure tests.  
**Dependencies:** F6-03 đến F6-06.

### Checkpoint Flow 6

- AI không vượt quyền, không tự ghi dữ liệu nghiệp vụ và luôn hiển thị nguồn/nhãn/disclaimer.
- Provider lỗi hoặc timeout không làm hỏng dữ liệu và trạng thái có thể phục hồi.

## 6. Rủi ro và xử lý

| Rủi ro | Mức | Xử lý |
|---|---|---|
| API phụ thuộc của Flow 1–3 chưa ổn định | Cao | Vẫn tạo task/contract; chỉ hoãn lát cắt tích hợp liên quan |
| Flow 2 chưa hoàn tất nhưng Flow 4/5/6 cần dữ liệu tập luyện | Cao | Chỉ làm catalog/foundation; hoãn integration slice |
| Race condition đăng ký giải/tồn kho | Cao | Transaction + optimistic/concurrency tests |
| AI gửi dữ liệu nhạy cảm ra ngoài | Cao | F6-00 bắt buộc trước provider integration |
| Job định kỳ tạo bản ghi trùng | Cao | Idempotency key và unique constraint |
| Các task quá lớn | Trung bình | Mỗi ID là một vertical slice, tách PR BE/FE nhưng chung contract |

## 7. Câu hỏi cần Lead chốt

- Nhà cung cấp AI và chính sách dữ liệu ngoài hệ thống.
- Trọng số chính thức của injury risk ngoài ngưỡng ACWR đã chốt.
- Flow 4/5/6 thuộc sprint nào, tên cá nhân trong từng cặp và số issue GitHub tương ứng.
- Có triển khai offline queue của Groom trong MVP hay đưa sang phase sau.
