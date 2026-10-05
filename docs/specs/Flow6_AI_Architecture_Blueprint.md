# EquiFlow — THIẾT KẾ KIẾN TRÚC & KỸ THUẬT TRIỂN KHAI FLOW 6: AI
> **Dự án:** Racehorse Training & Management System (TMEC) — SWP391  
> **Vị trí lưu:** `Tai_Lieu/Flow6_AI_Architecture_Blueprint.md`  
> **Căn cứ đặc tả:** [`Tai_Lieu/Flow6_AI.md`](file:///E:/01_Academic_FPT/Courses/Se_5_Active/SWP391/MINH_Racehorse_Branch/Tai_Lieu/Flow6_AI.md)  
> **Kỹ thuật nền tảng:** Kế thừa từ 3 Codelabs trong [`CODELABS_WORKSHOP`](file:///E:/03_Knowledge_Vault/3_Resources/CODELABS_WORKSHOP):
> - **Codelab 1:** State Machine, Context Projection, Context Isolation & Recovery.
> - **Codelab 2:** Heading-Aware Chunking, Dense Retrieval & Claim Faithfulness Check.
> - **Codelab 3:** Typed Knowledge, Selective Rule Loading & Deterministic Boundary Validation.

---

## 1. Tổng quan mục tiêu kiến trúc

Hệ thống AI trong EquiFlow không được xây dựng theo kiểu "gọi API trực tiếp tới OpenAI/Gemini rồi in kết quả ra màn hình". Thay vào đó, nó tuân thủ triết lý phần mềm doanh nghiệp:
1. **An toàn tuyệt đối (Safety First):** Quy tắc y tế và Khóa huấn luyện (Medical Lock) là bất khả xâm phạm. Bất kể LLM đề xuất gì, mã nguồn phần mềm tất định (deterministic code) sẽ là chốt chặn cuối cùng kiểm duyệt.
2. **Tiết kiệm Token & Chống ngộ độc ngữ cảnh:** Sử dụng Context Projection để chỉ cấp đúng lượng dữ liệu cần thiết cho từng tác vụ.
3. **Chống ảo giác (Anti-Hallucination):** Mọi lời khuyên y tế/dinh dưỡng từ Trợ lý AI đều phải được đối soát (grounding) với tài liệu tiêu chuẩn trước khi gửi về client.

---

## 2. Kiến trúc 3 tầng tích hợp Codelabs

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React 19 + Vite)                     │
│  SC-6.01 (Gợi ý giáo án) │ SC-6.02/03 (Nguy cơ) │ SC-6.04 (Trợ lý AI) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ REST API (/api/ai/...)
┌───────────────────────────────────▼────────────────────────────────────┐
│                    NESTJS BACKEND — AI MODULE                          │
│                                                                        │
│  [TẦNG 1: QUẢN TRỊ STATE & CHIẾU NGỮ CẢNH] (Kỹ thuật Codelab 1)       │
│  • ContextProjectionService: Lọc dữ liệu theo RBAC & Ngựa              │
│  • State Machine: Quản lý vòng đời (GENERATING -> READY -> APPLIED)   │
│  • Async Recovery & Timeout (Tối đa 60s)                               │
│                                   │                                    │
│  [TẦNG 2: RAG PIPELINE & GROUNDING CHECK] (Kỹ thuật Codelab 2)         │
│  • Heading-Aware Chunker: Băm tài liệu Tai_Lieu/ theo cấu trúc H2/H3  │
│  • Vector Search / Dense Retrieval: Tìm kiếm tri thức dinh dưỡng/y tế  │
│  • Faithfulness Validator: Kiểm tra bằng chứng (Claim Support)        │
│                                   │                                    │
│  [TẦNG 3: TYPED RULES & BOUNDARY VALIDATION] (Kỹ thuật Codelab 3)      │
│  • Rule Registry: Nạp luật có điều kiện (Selective Rule Loading)       │
│  • Structured Output Parser: Ép kiểu phản hồi JSON chuẩn               │
│  • Hard Boundary Validator: Ép buộc 100% tuân thủ Medical Lock         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
       [PostgreSQL (Prisma ORM)]         [LLM Engine / Provider]
     - Bảng AIInsight, Horse...       - OpenAI / Gemini / Local GGUF
```

---

## 3. Chi tiết triển khai Tầng 1: Quản trị State & Context Projection (Codelab 1)

### 3.1. Vòng đời trạng thái bất đồng bộ & Khôi phục (State Recovery)
Theo [`Tai_Lieu/Flow6_AI.md#L120-L138`](file:///E:/01_Academic_FPT/Courses/Se_5_Active/SWP391/MINH_Racehorse_Branch/Tai_Lieu/Flow6_AI.md#L120-L138), quá trình tạo gợi ý có thời gian chờ tối đa 60 giây. Nếu crash hoặc timeout, trạng thái phải được bảo toàn:

```typescript
// Trạng thái lưu trực tiếp trong bảng AIInsight qua Prisma
export enum RecommendationState {
  GENERATING = 'GENERATING',
  READY = 'READY',
  APPLIED = 'APPLIED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  FAILED = 'FAILED'
}
```

- **Khi bắt đầu:** Tạo ngay một bản ghi `AIInsight` với `status = 'GENERATED'` và nội dung tạm `{ state: 'GENERATING', startedAt: Date.now() }`.
- **Xử lý Timeout (60s):** Nếu sau 60s không có kết quả từ LLM, chuyển trạng thái sang `DISMISSED` với mã lỗi `AI_GENERATION_TIMEOUT`.

### 3.2. Context Projection Service (Cách ly RBAC)
Ngăn chặn rò rỉ dữ liệu hoặc nhồi thừa token:

```typescript
// src/ai/services/context-projection.service.ts
import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ContextProjectionService {
  constructor(private prisma: PrismaService) {}

  async projectHorseFactsForPlanner(horseId: string, userId: string, userRole: string) {
    // 1. Kiểm tra RBAC Data Scope
    await this.verifyAccess(horseId, userId, userRole);

    // 2. Chiếu đúng lát cắt dữ liệu 14-28 ngày (không lấy cả vòng đời)
    const horse = await this.prisma.horse.findUnique({
      where: { id: horseId },
      include: {
        MedicalLock: { where: { status: 'ACTIVE' } },
        InjuryLog: { where: { status: { in: ['REPORTED', 'TREATING'] } } },
        WorkoutSession: {
          take: 14,
          orderBy: { scheduledDate: 'desc' },
          select: {
            actualDistanceMeters: true,
            avgHeartRateBpm: true,
            recoveryHeartRateBpm: true,
            performanceScore: true,
            abnormalSignsNote: true
          }
        }
      }
    });

    if (!horse) throw new NotFoundException('Không tìm thấy thông tin ngựa');

    const activeLock = horse.MedicalLock[0] || null;

    return {
      horseId: horse.id,
      name: horse.name,
      age: new Date().getFullYear() - horse.yearOfBirth,
      hasActiveMedicalLock: !!activeLock,
      medicalLockUntil: activeLock ? activeLock.expectedEndDate : null,
      medicalLockReason: activeLock ? activeLock.lockReason : null,
      activeInjuries: horse.InjuryLog.map(i => ({ type: i.injuryType, severity: i.severity })),
      recentWorkoutCount: horse.WorkoutSession.length,
      averageRecoveryHr: this.computeAvg(horse.WorkoutSession.map(w => w.recoveryHeartRateBpm))
    };
  }

  private async verifyAccess(horseId: string, userId: string, userRole: string) {
    if (['CLUB_MANAGER', 'HEAD_TRAINER', 'VETERINARIAN'].includes(userRole)) return;
    if (userRole === 'HORSE_OWNER') {
      const owned = await this.prisma.horse.findFirst({ where: { id: horseId, ownerId: userId } });
      if (!owned) throw new ForbiddenException('Bạn chỉ có quyền xem ngựa của chính mình.');
    }
  }

  private computeAvg(values: (number | null)[]): number {
    const valid = values.filter((v): v is number => typeof v === 'number');
    return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
  }
}
```

---

## 4. Chi tiết triển khai Tầng 2: RAG Pipeline & Claim Verification (Codelab 2)

Dành cho **SC-6.04 (Trợ lý AI hỏi đáp dinh dưỡng & y tế)**:

### 4.1. Heading-Aware Chunker cho tài liệu thú y
Tài liệu nghiệp vụ nằm trong `Tai_Lieu/` có dạng Markdown phân cấp. Ta băm tài liệu theo ranh giới `##` và `###` để bảo toàn tính nguyên khối của phác đồ điều trị:

```typescript
// src/ai/services/heading-aware-chunker.service.ts
export interface EvidenceUnit {
  id: string;
  sourceDoc: string;
  sectionTitle: string;
  fullPath: string;
  content: string;
  tokenEstimate: number;
}

export class HeadingAwareChunker {
  static chunkMarkdown(sourceDoc: string, rawMarkdown: string): EvidenceUnit[] {
    const lines = rawMarkdown.split('\n');
    const chunks: EvidenceUnit[] = [];
    let currentTitle = 'Tổng quan';
    let currentContent: string[] = [];

    for (const line of lines) {
      if (line.startsWith('## ') || line.startsWith('### ')) {
        if (currentContent.length > 0) {
          chunks.push({
            id: `${sourceDoc}-${chunks.length + 1}`,
            sourceDoc,
            sectionTitle: currentTitle,
            fullPath: `${sourceDoc} > ${currentTitle}`,
            content: currentContent.join('\n').trim(),
            tokenEstimate: Math.ceil(currentContent.join('\n').length / 4)
          });
          currentContent = [];
        }
        currentTitle = line.replace(/^#+\s*/, '').trim();
      } else {
        currentContent.push(line);
      }
    }
    return chunks;
  }
}
```

### 4.2. Grounding & Faithfulness Check (Chống bịa thông tin y khoa)
Áp dụng cơ chế từ `codelab2.py` (`evaluate_claim_support`):
1. Khi LLM sinh câu trả lời y tế/dinh dưỡng, hệ thống kiểm tra câu trả lời có nguồn trích dẫn (`sourceId`) hợp lệ từ kho `EvidenceUnit` hay không.
2. Ép buộc thêm dòng disclaimer: *"Thông tin tham khảo, không thay thế chẩn đoán của Bác sĩ thú y."* theo điều kiện bắt buộc tại [`Tai_Lieu/Flow6_AI.md#L11`](file:///E:/01_Academic_FPT/Courses/Se_5_Active/SWP391/MINH_Racehorse_Branch/Tai_Lieu/Flow6_AI.md#L11).

---

## 5. Chi tiết triển khai Tầng 3: Typed Rules & Boundary Validation (Codelab 3)

### 5.1. Định nghĩa Luật hình thức hóa (Typed Knowledge)
Tách các quy định bằng lời trong `Flow2` và `Flow3` thành các đối tượng quy tắc có kiểm định:

```typescript
// src/ai/rules/equine-rules.ts
export interface PolicyGate {
  field: string;
  operator: 'EQUALS' | 'GREATER_THAN';
  expected: any;
}

export interface EquineRule {
  id: string;
  name: string;
  category: 'MEDICAL_SAFETY' | 'TRAINING_LOAD';
  gates: PolicyGate[];
  enforce: (horseFacts: any, planProposal: any) => { passed: boolean; reason?: string };
}

export const MedicalLockStrictRule: EquineRule = {
  id: 'RULE-MED-01',
  name: 'Tuyệt đối cấm bài nặng khi ngựa có Medical Lock',
  category: 'MEDICAL_SAFETY',
  gates: [
    { field: 'hasActiveMedicalLock', operator: 'EQUALS', expected: true }
  ],
  enforce: (facts, proposal) => {
    const lockDate = new Date(facts.medicalLockUntil);
    for (const phase of proposal.phases || []) {
      for (const drill of phase.weeklySchedule || []) {
        const targetDate = new Date(drill.targetDate);
        if (targetDate <= lockDate && (drill.intensity === 'HEAVY' || drill.intensity === 'MODERATE_HIGH')) {
          return {
            passed: false,
            reason: `Bài tập ngày ${drill.targetDate} có cường độ ${drill.intensity} vi phạm Medical Lock có hiệu lực đến ${facts.medicalLockUntil}.`
          };
        }
      }
    }
    return { passed: true };
  }
};
```

### 5.2. Deterministic Boundary Validator (Chốt chặn phần mềm)
Service này được gọi sau khi LLM trả về kết quả:

```typescript
// src/ai/services/boundary-validator.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { MedicalLockStrictRule } from '../rules/equine-rules';

@Injectable()
export class BoundaryValidatorService {
  private readonly logger = new Logger(BoundaryValidatorService.name);

  validateAndSanitize(facts: any, proposal: any): any {
    // 1. Kiểm tra với Rule Medical Lock
    const medCheck = MedicalLockStrictRule.enforce(facts, proposal);
    
    if (!medCheck.passed) {
      this.logger.warn(`AI đã đề xuất vi phạm ranh giới: ${medCheck.reason}. Bắt đầu can thiệp tất định (Auto-Sanitize)...`);
      
      // Can thiệp tự động: Hạ toàn bộ bài tập nặng về LIGHT trước ngày mở khóa
      const lockDate = new Date(facts.medicalLockUntil);
      for (const phase of proposal.phases || []) {
        for (const drill of phase.weeklySchedule || []) {
          if (new Date(drill.targetDate) <= lockDate) {
            drill.intensity = 'LIGHT';
            drill.drills = [{ type: 'RECOVERY_WALK', description: 'Đi bộ phục hồi có dây dắt' }];
          }
        }
      }
      proposal.sanitized = true;
      proposal.sanitizedNote = 'Hệ thống đã tự động điều chỉnh các bài tập trước ngày mở khóa về mức Nhẹ (LIGHT) để đảm bảo an toàn y tế.';
    }

    return proposal;
  }
}
```

---

## 6. Thiết kế Cấu trúc Mã nguồn Module `src/ai` (NestJS)

```
Racehorse_Training_Management_System_MT_BE/src/ai/
├── ai.module.ts
├── ai.controller.ts
├── dto/
│   ├── request-recommendation.dto.ts
│   ├── apply-recommendation.dto.ts
│   ├── query-injury-risk.dto.ts
│   └── chat-assistant.dto.ts
├── rules/
│   ├── equine-rules.ts
│   └── rule-registry.service.ts
├── services/
│   ├── context-projection.service.ts
│   ├── boundary-validator.service.ts
│   ├── heading-aware-chunker.service.ts
│   ├── recommendation.service.ts
│   ├── injury-risk.service.ts
│   └── assistant.service.ts
└── providers/
    └── llm-client.provider.ts
```

### API Endpoints cần cung cấp cho Frontend React

| Phương thức | Đường dẫn API | Mô tả chức năng | Màn hình FE tương ứng |
|---|---|---|---|
| `POST` | `/api/ai/recommendations` | Tạo gợi ý giáo án AI cho 1 ngựa | SC-6.01 (Nút BTN-6.01) |
| `POST` | `/api/ai/recommendations/:id/apply` | Áp dụng gợi ý thành giáo án Nháp Flow 2 | SC-6.01 (Dialog DL-6.01) |
| `POST` | `/api/ai/recommendations/:id/reject` | Từ chối gợi ý giáo án | SC-6.01 (Dialog DL-6.02) |
| `GET` | `/api/ai/injury-risks` | Lấy danh sách điểm nguy cơ chấn thương | SC-6.02 (Bảng nguy cơ) |
| `GET` | `/api/ai/injury-risks/:horseId` | Xem chi tiết yếu tố nguy cơ của ngựa | SC-6.03 (Chi tiết nguy cơ) |
| `POST` | `/api/ai/assistant/chat` | Hỏi đáp với Trợ lý AI (Stream hoặc JSON) | SC-6.04 (Trợ lý AI) |
| `GET` | `/api/ai/summaries` | Danh sách báo cáo tóm tắt định kỳ | SC-6.05 (Tóm tắt & Báo cáo) |

---

## 7. Kế hoạch triển khai & Tích hợp vào Sprint

1. **Giai đoạn 1 (Tuần 1):**
   - Tạo thư mục `src/ai` trong Backend và đăng ký vào `app.module.ts`.
   - Cài đặt `BoundaryValidatorService` và viết Unit Test (Jest) kiểm tra 100% case chặn vi phạm Medical Lock.
2. **Giai đoạn 2 (Tuần 2):**
   - Viết `ContextProjectionService` để lấy dữ liệu 14 ngày của ngựa từ Prisma.
   - Nối LLM Provider (Google Gemini hoặc OpenAI) với prompt ép kiểu JSON.
   - Hoàn thành luồng SC-6.01: Gợi ý giáo án → Áp dụng thành giáo án Nháp ở Flow 2.
3. **Giai đoạn 3 (Tuần 3):**
   - Triển khai thuật toán tính điểm nguy cơ chấn thương (ACWR: Tải 7 ngày / TB 28 ngày) cho SC-6.02.
   - Cài đặt Heading-Aware Chunker cho Trợ lý AI SC-6.04 tra cứu tài liệu `Tai_Lieu/`.
