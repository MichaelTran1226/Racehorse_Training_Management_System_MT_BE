import React, { useState } from 'react';
import { Horse, TrainingPlan, TrainingPhase, TrackType, IntensityLevel } from '../types/training';

interface TrainingPlansProps {
  horses: Horse[];
  plans: TrainingPlan[];
  onCreatePlan: (newPlan: TrainingPlan) => void;
  onOpenMedicalLock: () => void;
}

export const TrainingPlans: React.FC<TrainingPlansProps> = ({
  horses,
  plans,
  onCreatePlan,
  onOpenMedicalLock,
}) => {
  // Form State
  const [selectedHorseId, setSelectedHorseId] = useState<string>(horses[0]?.id || 'pv123');
  const [phase, setPhase] = useState<TrainingPhase>('endurance');
  const [startDate, setStartDate] = useState<string>('2025-03-15');
  const [endDate, setEndDate] = useState<string>('2025-04-05');
  const [trackType, setTrackType] = useState<TrackType>('turf');
  const [distanceMeters, setDistanceMeters] = useState<number>(1200);
  const [jockeyWeightKg, setJockeyWeightKg] = useState<number>(52.0);
  const [targetSpeedKmh, setTargetSpeedKmh] = useState<number>(58.5);
  const [intensity, setIntensity] = useState<IntensityLevel>('medium');
  const [maxHeartRateBpm, setMaxHeartRateBpm] = useState<number>(210);
  const [tacticalNotes, setTacticalNotes] = useState<string>(
    'Giữ nhịp canter đều đặn ở 800m đầu tiên, tránh kích gậy sớm. Đoạn 400m cuối yêu cầu nài ghìm cương chuyển nước đại gallop tăng dần tốc độ theo cột mốc. Sau bài tập: Groom dắt thả lỏng 20 phút, chườm lạnh gân khoeo chân trước trong 15 phút.'
  );

  // Filter & Search State for plans list
  const [filterPhase, setFilterPhase] = useState<string>('all');
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const selectedHorse = horses.find((h) => h.id === selectedHorseId);
  const isHorseLocked = selectedHorse?.isMedicalLocked || false;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (isHorseLocked) {
      alert(
        `LỖI CHẶN AN TOÀN (FR-005): Chiến mã ${selectedHorse?.name} đang chịu Lệnh Khóa Huấn Luyện từ Bác sĩ Thú y (${selectedHorse?.medicalLockInfo?.diagnosis}). Không thể ban hành giáo án huấn luyện mới!`
      );
      return;
    }

    if (distanceMeters < 100 || distanceMeters > 3000) {
      alert('Cự ly huấn luyện phải nằm trong khoảng từ 100m đến 3000m!');
      return;
    }

    if (jockeyWeightKg < 45 || jockeyWeightKg > 65) {
      alert('Khối lượng nài phải nằm trong quy chuẩn từ 45kg đến 65kg!');
      return;
    }

    const newPlan: TrainingPlan = {
      id: `plan-${Date.now()}`,
      title: `Giáo án ${phase.toUpperCase()} (${selectedHorse?.name})`,
      horseId: selectedHorseId,
      horseName: selectedHorse?.name || 'Chiến mã',
      horseCode: selectedHorse?.code || 'A00',
      phase,
      startDate,
      endDate,
      distanceMeters,
      jockeyWeightKg,
      intensity,
      trackType,
      targetSpeedKmh,
      maxHeartRateBpm,
      tacticalNotes,
      status: 'active',
      createdAt: new Date().toISOString().split('T')[0],
    };

    onCreatePlan(newPlan);
    setSuccessToast(`Đã ban hành thành công giáo án huấn luyện cho chiến mã ${selectedHorse?.name}!`);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const filteredPlans = plans.filter((p) => {
    if (filterPhase !== 'all' && p.phase !== filterPhase) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-forest text-white px-5 py-3 rounded-panel shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5">
          <svg className="w-5 h-5 text-gold" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-sm font-semibold">{successToast}</span>
        </div>
      )}

      {/* Screen Identification / Notice */}
      <div className="flex items-center justify-between text-xs text-muted border-b border-border/60 pb-2">
        <div className="flex items-center gap-2">
          <span>Lịch tập luyện</span>
          <span>›</span>
          <span className="font-semibold text-ink">Lập kế hoạch giáo án</span>
        </div>
        <span className="font-mono bg-forest-wash text-forest px-2 py-0.5 rounded">
          Task GH-BE-14 (FR-004) · STITCH T02
        </span>
      </div>

      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-sans font-bold text-2xl text-forest-deep tracking-tight">
            Lập giáo án huấn luyện theo giai đoạn
          </h1>
          <p className="text-sm text-muted mt-1 max-w-3xl">
            Thiết lập mục tiêu cự ly (100-3000m), khối lượng nài (45-65kg), tốc độ và cường độ theo chu kỳ thể lực của chiến mã. Đảm bảo quy chuẩn an toàn trước khi ban hành cho kíp nài.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-positive-bg text-positive-text border border-positive-text/20">
            <span className="w-2 h-2 rounded-full bg-positive-text animate-pulse"></span>
            Phòng Huấn luyện: Sẵn sàng
          </span>
        </div>
      </div>

      {/* Standard Rules & Medical Lock Alert Box */}
      <div className="bg-surface rounded-panel border border-border p-4 flex items-start gap-3.5 shadow-xs">
        <div className="w-9 h-9 rounded-lg bg-warning-bg flex items-center justify-center text-warning-text shrink-0 mt-0.5">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
        </div>
        <div className="flex-1 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-bold text-ink text-xs uppercase tracking-wide">
              Quy chuẩn kiểm soát an toàn thể lực & Khóa Y tế (Medical Lock Enforcement)
            </span>
          </div>
          <p className="text-muted text-xs mt-1 leading-relaxed">
            Hệ thống EquiFlow áp dụng cơ chế bảo vệ kép: <strong>Khóa Y tế</strong> sẽ tự động kích hoạt nếu chiến mã đang có chỉ định chấn thương, sốt, hoặc bị bác sĩ thú y phong tỏa cách ly. Giáo án huấn luyện lập mới sẽ <strong>bị chặn lưu tuyệt đối</strong> nếu chiến mã đang chịu lệnh Medical Lock.
          </p>
        </div>
      </div>

      {/* Main 2-Column Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* ================= COLUMN 1: TARGET HORSE & CYCLE ================= */}
          <div className="bg-surface rounded-panel border border-border p-6 space-y-5 shadow-xs">
            <div className="border-b border-border pb-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-forest-wash flex items-center justify-center text-forest font-bold text-sm">
                  1
                </div>
                <h2 className="font-bold text-base text-forest-deep">
                  Đối tượng & Chu kỳ áp dụng
                </h2>
              </div>
              <span className="text-xs text-muted">Bước 1/2</span>
            </div>

            {/* Field: Chọn chiến mã */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-ink" htmlFor="horseSelect">
                Chiến mã tham gia huấn luyện <span className="text-critical-text">*</span>
              </label>
              <div className="relative">
                <select
                  id="horseSelect"
                  value={selectedHorseId}
                  onChange={(e) => setSelectedHorseId(e.target.value)}
                  className={`w-full h-11 pl-3.5 pr-10 text-sm bg-surface border rounded-lg appearance-none cursor-pointer focus:outline-none transition-colors ${
                    isHorseLocked
                      ? 'border-critical-border bg-critical-bg/20 text-critical-text font-semibold'
                      : 'border-border text-ink focus:border-forest focus:ring-1 focus:ring-forest'
                  }`}
                >
                  {horses.map((horse) => (
                    <option
                      key={horse.id}
                      value={horse.id}
                      disabled={horse.isMedicalLocked}
                      className={horse.isMedicalLocked ? 'text-critical-text bg-critical-bg font-semibold' : ''}
                    >
                      {horse.name} ({horse.code}) — Chip: {horse.microchipRfid} — {horse.stall}{' '}
                      {horse.isMedicalLocked ? '🔒 [BỊ KHÓA Y TẾ - CẤM TẬP]' : '✓ [Đủ điều kiện]'}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted">
                  ▼
                </div>
              </div>

              {/* Dynamic Context Card based on selected horse */}
              {isHorseLocked ? (
                <div className="p-3 bg-critical-bg rounded-lg border border-critical-border flex items-center justify-between text-xs mt-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-critical-text text-base">🚫</span>
                    <div>
                      <span className="font-bold text-critical-text block">
                        CẢNH BÁO: CHIẾN MÃ ĐANG BỊ KHÓA Y TẾ!
                      </span>
                      <span className="text-critical-text/80 text-[11px] block">
                        {selectedHorse?.medicalLockInfo?.diagnosis}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onOpenMedicalLock}
                    className="px-2.5 py-1 rounded bg-white text-critical-text font-bold text-[11px] border border-critical-border hover:bg-critical-text hover:text-white transition-colors"
                  >
                    Xem lý do
                  </button>
                </div>
              ) : (
                <div className="p-3 bg-forest-wash rounded-lg border border-forest/20 flex items-center justify-between text-xs mt-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-positive-text text-base">✓</span>
                    <div>
                      <span className="font-bold text-ink">
                        Thể trạng: Tuyệt hảo ({selectedHorse?.fitnessScore}/100)
                      </span>
                      <span className="text-muted block text-[11px]">
                        Bác sĩ phụ trách: {selectedHorse?.vetName} (Ký duyệt đủ điều kiện)
                      </span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-positive-bg text-positive-text font-bold text-[11px]">
                    Hợp lệ
                  </span>
                </div>
              )}
            </div>

            {/* Field: Chọn Giai đoạn huấn luyện chu kỳ */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-ink">
                Giai đoạn huấn luyện chu kỳ <span className="text-critical-text">*</span>
              </label>
              <div className="grid grid-cols-1 gap-2.5">
                {[
                  {
                    value: 'foundation' as TrainingPhase,
                    title: 'Cơ bản',
                    badge: 'Giai đoạn I',
                    desc: 'Thích nghi & Xây dựng nền tảng cơ bắp, vận động nhẹ thả lỏng.',
                  },
                  {
                    value: 'endurance' as TrainingPhase,
                    title: 'Tăng sức bền (Endurance)',
                    badge: 'Giai đoạn II',
                    desc: 'Nâng dung tích phổi, cự ly dài ổn định, nhịp tim đều đặn có kiểm soát.',
                  },
                  {
                    value: 'speed' as TrainingPhase,
                    title: 'Tốc độ (Speed work)',
                    badge: 'Giai đoạn III',
                    desc: 'Nước rút & Bứt phá đoạn ngắn, kích hoạt sợi cơ co rút nhanh.',
                  },
                  {
                    value: 'tapering' as TrainingPhase,
                    title: 'Trước giải đấu (Tapering)',
                    badge: 'Giai đoạn IV',
                    desc: 'Điểm rơi phong độ, giảm khối lượng duy trì cường độ cao, phục hồi thần kinh.',
                  },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      phase === opt.value
                        ? 'border-2 border-forest bg-forest-wash/60 shadow-xs'
                        : 'border-border bg-surface hover:bg-forest-wash/30'
                    }`}
                  >
                    <input
                      type="radio"
                      name="training_phase"
                      value={opt.value}
                      checked={phase === opt.value}
                      onChange={() => setPhase(opt.value)}
                      className="mt-1 text-forest focus:ring-forest"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-bold ${phase === opt.value ? 'text-forest' : 'text-ink'}`}>
                          {opt.title}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                            phase === opt.value ? 'bg-forest text-white' : 'bg-surface-container text-muted'
                          }`}
                        >
                          {opt.badge}
                        </span>
                      </div>
                      <p className="text-xs text-muted mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Field: Ngày bắt đầu & kết thúc */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink" htmlFor="startDate">
                  Ngày bắt đầu <span className="text-critical-text">*</span>
                </label>
                <input
                  type="date"
                  id="startDate"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full h-11 px-3 text-sm bg-surface border border-border rounded-lg text-ink focus:border-forest focus:ring-1 focus:ring-forest"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink" htmlFor="endDate">
                  Ngày kết thúc <span className="text-critical-text">*</span>
                </label>
                <input
                  type="date"
                  id="endDate"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full h-11 px-3 text-sm bg-surface border border-border rounded-lg text-ink focus:border-forest focus:ring-1 focus:ring-forest"
                />
                <span className="text-[11px] text-positive-text font-medium block">
                  Chu kỳ 21 ngày (3 tuần)
                </span>
              </div>
            </div>

            {/* Field: Loại mặt sân tập */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-ink">
                Mặt sân tập chính <span className="text-critical-text">*</span>
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'turf' as TrackType, name: 'Cỏ Turf', desc: 'Cỏ tự nhiên', icon: '🌿' },
                  { id: 'dirt' as TrackType, name: 'Cát Dirt', desc: 'Đường cát', icon: '🏜️' },
                  { id: 'synthetic' as TrackType, name: 'Synthetic', desc: 'Tổng hợp', icon: '🏟️' },
                ].map((track) => (
                  <label
                    key={track.id}
                    className={`border rounded-lg p-3 text-center cursor-pointer flex flex-col items-center gap-1 transition-all ${
                      trackType === track.id
                        ? 'border-2 border-forest bg-forest-wash text-forest font-bold shadow-xs'
                        : 'border-border bg-surface text-ink hover:bg-forest-wash/30'
                    }`}
                  >
                    <input
                      type="radio"
                      name="track_type"
                      value={track.id}
                      checked={trackType === track.id}
                      onChange={() => setTrackType(track.id)}
                      className="sr-only"
                    />
                    <span className="text-xl">{track.icon}</span>
                    <span className="text-xs">{track.name}</span>
                    <span className="text-[10px] text-muted">{track.desc}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* ================= COLUMN 2: LOAD PARAMETERS & TACTICAL ================= */}
          <div className="bg-surface rounded-panel border border-border p-6 space-y-5 shadow-xs">
            <div className="border-b border-border pb-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-md bg-forest-wash flex items-center justify-center text-forest font-bold text-sm">
                  2
                </div>
                <h2 className="font-bold text-base text-forest-deep">
                  Chỉ số tải trọng & Chỉ đạo chiến thuật
                </h2>
              </div>
              <span className="text-xs text-muted">Bước 2/2</span>
            </div>

            {/* Cự ly mục tiêu & Khối lượng nài */}
            <div className="grid grid-cols-2 gap-4">
              {/* Distance: 100 - 3000m */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-ink" htmlFor="distanceInput">
                    Mục tiêu cự ly <span className="text-critical-text">*</span>
                  </label>
                  <span className="text-[11px] font-mono text-forest font-bold">100 - 3000m</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    id="distanceInput"
                    min={100}
                    max={3000}
                    step={50}
                    value={distanceMeters}
                    onChange={(e) => setDistanceMeters(Number(e.target.value))}
                    className="w-full h-11 pl-3.5 pr-14 text-sm font-semibold bg-surface border border-border rounded-lg text-ink focus:border-forest focus:ring-1 focus:ring-forest"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-xs font-semibold">
                    mét
                  </span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={3000}
                  step={50}
                  value={distanceMeters}
                  onChange={(e) => setDistanceMeters(Number(e.target.value))}
                  className="w-full accent-forest cursor-pointer"
                />
              </div>

              {/* Jockey Weight: 45 - 65kg */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-ink" htmlFor="weightInput">
                    Khối lượng nài <span className="text-critical-text">*</span>
                  </label>
                  <span className="text-[11px] font-mono text-forest font-bold">45 - 65kg</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    id="weightInput"
                    min={45}
                    max={65}
                    step={0.5}
                    value={jockeyWeightKg}
                    onChange={(e) => setJockeyWeightKg(Number(e.target.value))}
                    className="w-full h-11 pl-3.5 pr-14 text-sm font-semibold bg-surface border border-border rounded-lg text-ink focus:border-forest focus:ring-1 focus:ring-forest"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-xs font-semibold">
                    kg
                  </span>
                </div>
                <input
                  type="range"
                  min={45}
                  max={65}
                  step={0.5}
                  value={jockeyWeightKg}
                  onChange={(e) => setJockeyWeightKg(Number(e.target.value))}
                  className="w-full accent-forest cursor-pointer"
                />
              </div>
            </div>

            {/* Cường độ tập luyện Dropdown */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-ink" htmlFor="intensitySelect">
                Cường độ tập luyện <span className="text-critical-text">*</span>
              </label>
              <select
                id="intensitySelect"
                value={intensity}
                onChange={(e) => setIntensity(e.target.value as IntensityLevel)}
                className="w-full h-11 px-3.5 text-sm bg-surface border border-border rounded-lg text-ink focus:border-forest focus:ring-1 focus:ring-forest cursor-pointer"
              >
                <option value="light">Nhẹ 50% — Vận động thích ứng, phục hồi cơ bản</option>
                <option value="medium">Vừa 70% — Tăng tải có kiểm soát (Khuyến nghị cho Giai đoạn II)</option>
                <option value="high">Nặng 85% — Cận ngưỡng lactate, rèn sức mạnh bứt phá</option>
                <option value="max">Tối đa 100% — Mô phỏng điều kiện thi đấu chính thức</option>
              </select>
            </div>

            {/* Tốc độ mục tiêu & Nhịp tim trần */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink" htmlFor="speedInput">
                  Tốc độ mục tiêu
                </label>
                <div className="relative">
                  <input
                    type="number"
                    id="speedInput"
                    min={20}
                    max={75}
                    step={0.5}
                    value={targetSpeedKmh}
                    onChange={(e) => setTargetSpeedKmh(Number(e.target.value))}
                    className="w-full h-11 pl-3.5 pr-14 text-sm font-semibold bg-surface border border-border rounded-lg text-ink focus:border-forest focus:ring-1 focus:ring-forest"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-xs font-semibold">
                    km/h
                  </span>
                </div>
                <span className="text-[11px] text-muted block">
                  ~ {(targetSpeedKmh / 3.6).toFixed(1)} m/s
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink" htmlFor="maxHeartRate">
                  Nhịp tim trần an toàn
                </label>
                <div className="relative">
                  <input
                    type="number"
                    id="maxHeartRate"
                    min={150}
                    max={240}
                    value={maxHeartRateBpm}
                    onChange={(e) => setMaxHeartRateBpm(Number(e.target.value))}
                    className="w-full h-11 pl-3.5 pr-14 text-sm font-semibold bg-surface border border-border rounded-lg text-ink focus:border-forest focus:ring-1 focus:ring-forest"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-xs font-semibold">
                    bpm
                  </span>
                </div>
                <span className="text-[11px] text-critical-text font-medium block">
                  Cảnh báo rung nài khi &gt; {maxHeartRateBpm} bpm
                </span>
              </div>
            </div>

            {/* Ghi chú chiến thuật & Chỉ đạo nài */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-ink" htmlFor="tacticalNotes">
                Ghi chú chiến thuật & Chỉ đạo kíp nài / Groom
              </label>
              <textarea
                id="tacticalNotes"
                rows={4}
                value={tacticalNotes}
                onChange={(e) => setTacticalNotes(e.target.value)}
                placeholder="Nhập chỉ dẫn phân bổ sức, bước phi, điều kiện bứt tốc vòng cua..."
                className="w-full p-3 text-sm bg-surface border border-border rounded-lg text-ink focus:border-forest focus:ring-1 focus:ring-forest"
              ></textarea>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-border flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setDistanceMeters(1200);
                  setJockeyWeightKg(52);
                  setTacticalNotes('');
                }}
                className="px-4 py-2.5 rounded-btn border border-border bg-white text-muted hover:text-ink text-xs font-semibold transition-colors"
              >
                Đặt lại
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => alert('Đã lưu bản nháp giáo án vào hệ thống.')}
                  className="px-4 py-2.5 rounded-btn border border-border bg-white text-forest text-xs font-semibold hover:bg-forest-wash transition-colors"
                >
                  Lưu nháp
                </button>
                <button
                  type="submit"
                  disabled={isHorseLocked}
                  className={`px-5 py-2.5 rounded-btn text-xs font-bold transition-all shadow-sm flex items-center gap-2 ${
                    isHorseLocked
                      ? 'bg-muted/40 text-muted cursor-not-allowed border border-border'
                      : 'bg-forest hover:bg-forest-deep text-white active:scale-[0.98]'
                  }`}
                >
                  {isHorseLocked ? '🔒 Bị chặn bởi Medical Lock' : 'Ban hành giáo án'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* ================= EXISTING PLANS LIST SECTION ================= */}
      <div className="bg-surface rounded-panel border border-border p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3.5">
          <div>
            <h2 className="font-sans font-bold text-base text-forest-deep">
              Danh mục giáo án đang áp dụng ({plans.length})
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Tra cứu các giáo án huấn luyện theo từng chu kỳ và chiến mã trong câu lạc bộ
            </p>
          </div>
          {/* Phase Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted font-medium">Lọc giai đoạn:</span>
            <select
              value={filterPhase}
              onChange={(e) => setFilterPhase(e.target.value)}
              className="h-8 px-2.5 text-xs bg-canvas border border-border rounded-lg text-ink focus:border-forest"
            >
              <option value="all">Tất cả giai đoạn</option>
              <option value="foundation">Cơ bản (Phase I)</option>
              <option value="endurance">Tăng sức bền (Phase II)</option>
              <option value="speed">Tốc độ (Phase III)</option>
              <option value="tapering">Trước giải (Phase IV)</option>
            </select>
          </div>
        </div>

        {/* Plans Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-canvas/70 text-muted font-semibold uppercase tracking-wider">
                <th className="py-3 px-3.5">Chiến mã</th>
                <th className="py-3 px-3.5">Tiêu đề giáo án</th>
                <th className="py-3 px-3.5">Giai đoạn</th>
                <th className="py-3 px-3.5">Cự ly & Tải nài</th>
                <th className="py-3 px-3.5">Mặt sân</th>
                <th className="py-3 px-3.5">Cường độ</th>
                <th className="py-3 px-3.5">Thời hạn</th>
                <th className="py-3 px-3.5 text-right">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredPlans.map((plan) => (
                <tr key={plan.id} className="hover:bg-forest-wash/20 transition-colors">
                  <td className="py-3 px-3.5 font-bold text-ink">
                    {plan.horseName}{' '}
                    <span className="text-muted font-mono font-normal">({plan.horseCode})</span>
                  </td>
                  <td className="py-3 px-3.5 font-medium text-ink-light">{plan.title}</td>
                  <td className="py-3 px-3.5">
                    <span className="px-2 py-0.5 rounded bg-forest-wash text-forest font-semibold capitalize">
                      {plan.phase === 'foundation'
                        ? 'Cơ bản'
                        : plan.phase === 'endurance'
                        ? 'Sức bền'
                        : plan.phase === 'speed'
                        ? 'Tốc độ'
                        : 'Trước giải'}
                    </span>
                  </td>
                  <td className="py-3 px-3.5">
                    <span className="font-semibold text-ink">{plan.distanceMeters}m</span> ·{' '}
                    <span className="text-muted">{plan.jockeyWeightKg}kg</span>
                  </td>
                  <td className="py-3 px-3.5 capitalize text-ink">
                    {plan.trackType === 'turf' ? 'Cỏ Turf' : plan.trackType === 'dirt' ? 'Cát Dirt' : 'Synthetic'}
                  </td>
                  <td className="py-3 px-3.5">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        plan.intensity === 'high' || plan.intensity === 'max'
                          ? 'bg-warning-bg text-warning-text'
                          : 'bg-positive-bg text-positive-text'
                      }`}
                    >
                      {plan.intensity}
                    </span>
                  </td>
                  <td className="py-3 px-3.5 text-muted">
                    {plan.startDate} → {plan.endDate}
                  </td>
                  <td className="py-3 px-3.5 text-right">
                    <span
                      className={`px-2.5 py-0.5 rounded-full font-semibold text-[11px] ${
                        plan.status === 'active'
                          ? 'bg-positive-bg text-positive-text border border-positive-text/20'
                          : 'bg-surface-container text-muted'
                      }`}
                    >
                      {plan.status === 'active' ? 'Đang áp dụng' : 'Bản nháp'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
