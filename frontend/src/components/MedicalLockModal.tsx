import React from 'react';
import { Horse } from '../types/training';

interface MedicalLockModalProps {
  isOpen: boolean;
  onClose: () => void;
  horse?: Horse;
}

export const MedicalLockModal: React.FC<MedicalLockModalProps> = ({
  isOpen,
  onClose,
  horse,
}) => {
  if (!isOpen) return null;

  const lockInfo = horse?.medicalLockInfo;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-[4px] animate-in fade-in duration-200">
      {/* Modal Box */}
      <div className="w-full max-w-3xl bg-surface rounded-[10px] border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Burgundy Top Header */}
        <div className="bg-critical-text px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center shrink-0 border border-white/20">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-white text-critical-text uppercase">
                  Cơ chế cưỡng chế (FR-005)
                </span>
                <span className="text-xs text-white/80">Lệnh có hiệu lực tuyệt đối</span>
              </div>
              <h2 className="font-bold text-lg text-white mt-0.5 leading-snug">
                LỆNH CHẶN CƯỠNG CHẾ: Không thể xếp lịch huấn luyện (Medical Lock Active)
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors"
            title="Đóng cửa sổ"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 space-y-5 overflow-y-auto bg-surface">
          {/* Section 1: Horse Identity */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-canvas border border-border">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-critical-bg border border-critical-border flex items-center justify-center text-critical-text font-bold text-lg">
                🐴
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="font-bold text-base text-ink">
                    Chiến mã {horse?.name || 'Hồng Ngọc'}
                  </span>
                  <span className="px-2.5 py-0.5 rounded bg-critical-bg text-critical-text border border-critical-border font-bold text-xs uppercase flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-critical-text"></span>
                    CẤM TẬP LUYỆN
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                  <span>Mã chip: <strong className="text-ink">{horse?.microchipRfid || 'VNM-246813579024'}</strong></span>
                  <span>·</span>
                  <span>Ô chuồng: <strong className="text-ink">{horse?.stall || 'Ô A03'}</strong></span>
                  <span>·</span>
                  <span>{horse?.breed || 'Thuần chủng 4 tuổi'}</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs text-muted block">Tình trạng kiểm soát</span>
              <span className="text-sm font-bold text-critical-text flex items-center justify-end gap-1 mt-0.5">
                Khóa y tế toàn phần
              </span>
            </div>
          </div>

          {/* Section 2: Medical Restriction Diagnosis */}
          <div className="p-4 rounded-lg bg-critical-bg/50 border border-critical-border space-y-3">
            <div className="flex items-center justify-between border-b border-critical-border/50 pb-2">
              <div className="flex items-center gap-2 text-critical-text font-bold text-xs uppercase tracking-wider">
                <span>LÝ DO Y TẾ TỪ BAN THÚ Y CHUYÊN TRÁCH</span>
              </div>
              <span className="text-[11px] font-mono text-critical-text font-semibold bg-white px-2 py-0.5 rounded border border-critical-border">
                Hồ sơ: {lockInfo?.medicalRecordId || 'MED-2025-089A'}
              </span>
            </div>

            <div className="p-3 bg-white rounded border border-critical-border/40 text-ink text-sm leading-relaxed">
              <strong className="text-critical-text block mb-1">Chẩn đoán lâm sàng & siêu âm:</strong>
              {lockInfo?.diagnosis ||
                'Phát hiện tổn thương phù nề gân gấp ngón nông chi trước trái (SDFT strain - Độ II). Cấm hoàn toàn mọi bài tập tốc độ cao và thi đấu đường chạy.'}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
              <div className="p-2.5 rounded bg-white border border-border">
                <span className="text-muted block">Bác sĩ chỉ định khóa:</span>
                <span className="font-semibold text-ink text-sm">
                  {lockInfo?.vetName || 'BS. Lê Thanh Hà'}
                </span>
                <span className="text-[11px] text-muted block">
                  {lockInfo?.vetTitle || 'Trưởng ban Thú y EquiFlow'}
                </span>
              </div>
              <div className="p-2.5 rounded bg-white border border-border">
                <span className="text-muted block">Thời điểm khóa & Dự kiến tái khám:</span>
                <span className="font-semibold text-ink text-sm block">
                  Kích hoạt: {lockInfo?.lockedAt || '15/03/2025 · 08:30 GMT+7'}
                </span>
                <span className="text-warning-text font-semibold block mt-0.5">
                  Lịch tái khám dự kiến: {lockInfo?.expectedUnlockDate || '29/03/2025'}
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: Suspended Sessions List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                <span className="text-critical-text">●</span>
                Danh sách buổi tập hệ thống tự động phong tỏa / đình chỉ (3 buổi)
              </span>
              <span className="text-[11px] text-muted">Quy tắc bảo vệ an toàn động vật FR-005</span>
            </div>

            <div className="border border-border rounded-lg divide-y divide-border overflow-hidden bg-surface">
              {lockInfo?.suspendedSessions?.map((sess) => (
                <div key={sess.id} className="flex items-center justify-between p-3 text-xs bg-canvas/40 hover:bg-canvas">
                  <div className="flex items-start gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-critical-text mt-1"></span>
                    <div>
                      <span className="font-semibold text-ink block">{sess.title}</span>
                      <span className="text-muted text-[11px]">
                        {sess.date} · {sess.time} · {sess.track}
                      </span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-critical-bg text-critical-text font-bold text-[10px] uppercase">
                    Đã hủy bỏ
                  </span>
                </div>
              )) || (
                <div className="p-3 text-xs text-muted text-center">Không có buổi tập xung đột</div>
              )}
            </div>
          </div>

          {/* Section 4: Criteria for Unlock Notice */}
          <div className="p-3 rounded-lg bg-forest-wash border border-forest/20 text-xs text-forest-deep leading-relaxed">
            <strong className="block font-bold text-forest mb-0.5">
              Quy định gỡ bỏ lệnh khóa (Medical Unlock Policy):
            </strong>
            {lockInfo?.criteriaForUnlock ||
              'Chỉ có Bác sĩ thú y phụ trách mới có quyền thực hiện mở khóa (PUT /api/medical/locks/:id/unlock) sau khi kiểm tra tái khám lâm sàng và xác nhận thể lực đạt chuẩn. Huấn luyện viên trưởng và Quản lý câu lạc bộ không có thẩm quyền bypass lệnh khóa này.'}
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="bg-canvas px-6 py-4 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted">
            Mọi thao tác kiểm tra trạng thái đều được lưu vào Audit Trail bất biến.
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              type="button"
              className="px-4 py-2 rounded-btn border border-border bg-white text-ink text-xs font-semibold hover:bg-forest-wash transition-colors"
            >
              Đóng cửa sổ
            </button>
            <button
              onClick={() => {
                alert('Đã gửi thông báo yêu cầu tái khám ưu tiên tới Ban Thú Y.');
                onClose();
              }}
              type="button"
              className="px-4 py-2 rounded-btn bg-forest text-white text-xs font-semibold hover:bg-forest-deep transition-colors shadow-sm"
            >
              Gửi yêu cầu tái khám sớm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
