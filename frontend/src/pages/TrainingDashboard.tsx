import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MedicalLockBanner } from '../components/MedicalLockBanner';
import { Horse, WorkoutSession } from '../types/training';

interface TrainingDashboardProps {
  horses: Horse[];
  sessions: WorkoutSession[];
  onOpenMedicalLock: () => void;
}

export const TrainingDashboard: React.FC<TrainingDashboardProps> = ({
  horses,
  sessions,
  onOpenMedicalLock,
}) => {
  const navigate = useNavigate();

  // Filter today's sessions (Thứ Ba)
  const todaySessions = sessions.filter((s) => s.dayOfWeek === 'Thứ Ba');
  const lockedHorse = horses.find((h) => h.isMedicalLocked);

  return (
    <div className="space-y-6">
      {/* Sample Notice from Stitch design */}
      <div className="flex items-center justify-between text-xs text-muted border-b border-border/60 pb-2">
        <span>EquiFlow Management System · Phân hệ Huấn luyện viên trưởng (Flow 2 & Flow 5)</span>
        <span className="font-mono bg-forest-wash text-forest px-2 py-0.5 rounded">
          Màn hình T01 · STITCH DESIGN
        </span>
      </div>

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-sans font-bold text-2xl text-forest-deep tracking-tight">
              Tổng quan huấn luyện
            </h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-forest-wash text-forest border border-forest/20">
              HLV Trưởng
            </span>
          </div>
          <p className="text-sm text-muted mt-1">
            Phân bổ ca tập, kiểm soát an toàn vận động và duyệt chỉ số hồi phục thể lực theo thời gian thực.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/training/schedule')}
            className="h-10 px-4 rounded-btn border border-border bg-surface text-ink hover:bg-forest-wash font-semibold text-xs flex items-center gap-2 transition-colors shadow-xs"
          >
            <svg className="w-4 h-4 text-forest" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span>Xem lịch tuần</span>
          </button>
          <button
            onClick={() => navigate('/training/plans')}
            className="h-10 px-4 rounded-btn bg-forest hover:bg-forest-deep text-white font-semibold text-xs flex items-center gap-2 shadow-sm transition-colors active:scale-[0.98]"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>+ Lập giáo án mới</span>
          </button>
        </div>
      </div>

      {/* Critical Medical Lock Banner (Task GH-BE-15 / FR-005) */}
      {lockedHorse && (
        <MedicalLockBanner
          onOpenDetails={onOpenMedicalLock}
          horseName={lockedHorse.name}
          horseCode={lockedHorse.code}
          lockId={lockedHorse.medicalLockInfo?.lockId}
          reason={lockedHorse.medicalLockInfo?.diagnosis}
          vetName={lockedHorse.medicalLockInfo?.vetName}
        />
      )}

      {/* 4 Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="bg-surface rounded-panel border border-border p-4.5 flex flex-col justify-between shadow-xs hover:border-forest/40 transition-colors">
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Ngựa đang huấn luyện
            </span>
            <div className="w-8 h-8 rounded-lg bg-forest-wash flex items-center justify-center text-forest">
              🐴
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-ink leading-none">
              {horses.length}
            </span>
            <span className="text-xs text-muted">chiến mã trong biên chế</span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between text-xs">
            <span className="text-positive-text flex items-center gap-1 font-semibold">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              5 cá thể đạt chuẩn Fit
            </span>
            <span className="text-muted">100% chỉ tiêu</span>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-surface rounded-panel border border-border p-4.5 flex flex-col justify-between shadow-xs hover:border-forest/40 transition-colors">
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Buổi tập hôm nay
            </span>
            <div className="w-8 h-8 rounded-lg bg-forest-wash flex items-center justify-center text-forest">
              ⏱️
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-ink leading-none">
              {todaySessions.length}
            </span>
            <span className="text-xs text-muted">ca theo thời khóa biểu</span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between text-xs">
            <div className="w-full flex items-center gap-2">
              <div className="flex-1 bg-surface-container rounded-full h-1.5 overflow-hidden">
                <div className="bg-forest h-1.5 rounded-full" style={{ width: '50%' }}></div>
              </div>
              <span className="font-semibold text-ink whitespace-nowrap">2/4 ca (50%)</span>
            </div>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-surface rounded-panel border border-border p-4.5 flex flex-col justify-between shadow-xs hover:border-gold/50 transition-colors">
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Chờ chấm điểm sau ca
            </span>
            <div className="w-8 h-8 rounded-lg bg-warning-bg flex items-center justify-center text-warning-text">
              📋
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-warning-text leading-none">
              1
            </span>
            <span className="text-xs text-muted">cá thể cần duyệt chỉ số</span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between text-xs">
            <button
              onClick={() => navigate('/training/sessions/sess-tue-1')}
              className="text-forest hover:underline font-semibold flex items-center gap-1"
            >
              Duyệt ngay: Phong Vũ (A01) →
            </button>
            <span className="text-muted">Ca sáng</span>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-surface rounded-panel border border-border p-4.5 flex flex-col justify-between shadow-xs hover:border-critical-border transition-colors">
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-critical-text">
              Lệnh Khóa Y Tế
            </span>
            <div className="w-8 h-8 rounded-lg bg-critical-bg flex items-center justify-center text-critical-text">
              🔒
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-critical-text leading-none">
              1
            </span>
            <span className="text-xs text-muted">cá thể phong tỏa</span>
          </div>
          <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between text-xs">
            <button
              onClick={onOpenMedicalLock}
              className="text-critical-text hover:underline font-semibold flex items-center gap-1"
            >
              Hồng Ngọc (A03)
            </button>
            <span className="text-critical-text font-bold">CẤM CHẠY NƯỚC RÚT</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Today Sessions + Horse Fitness Ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left 2 Cols: Today's Training Schedule Roster */}
        <div className="lg:col-span-2 bg-surface rounded-panel border border-border p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3.5">
            <div>
              <h2 className="font-sans font-bold text-base text-forest-deep flex items-center gap-2">
                <span>Lịch tập ca hôm nay (Thứ Ba, 11/03)</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-forest-wash text-forest">
                  Thời khóa biểu sân chạy
                </span>
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Các lượt chạy thử Time Trial và rèn thể lực được điều phối theo ca sáng / chiều
              </p>
            </div>
            <button
              onClick={() => navigate('/training/schedule')}
              className="text-xs font-semibold text-forest hover:text-forest-deep hover:underline flex items-center gap-1"
            >
              Xem toàn bộ tuần →
            </button>
          </div>

          {/* Sessions List */}
          <div className="space-y-3">
            {todaySessions.map((session) => {
              const isLocked = session.isMedicalLocked;
              return (
                <div
                  key={session.id}
                  className={`p-4 rounded-lg border transition-all ${
                    isLocked
                      ? 'bg-critical-bg/30 border-critical-border/60'
                      : session.status === 'in_progress'
                      ? 'bg-forest-wash/40 border-forest/30 shadow-xs'
                      : 'bg-canvas/50 border-border hover:bg-canvas'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 mt-0.5 ${
                          isLocked
                            ? 'bg-critical-bg text-critical-text border border-critical-border'
                            : 'bg-forest-deep text-gold border border-gold/30'
                        }`}
                      >
                        {session.horseCode}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-ink">
                            {session.horseName}
                          </span>
                          <span className="text-xs text-muted font-mono">
                            ({session.stall})
                          </span>
                          {/* Status Badge */}
                          {isLocked ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-critical-text text-white flex items-center gap-1">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path
                                  fillRule="evenodd"
                                  d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              ĐÌNH CHỈ BỞI VET
                            </span>
                          ) : session.status === 'in_progress' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-forest text-white flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-gold animate-ping"></span>
                              ĐANG DIỄN RA
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-surface border border-border text-muted">
                              ĐÃ LÊN LỊCH
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-ink-light font-medium mt-1">
                          {session.exerciseTitle}
                        </p>
                        <div className="flex items-center gap-4 mt-1.5 text-xs text-muted flex-wrap">
                          <span>
                            Khung giờ: <strong className="text-ink">{session.timeSlot}</strong>
                          </span>
                          <span>·</span>
                          <span>
                            Cự ly: <strong className="text-ink">{session.distanceMeters}m</strong>
                          </span>
                          <span>·</span>
                          <span>
                            Mặt sân:{' '}
                            <strong className="text-ink capitalize">
                              {session.trackType === 'turf' ? 'Cỏ Turf' : session.trackType === 'dirt' ? 'Cát Dirt' : 'Tổng hợp'}
                            </strong>
                          </span>
                          <span>·</span>
                          <span>
                            Nài: <strong className="text-forest">{session.jockeyName}</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0">
                      {isLocked ? (
                        <button
                          onClick={onOpenMedicalLock}
                          className="px-3 py-1.5 rounded-btn bg-white border border-critical-border text-critical-text hover:bg-critical-bg text-xs font-semibold transition-colors"
                        >
                          Chi tiết khóa y tế
                        </button>
                      ) : (
                        <button
                          onClick={() => navigate(`/training/sessions/${session.id}`)}
                          className="px-3 py-1.5 rounded-btn bg-forest hover:bg-forest-deep text-white text-xs font-semibold transition-colors shadow-xs"
                        >
                          Ghi nhận & Chấm điểm
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 1 Col: Top Fitness Rankings & Safe Fleet Breakdown */}
        <div className="space-y-6">
          {/* Top Fitness Ranking */}
          <div className="bg-surface rounded-panel border border-border p-5 shadow-xs space-y-4">
            <div className="border-b border-border pb-3 flex items-center justify-between">
              <h3 className="font-sans font-bold text-sm text-forest-deep flex items-center gap-2">
                <span>Top Thể Lực Đàn Ngựa</span>
                <span className="text-gold">★</span>
              </h3>
              <span className="text-[11px] text-muted">Fitness Index</span>
            </div>

            <div className="space-y-3">
              {horses
                .filter((h) => !h.isMedicalLocked)
                .slice(0, 5)
                .map((horse, idx) => (
                  <div key={horse.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-forest-wash text-forest text-[11px] font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="font-semibold text-ink">{horse.name}</span>
                        <span className="text-muted text-[11px]">({horse.code})</span>
                      </div>
                      <span className="font-mono font-bold text-forest text-xs">
                        {horse.fitnessScore}/100
                      </span>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-forest h-1.5 rounded-full transition-all"
                        style={{ width: `${horse.fitnessScore}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
            </div>

            <div className="pt-2 border-t border-border text-[11px] text-muted">
              Đánh giá dựa trên nhịp tim hồi phục sau ca, tốc độ trung bình cự ly 1.200m và chỉ số lactate.
            </div>
          </div>

          {/* Quick Actions Card */}
          <div className="bg-forest-wash/80 rounded-panel border border-forest/20 p-5 space-y-3">
            <h3 className="font-sans font-bold text-sm text-forest-deep">
              Lối tắt tác vụ HLV
            </h3>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => navigate('/training/plans')}
                className="w-full text-left p-2.5 rounded-lg bg-white border border-forest/20 hover:border-forest text-xs font-semibold text-ink flex items-center justify-between transition-colors shadow-xs"
              >
                <span className="flex items-center gap-2">
                  <span className="text-forest">📋</span> Lập kế hoạch giáo án chu kỳ
                </span>
                <span className="text-forest">→</span>
              </button>
              <button
                onClick={() => navigate('/training/schedule')}
                className="w-full text-left p-2.5 rounded-lg bg-white border border-forest/20 hover:border-forest text-xs font-semibold text-ink flex items-center justify-between transition-colors shadow-xs"
              >
                <span className="flex items-center gap-2">
                  <span className="text-forest">📅</span> Điều phối lịch tập & nài
                </span>
                <span className="text-forest">→</span>
              </button>
              <button
                onClick={() => navigate('/training/sessions/sess-tue-1')}
                className="w-full text-left p-2.5 rounded-lg bg-white border border-forest/20 hover:border-forest text-xs font-semibold text-ink flex items-center justify-between transition-colors shadow-xs"
              >
                <span className="flex items-center gap-2">
                  <span className="text-forest">⏱️</span> Báo cáo kết quả chạy thử
                </span>
                <span className="text-forest">→</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
