import React from 'react';

interface MedicalLockBannerProps {
  onOpenDetails: () => void;
  horseName?: string;
  horseCode?: string;
  lockId?: string;
  reason?: string;
  vetName?: string;
}

export const MedicalLockBanner: React.FC<MedicalLockBannerProps> = ({
  onOpenDetails,
  horseName = 'Hồng Ngọc',
  horseCode = 'A03',
  lockId = 'MED-LOCK-2025-09',
  reason = 'Viêm gân khoeo trước & Tổn thương phù nề gân SDFT độ II',
  vetName = 'BS. Lê Thanh Hà',
}) => {
  return (
    <div
      className="rounded-panel border p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all shadow-sm"
      style={{
        backgroundColor: '#FAE9EB',
        borderColor: '#F0CCD1',
      }}
    >
      <div className="flex items-start gap-3.5">
        <div className="w-9 h-9 rounded-full bg-critical-text text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-xs uppercase tracking-wide text-critical-text flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-critical-text animate-ping"></span>
              CẢNH BÁO AN TOÀN Y TẾ CẤP CAO (FR-005)
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-white text-critical-text border border-critical-text/30">
              MÃ LỆNH: {lockId}
            </span>
          </div>
          <p className="text-sm text-critical-text mt-1 leading-relaxed">
            Chiến mã <strong className="font-bold underline decoration-critical-text">{horseName} ({horseCode})</strong>{' '}
            đang có <strong>Lệnh Khóa Huấn Luyện (Medical Lock)</strong> do{' '}
            <span className="font-semibold">{vetName}</span> ban hành ({reason}).
            Toàn bộ chức năng xếp lịch tải cao và đăng ký giải đua đã bị{' '}
            <strong>cưỡng chế phong tỏa tự động</strong>.
          </p>
        </div>
      </div>
      <button
        onClick={onOpenDetails}
        type="button"
        className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-btn bg-white text-critical-text border border-critical-text/40 font-semibold text-xs hover:bg-critical-text hover:text-white transition-all shadow-xs active:scale-[0.98]"
      >
        <span>Xem chi tiết lệnh khóa</span>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
        </svg>
      </button>
    </div>
  );
};
