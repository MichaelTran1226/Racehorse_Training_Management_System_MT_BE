import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SessionEvaluation, EvaluationAssessment } from '../types/training';
import { MOCK_SESSION_EVALUATION } from '../data/mockData';

export const SessionEvaluationPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Load existing or default evaluation
  const [data, setData] = useState<SessionEvaluation>(MOCK_SESSION_EVALUATION);
  const [finishTime, setFinishTime] = useState<number>(data.finishTimeSeconds);
  const [actualDistance, setActualDistance] = useState<number>(data.actualDistanceMeters);
  const [recoveryHeartRate, setRecoveryHeartRate] = useState<number>(data.recoveryHeartRateBpm);
  const [measuredAfter, setMeasuredAfter] = useState<number>(data.measuredAfterMinutes);
  const [assessment, setAssessment] = useState<EvaluationAssessment>(data.assessment);
  const [score, setScore] = useState<number>(data.score);
  const [remarks, setRemarks] = useState<string>(data.trainerRemarks);
  const [isSaved, setIsSaved] = useState<boolean>(false);

  // Dynamic calculated average speed: (meters / seconds) * 3.6
  const calculatedSpeed =
    finishTime > 0 ? Number(((actualDistance / finishTime) * 3.6).toFixed(2)) : 0;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!finishTime || finishTime <= 0) {
      alert('Vui lòng nhập thời gian hoàn thành hợp lệ!');
      return;
    }

    if (!recoveryHeartRate || recoveryHeartRate <= 0) {
      alert('Vui lòng nhập nhịp tim hồi phục sau bài tập!');
      return;
    }

    const updatedData: SessionEvaluation = {
      ...data,
      sessionId: id || data.sessionId,
      finishTimeSeconds: finishTime,
      actualDistanceMeters: actualDistance,
      averageSpeedKmh: calculatedSpeed,
      recoveryHeartRateBpm: recoveryHeartRate,
      measuredAfterMinutes: measuredAfter,
      assessment,
      score,
      trainerRemarks: remarks,
      recordedAt: new Date().toLocaleString('vi-VN'),
    };

    setData(updatedData);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {isSaved && (
        <div className="fixed bottom-6 right-6 z-50 bg-forest text-white px-5 py-3 rounded-panel shadow-xl flex items-center gap-3 animate-in fade-in">
          <span className="text-xl">🏆</span>
          <div>
            <span className="text-sm font-bold block">Đã lưu kết quả thành công!</span>
            <span className="text-xs text-white/80">
              Biểu đồ thể lực và điểm phong độ đã được cập nhật đồng bộ sang hồ sơ ngựa.
            </span>
          </div>
        </div>
      )}

      {/* Screen Identification */}
      <div className="flex items-center justify-between text-xs text-muted border-b border-border/60 pb-2">
        <button
          onClick={() => navigate('/training/schedule')}
          className="text-forest hover:underline flex items-center gap-1 font-semibold"
        >
          ← Quay lại Lịch tập
        </button>
        <span className="font-mono bg-forest-wash text-forest px-2 py-0.5 rounded">
          Task GH-BE-17 (FR-007) · STITCH T04
        </span>
      </div>

      {/* Header */}
      <div>
        <h1 className="font-sans font-bold text-2xl text-forest-deep tracking-tight">
          Kết quả và nhận xét buổi tập (Time Trial Evaluation)
        </h1>
        <p className="text-sm text-muted mt-1 max-w-3xl">
          Nhập kết quả quan sát sau ca chạy thử. Chỉ số được lưu tự động, tính toán tốc độ trung bình, vẽ lại biểu đồ thể lực và đồng bộ sang màn hình của Chủ ngựa.
        </p>
      </div>

      {/* Horse Context Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-surface rounded-panel border border-border shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-forest-wash text-forest font-bold flex items-center justify-center text-xl border border-forest/20">
            🐴
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <strong className="text-lg text-ink font-bold">{data.horseName}</strong>
              <span className="text-xs font-mono text-muted">({data.horseCode})</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-positive-bg text-positive-text border border-positive-text/20">
                Đủ điều kiện
              </span>
            </div>
            <p className="text-xs text-muted mt-1">
              Mã chip: <strong className="text-ink">{data.horseChip}</strong> · Vị trí:{' '}
              <strong className="text-ink">{data.stall}</strong> · Nài chính:{' '}
              <strong className="text-forest">Đỗ Cao Thắng</strong>
            </p>
          </div>
        </div>
        <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-border">
          <span className="text-xs text-muted block">Ca tập đang đánh giá</span>
          <span className="text-sm font-semibold text-forest-deep block">
            {data.sessionDate} · {data.sessionTime}
          </span>
          <span className="text-[11px] text-muted">{data.exerciseTitle}</span>
        </div>
      </div>

      {/* Main 2-Column: Form & Visual Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left 2 Cols: Form Panel */}
        <div className="lg:col-span-2 bg-surface rounded-panel border border-border p-6 shadow-xs space-y-6">
          <div className="border-b border-border pb-3 flex items-center justify-between">
            <h2 className="font-bold text-base text-forest-deep flex items-center gap-2">
              <span>Biểu mẫu ghi nhận chỉ số thực nghiệm</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-forest-wash text-forest">
                Telemetry
              </span>
            </h2>
            <span className="text-xs text-muted">* Bắt buộc nhập</span>
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            {/* Row 1: Finish Time, Distance, Auto Speed */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Finish Time */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-ink" htmlFor="finishTimeInput">
                  Thời gian hoàn thành (giây) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    id="finishTimeInput"
                    step="0.01"
                    min="10"
                    max="600"
                    value={finishTime}
                    onChange={(e) => setFinishTime(Number(e.target.value))}
                    className="w-full h-11 pl-3.5 pr-12 text-sm font-semibold bg-surface border border-border rounded-lg text-ink focus:border-forest focus:ring-1 focus:ring-forest"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted">
                    giây
                  </span>
                </div>
                <span className="text-[11px] text-muted">Ví dụ: 74.35s cho 1200m</span>
              </div>

              {/* Distance */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-ink" htmlFor="actualDistanceInput">
                  Cự ly thực tế (m) *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    id="actualDistanceInput"
                    min="100"
                    max="5000"
                    value={actualDistance}
                    onChange={(e) => setActualDistance(Number(e.target.value))}
                    className="w-full h-11 pl-3.5 pr-12 text-sm font-semibold bg-surface border border-border rounded-lg text-ink focus:border-forest focus:ring-1 focus:ring-forest"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted">
                    m
                  </span>
                </div>
                <span className="text-[11px] text-muted">Kế hoạch: {data.plannedDistanceMeters}m</span>
              </div>

              {/* Auto Speed Display */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-ink">
                  Tốc độ trung bình tính toán
                </label>
                <div className="h-11 px-3.5 bg-forest-wash border border-forest/20 rounded-lg flex items-center justify-between">
                  <span className="font-mono font-bold text-forest text-base">
                    {calculatedSpeed}
                  </span>
                  <span className="text-xs font-semibold text-forest">km/h</span>
                </div>
                <span className="text-[11px] text-positive-text font-medium">
                  ~ {(calculatedSpeed / 3.6).toFixed(1)} m/s (Tự động tính)
                </span>
              </div>
            </div>

            {/* Row 2: Recovery Heart Rate & Measure Interval */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-ink" htmlFor="heartRateInput">
                    Nhịp tim hồi phục (Recovery HR) *
                  </label>
                  <span className="text-xs font-bold text-critical-text flex items-center gap-1">
                    ❤️ Ngưỡng an toàn &lt; 90 bpm
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    id="heartRateInput"
                    min="40"
                    max="220"
                    value={recoveryHeartRate}
                    onChange={(e) => setRecoveryHeartRate(Number(e.target.value))}
                    className="w-full h-11 pl-3.5 pr-14 text-sm font-semibold bg-surface border border-border rounded-lg text-ink focus:border-forest focus:ring-1 focus:ring-forest"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted">
                    bpm
                  </span>
                </div>
                <span className="text-[11px] text-muted">
                  Đo sau khi kết thúc buổi tập và ngâm chân lạnh
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-ink" htmlFor="measuredAfterInput">
                  Thời điểm đo sau khi kết thúc *
                </label>
                <select
                  id="measuredAfterInput"
                  value={measuredAfter}
                  onChange={(e) => setMeasuredAfter(Number(e.target.value))}
                  className="w-full h-11 px-3.5 text-sm bg-surface border border-border rounded-lg text-ink focus:border-forest"
                >
                  <option value={5}>Sau 5 phút (Kiểm tra phản ứng ban đầu)</option>
                  <option value={10}>Sau 10 phút (Chuẩn quy trình quốc tế)</option>
                  <option value={15}>Sau 15 phút (Đánh giá hoàn toàn hồi phục)</option>
                </select>
              </div>
            </div>

            {/* Row 3: Assessment & Rating 1-10 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border">
              {/* Assessment */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-ink" htmlFor="assessmentSelect">
                  Đánh giá tổng quan buổi tập *
                </label>
                <select
                  id="assessmentSelect"
                  value={assessment}
                  onChange={(e) => setAssessment(e.target.value as EvaluationAssessment)}
                  className="w-full h-11 px-3.5 text-sm bg-surface border border-border rounded-lg text-ink focus:border-forest"
                >
                  <option value="excellent">Đạt mục tiêu xuất sắc (Vượt chỉ tiêu tốc độ)</option>
                  <option value="standard">Đạt chuẩn (Đúng kế hoạch giáo án)</option>
                  <option value="needs_adjustment">Cần điều chỉnh (Nhịp tim hồi phục chậm)</option>
                  <option value="aborted">Dừng bài tập vì có bất thường sức khỏe</option>
                </select>
              </div>

              {/* Performance Score 1 - 10 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-ink" htmlFor="scoreInput">
                    Chấm điểm phong độ (Thang 1 - 10) *
                  </label>
                  <span className="font-mono font-bold text-gold-dark text-sm bg-gold/15 px-2 py-0.5 rounded border border-gold/30">
                    {score} / 10 điểm
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    id="scoreInput"
                    min={1}
                    max={10}
                    step={0.5}
                    value={score}
                    onChange={(e) => setScore(Number(e.target.value))}
                    className="flex-1 accent-gold cursor-pointer"
                  />
                  <div className="flex gap-1 text-gold text-sm">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i}>{i < Math.round(score / 2) ? '★' : '☆'}</span>
                    ))}
                  </div>
                </div>
                <span className="text-[11px] text-muted block">
                  {score >= 9
                    ? 'Phong độ đỉnh cao, sẵn sàng giải đấu'
                    : score >= 8
                    ? 'Thể lực tốt, duy trì cường độ'
                    : score >= 7
                    ? 'Đạt yêu cầu cơ bản'
                    : 'Cần theo dõi phục hồi'}
                </span>
              </div>
            </div>

            {/* Row 4: Remarks */}
            <div className="space-y-1.5 pt-2 border-t border-border">
              <label className="block text-xs font-bold text-ink" htmlFor="remarksInput">
                Nhận xét chuyên môn của Huấn luyện viên trưởng *
              </label>
              <textarea
                id="remarksInput"
                rows={4}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Ghi nhận thể lực, dáng phi, phản ứng với roi và chỉ đạo cho đợt tập tiếp theo..."
                className="w-full p-3.5 text-sm bg-surface border border-border rounded-lg text-ink focus:border-forest"
              ></textarea>
              <div className="flex items-center justify-between text-[11px] text-muted">
                <span>Người ký duyệt: Nguyễn Văn Hòa (HLV Trưởng Vận hành)</span>
                <span>{remarks.length}/500 ký tự</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => navigate('/training/schedule')}
                className="px-5 py-2.5 rounded-btn border border-border bg-white text-muted hover:text-ink text-xs font-semibold transition-colors"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-btn bg-forest hover:bg-forest-deep text-white text-xs font-bold transition-all shadow-sm active:scale-[0.98] flex items-center gap-2"
              >
                <span>Lưu kết quả buổi tập</span>
                <span>✓</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right 1 Col: Visual Metric Trend Chart */}
        <div className="space-y-6">
          <div className="bg-surface rounded-panel border border-border p-5 shadow-xs space-y-4">
            <div className="border-b border-border pb-3 flex items-center justify-between">
              <div>
                <h3 className="font-sans font-bold text-sm text-forest-deep">
                  Lịch sử chỉ số đã ghi nhận
                </h3>
                <p className="text-[11px] text-muted">Nhịp tim hồi phục sau 10 phút (5 buổi gần nhất)</p>
              </div>
              <span className="text-xs font-mono font-bold text-forest">bpm</span>
            </div>

            {/* Bar Chart Visualization */}
            <div className="h-44 flex items-end justify-between gap-3 pt-4 px-2 border-b border-border">
              {data.historyPoints.map((pt, idx) => {
                const heightPercent = Math.max(20, Math.min(100, (pt.heartRateBpm / 100) * 100));
                const isCurrent = idx === data.historyPoints.length - 1;

                return (
                  <div key={pt.date} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    <span className="text-[10px] font-mono font-bold text-ink">
                      {pt.heartRateBpm}
                    </span>
                    <div
                      className={`w-full rounded-t transition-all ${
                        isCurrent
                          ? 'bg-forest shadow-xs'
                          : 'bg-forest/40 hover:bg-forest/60'
                      }`}
                      style={{ height: `${heightPercent}%` }}
                    ></div>
                    <span className="text-[10px] text-muted font-mono">{pt.date}</span>
                  </div>
                );
              })}
            </div>

            {/* Trend Analysis */}
            <div className="p-3 rounded-lg bg-forest-wash/80 border border-forest/20 text-xs text-forest-deep space-y-1">
              <span className="font-bold flex items-center gap-1">
                📈 Xu hướng thể lực: Tiến triển xuất sắc
              </span>
              <p className="text-[11px] leading-relaxed text-muted">
                Nhịp tim hồi phục giảm đều từ <strong>86 bpm</strong> xuống <strong>78 bpm</strong> (-9.3%), chứng tỏ dung tích phổi và sức bền cơ tim của Phong Vũ đã thích nghi tốt với cự ly 1.200m.
              </p>
            </div>

            {/* Owner Sync Notice */}
            <div className="text-[11px] text-muted flex items-start gap-2 pt-1">
              <span className="text-forest">ℹ️</span>
              <span>
                Chỉ số và nhận xét sẽ tự động đồng bộ sang màn hình của <strong>Chủ sở hữu ngựa</strong> (Screen O02) theo đúng phân quyền bảo mật.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
