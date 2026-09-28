import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Horse,
  Jockey,
  Groom,
  WorkoutSession,
  TrackType,
  IntensityLevel,
  SessionShift,
} from '../types/training';

interface TrainingScheduleProps {
  horses: Horse[];
  jockeys: Jockey[];
  grooms: Groom[];
  sessions: WorkoutSession[];
  onAddSession: (session: WorkoutSession) => void;
  onOpenMedicalLock: () => void;
}

export const TrainingSchedule: React.FC<TrainingScheduleProps> = ({
  horses,
  jockeys,
  grooms,
  sessions,
  onAddSession,
  onOpenMedicalLock,
}) => {
  const navigate = useNavigate();

  // Filters
  const [filterTrack, setFilterTrack] = useState<string>('all');
  const [filterJockey, setFilterJockey] = useState<string>('all');
  const [filterHorse, setFilterHorse] = useState<string>('all');

  // Modal State for New Workout (T03-CREATE)
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [newDay, setNewDay] = useState<string>('Thứ Ba');
  const [newDate, setNewDate] = useState<string>('2025-03-11');
  const [newShift, setNewShift] = useState<SessionShift>('morning');
  const [newTimeSlot, setNewTimeSlot] = useState<string>('07:30 - 08:30');
  const [newHorseId, setNewHorseId] = useState<string>('bl456');
  const [newExercise, setNewExercise] = useState<string>('Luyện tốc độ vòng cua 1.000m');
  const [newDistance, setNewDistance] = useState<number>(1000);
  const [newTrack, setNewTrack] = useState<TrackType>('turf');
  const [newIntensity, setNewIntensity] = useState<IntensityLevel>('medium');
  const [newJockeyId, setNewJockeyId] = useState<string>('j1');
  const [newGroomId, setNewGroomId] = useState<string>('g1');

  // Week days list
  const daysOfWeek = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];

  // Check selected horse medical lock in create modal
  const selectedHorse = horses.find((h) => h.id === newHorseId);
  const isSelectedHorseLocked = selectedHorse?.isMedicalLocked || false;

  // Check Jockey conflict: Is this jockey already assigned on the same day and shift?
  const jockeyConflictSession = sessions.find(
    (s) =>
      s.dayOfWeek === newDay &&
      s.shift === newShift &&
      s.jockeyId === newJockeyId &&
      s.status !== 'suspended'
  );
  const isJockeyConflicted = Boolean(jockeyConflictSession);

  const handleCreateSession = (e: React.FormEvent) => {
    e.preventDefault();

    if (isSelectedHorseLocked) {
      alert('LỖI (FR-005): Chiến mã này đang bị Lệnh Khóa Y Tế. Tuyệt đối không được xếp lịch tập!');
      return;
    }

    if (isJockeyConflicted) {
      alert(
        `LỖI XUNG ĐỘT NÀI (FR-006): Nài ${jockeyConflictSession?.jockeyName} đã có ca tập cho chiến mã ${jockeyConflictSession?.horseName} (${jockeyConflictSession?.timeSlot})! Vui lòng chọn nài khác hoặc đổi ca.`
      );
      return;
    }

    const jockeyObj = jockeys.find((j) => j.id === newJockeyId);
    const groomObj = grooms.find((g) => g.id === newGroomId);

    const newSession: WorkoutSession = {
      id: `sess-${Date.now()}`,
      dayOfWeek: newDay,
      date: newDate,
      shift: newShift,
      timeSlot: newTimeSlot,
      horseId: newHorseId,
      horseName: selectedHorse?.name || '',
      horseCode: selectedHorse?.code || '',
      stall: selectedHorse?.stall || '',
      exerciseTitle: newExercise,
      distanceMeters: newDistance,
      trackType: newTrack,
      intensity: newIntensity,
      jockeyId: newJockeyId,
      jockeyName: jockeyObj?.name || '',
      groomId: newGroomId,
      groomName: groomObj?.name || '',
      status: 'scheduled',
      isMedicalLocked: false,
    };

    onAddSession(newSession);
    setIsModalOpen(false);
  };

  // Filtered Sessions
  const filteredSessions = sessions.filter((s) => {
    if (filterTrack !== 'all' && s.trackType !== filterTrack) return false;
    if (filterJockey !== 'all' && s.jockeyId !== filterJockey) return false;
    if (filterHorse !== 'all' && s.horseId !== filterHorse) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Notice bar */}
      <div className="flex items-center justify-between text-xs text-muted border-b border-border/60 pb-2">
        <div className="flex items-center gap-2">
          <span>Kế hoạch tuần 11</span>
          <span>›</span>
          <span className="font-semibold text-ink">Bảng Điều Phối Lịch Tập Tuần</span>
        </div>
        <span className="font-mono bg-forest-wash text-forest px-2 py-0.5 rounded">
          Task GH-BE-16 (FR-006) · STITCH T03
        </span>
      </div>

      {/* Header & Controls */}
      <div className="bg-surface border border-border rounded-panel p-5 space-y-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-sans font-bold text-xl text-forest-deep tracking-tight">
              Lịch tập tuần & Phân công nhân sự
            </h1>
            <p className="text-xs text-muted mt-0.5">
              Thời khóa biểu huấn luyện chi tiết 7 ngày · Ca Sáng (05:30 - 08:30) & Ca Chiều (15:30 - 17:30) · Tích hợp cơ chế chống trùng giờ nài
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="h-9 px-4 rounded-btn bg-forest hover:bg-forest-deep text-white font-semibold text-xs flex items-center gap-2 transition-all shadow-sm active:scale-[0.98] self-start md:self-auto"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>+ Tạo buổi tập mới</span>
          </button>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border text-xs">
          <div className="flex flex-wrap items-center gap-3">
            {/* Week Selector */}
            <div className="flex items-center bg-canvas border border-border rounded-lg px-2.5 py-1">
              <button className="p-0.5 text-muted hover:text-ink">‹</button>
              <span className="font-semibold text-ink px-2 flex items-center gap-1.5">
                📅 Tuần 11 · 10/03/2025 - 16/03/2025
              </span>
              <button className="p-0.5 text-muted hover:text-ink">›</button>
            </div>

            {/* Filter: Track */}
            <div className="flex items-center gap-1.5">
              <label className="text-muted">Mặt sân:</label>
              <select
                value={filterTrack}
                onChange={(e) => setFilterTrack(e.target.value)}
                className="h-8 text-xs bg-canvas border border-border rounded-lg px-2 text-ink focus:border-forest"
              >
                <option value="all">Tất cả mặt sân</option>
                <option value="turf">Cỏ Turf</option>
                <option value="dirt">Cát Dirt</option>
                <option value="synthetic">Tổng hợp Synthetic</option>
              </select>
            </div>

            {/* Filter: Jockey */}
            <div className="flex items-center gap-1.5">
              <label className="text-muted">Nhân sự Nài:</label>
              <select
                value={filterJockey}
                onChange={(e) => setFilterJockey(e.target.value)}
                className="h-8 text-xs bg-canvas border border-border rounded-lg px-2 text-ink focus:border-forest"
              >
                <option value="all">Tất cả Nài ngựa</option>
                {jockeys.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name} ({j.weightKg}kg)
                  </option>
                ))}
              </select>
            </div>

            {/* Filter: Horse */}
            <div className="flex items-center gap-1.5">
              <label className="text-muted">Chiến mã:</label>
              <select
                value={filterHorse}
                onChange={(e) => setFilterHorse(e.target.value)}
                className="h-8 text-xs bg-canvas border border-border rounded-lg px-2 text-ink focus:border-forest"
              >
                <option value="all">Tất cả chiến mã</option>
                {horses.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Legend */}
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-forest"></span> Hoàn thành / Diễn ra
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-surface border border-border"></span> Đã lên lịch
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-critical-text"></span> Khóa y tế (Đình chỉ)
            </span>
          </div>
        </div>
      </div>

      {/* Weekly Calendar Grid (7 Columns) */}
      <div className="bg-surface rounded-panel border border-border p-4 shadow-xs overflow-x-auto">
        <div className="min-w-[1000px]">
          {/* Day of Week Headers */}
          <div className="grid grid-cols-7 gap-3 pb-3 border-b border-border text-center text-xs font-bold text-muted">
            {daysOfWeek.map((day, idx) => (
              <div
                key={day}
                className={`py-1.5 rounded-lg ${
                  day === 'Thứ Ba' ? 'bg-forest-wash text-forest font-bold border border-forest/20' : ''
                }`}
              >
                <span>{day}</span>
                <span className="block text-[10px] font-normal text-muted">
                  {idx + 10}/03
                </span>
              </div>
            ))}
          </div>

          {/* Columns of Sessions */}
          <div className="grid grid-cols-7 gap-3 pt-3 min-h-[500px]">
            {daysOfWeek.map((day) => {
              const daySessions = filteredSessions.filter((s) => s.dayOfWeek === day);
              const morningSessions = daySessions.filter((s) => s.shift === 'morning');
              const afternoonSessions = daySessions.filter((s) => s.shift === 'afternoon');

              return (
                <div key={day} className="space-y-3 bg-canvas/40 p-2 rounded-lg border border-border/50">
                  {/* MORNING SHIFT BLOCK */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted px-1 flex items-center gap-1">
                      ☀️ Ca Sáng (05:30)
                    </span>
                    {morningSessions.length > 0 ? (
                      morningSessions.map((session) => (
                        <div
                          key={session.id}
                          className={`p-2.5 rounded-lg border text-xs space-y-1.5 transition-all ${
                            session.isMedicalLocked
                              ? 'bg-critical-bg border-critical-border'
                              : session.status === 'in_progress'
                              ? 'bg-forest-wash border-forest shadow-xs'
                              : 'bg-surface border-border shadow-xs hover:border-forest/40'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`font-bold ${
                                session.isMedicalLocked ? 'text-critical-text' : 'text-ink'
                              }`}
                            >
                              {session.horseName}{' '}
                              <span className="text-[11px] font-normal text-muted">
                                ({session.horseCode})
                              </span>
                            </span>
                            {session.isMedicalLocked ? (
                              <button
                                onClick={onOpenMedicalLock}
                                className="text-[10px] font-bold text-critical-text hover:underline"
                              >
                                🔒 Khóa
                              </button>
                            ) : (
                              <span className="text-[10px] font-mono text-muted">{session.stall}</span>
                            )}
                          </div>

                          <p className="text-[11px] text-muted line-clamp-2">
                            {session.exerciseTitle}
                          </p>

                          <div className="pt-1 border-t border-border/60 text-[10px] flex items-center justify-between text-muted">
                            <span>⏱️ {session.timeSlot}</span>
                            <span className="font-semibold text-forest">
                              {session.distanceMeters}m
                            </span>
                          </div>

                          <div className="text-[10px] flex items-center justify-between">
                            <span className="text-forest-deep font-semibold">
                              🏇 {session.jockeyName}
                            </span>
                            {!session.isMedicalLocked && (
                              <button
                                onClick={() => navigate(`/training/sessions/${session.id}`)}
                                className="text-forest hover:underline font-bold text-[10px]"
                              >
                                Chấm điểm →
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-[10px] text-muted text-center py-4 border border-dashed border-border rounded-lg">
                        Trống ca
                      </div>
                    )}
                  </div>

                  {/* AFTERNOON SHIFT BLOCK */}
                  <div className="space-y-1.5 pt-2 border-t border-border/80">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted px-1 flex items-center gap-1">
                      ⛅ Ca Chiều (15:30)
                    </span>
                    {afternoonSessions.length > 0 ? (
                      afternoonSessions.map((session) => (
                        <div
                          key={session.id}
                          className={`p-2.5 rounded-lg border text-xs space-y-1.5 transition-all ${
                            session.isMedicalLocked
                              ? 'bg-critical-bg border-critical-border'
                              : session.status === 'in_progress'
                              ? 'bg-forest-wash border-forest shadow-xs'
                              : 'bg-surface border-border shadow-xs hover:border-forest/40'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`font-bold ${
                                session.isMedicalLocked ? 'text-critical-text' : 'text-ink'
                              }`}
                            >
                              {session.horseName}{' '}
                              <span className="text-[11px] font-normal text-muted">
                                ({session.horseCode})
                              </span>
                            </span>
                            {session.isMedicalLocked ? (
                              <button
                                onClick={onOpenMedicalLock}
                                className="text-[10px] font-bold text-critical-text hover:underline"
                              >
                                🔒 Khóa
                              </button>
                            ) : (
                              <span className="text-[10px] font-mono text-muted">{session.stall}</span>
                            )}
                          </div>

                          <p className="text-[11px] text-muted line-clamp-2">
                            {session.exerciseTitle}
                          </p>

                          <div className="pt-1 border-t border-border/60 text-[10px] flex items-center justify-between text-muted">
                            <span>⏱️ {session.timeSlot}</span>
                            <span className="font-semibold text-forest">
                              {session.distanceMeters}m
                            </span>
                          </div>

                          <div className="text-[10px] flex items-center justify-between">
                            <span className="text-forest-deep font-semibold">
                              🏇 {session.jockeyName}
                            </span>
                            {!session.isMedicalLocked && (
                              <button
                                onClick={() => navigate(`/training/sessions/${session.id}`)}
                                className="text-forest hover:underline font-bold text-[10px]"
                              >
                                Chấm điểm →
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-[10px] text-muted text-center py-4 border border-dashed border-border rounded-lg">
                        Trống ca
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ================= MODAL T03-CREATE: TẠO BUỔI TẬP MỚI ================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-[3px] animate-in fade-in">
          <div className="w-full max-w-2xl bg-surface rounded-panel border border-border shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="bg-forest px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <span className="text-xl">📅</span>
                <div>
                  <h3 className="font-bold text-base text-white">
                    Tạo buổi tập mới & Phân công nhân sự
                  </h3>
                  <p className="text-xs text-white/80">
                    Phân ca sáng/chiều, gán Jockey & kiểm tra chống trùng giờ nài
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded text-white/80 hover:text-white hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateSession} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Critical Alert 1: Medical Lock */}
              {isSelectedHorseLocked && (
                <div className="p-3 bg-critical-bg rounded-lg border border-critical-border text-critical-text text-xs flex items-start gap-2.5">
                  <span className="text-base">🚫</span>
                  <div>
                    <strong className="block">CHẶN XẾP LỊCH TẬP (FR-005):</strong>
                    Chiến mã <strong>{selectedHorse?.name}</strong> đang chịu Lệnh Khóa Huấn Luyện từ BS. Lê Thanh Hà. Vui lòng chọn chiến mã khác!
                  </div>
                </div>
              )}

              {/* Critical Alert 2: Jockey Time Conflict */}
              {isJockeyConflicted && (
                <div className="p-3 bg-warning-bg rounded-lg border border-warning-text/30 text-warning-text text-xs flex items-start gap-2.5">
                  <span className="text-base">⚠️</span>
                  <div>
                    <strong className="block">CẢNH BÁO TRÙNG LỊCH NÀI NGỰA (FR-006):</strong>
                    Nài <strong>{jockeyConflictSession?.jockeyName}</strong> đã được phân công ca {newShift === 'morning' ? 'sáng' : 'chiều'} {newDay} cho chiến mã <strong>{jockeyConflictSession?.horseName}</strong> ({jockeyConflictSession?.timeSlot})! Vui lòng chọn nài khác hoặc thay đổi ca tập.
                  </div>
                </div>
              )}

              {/* Select Day, Shift & Time */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-ink">Ngày trong tuần</label>
                  <select
                    value={newDay}
                    onChange={(e) => setNewDay(e.target.value)}
                    className="w-full h-10 px-2.5 text-xs bg-surface border border-border rounded-lg text-ink"
                  >
                    {daysOfWeek.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-ink">Ca tập</label>
                  <select
                    value={newShift}
                    onChange={(e) => setNewShift(e.target.value as SessionShift)}
                    className="w-full h-10 px-2.5 text-xs bg-surface border border-border rounded-lg text-ink"
                  >
                    <option value="morning">Ca Sáng (05:30 - 08:30)</option>
                    <option value="afternoon">Ca Chiều (15:30 - 17:30)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-ink">Khung giờ cụ thể</label>
                  <input
                    type="text"
                    value={newTimeSlot}
                    onChange={(e) => setNewTimeSlot(e.target.value)}
                    className="w-full h-10 px-2.5 text-xs bg-surface border border-border rounded-lg text-ink"
                    placeholder="06:00 - 07:15"
                  />
                </div>
              </div>

              {/* Select Horse */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-ink">Chiến mã tập luyện</label>
                <select
                  value={newHorseId}
                  onChange={(e) => setNewHorseId(e.target.value)}
                  className={`w-full h-10 px-2.5 text-xs border rounded-lg ${
                    isSelectedHorseLocked
                      ? 'border-critical-border bg-critical-bg text-critical-text font-bold'
                      : 'border-border bg-surface text-ink'
                  }`}
                >
                  {horses.map((h) => (
                    <option key={h.id} value={h.id} disabled={h.isMedicalLocked}>
                      {h.name} ({h.code}) · {h.stall} {h.isMedicalLocked ? '🔒 [BỊ KHÓA Y TẾ]' : '✓ [Sẵn sàng]'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Exercise Title & Distance */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-semibold text-ink">Tiêu đề bài tập</label>
                  <input
                    type="text"
                    value={newExercise}
                    onChange={(e) => setNewExercise(e.target.value)}
                    className="w-full h-10 px-3 text-xs bg-surface border border-border rounded-lg text-ink"
                    placeholder="Tập bứt tốc đoạn ngắn 800m"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-ink">Cự ly (mét)</label>
                  <input
                    type="number"
                    min={100}
                    max={3000}
                    step={50}
                    value={newDistance}
                    onChange={(e) => setNewDistance(Number(e.target.value))}
                    className="w-full h-10 px-3 text-xs bg-surface border border-border rounded-lg text-ink font-semibold"
                  />
                </div>
              </div>

              {/* Track Type & Intensity */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-ink">Mặt sân</label>
                  <select
                    value={newTrack}
                    onChange={(e) => setNewTrack(e.target.value as TrackType)}
                    className="w-full h-10 px-2.5 text-xs bg-surface border border-border rounded-lg text-ink"
                  >
                    <option value="turf">Cỏ tự nhiên (Turf Track)</option>
                    <option value="dirt">Cát chuẩn (Dirt Track)</option>
                    <option value="synthetic">Tổng hợp (Synthetic Track)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-ink">Cường độ</label>
                  <select
                    value={newIntensity}
                    onChange={(e) => setNewIntensity(e.target.value as IntensityLevel)}
                    className="w-full h-10 px-2.5 text-xs bg-surface border border-border rounded-lg text-ink"
                  >
                    <option value="light">Nhẹ 50%</option>
                    <option value="medium">Vừa 70%</option>
                    <option value="high">Nặng 85%</option>
                    <option value="max">Tối đa 100%</option>
                  </select>
                </div>
              </div>

              {/* Personnel Assignment: Jockey & Groom */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-ink flex items-center justify-between">
                    <span>Phân công Nài ngựa (Jockey)</span>
                    {isJockeyConflicted && (
                      <span className="text-[10px] text-warning-text font-bold">Trùng lịch!</span>
                    )}
                  </label>
                  <select
                    value={newJockeyId}
                    onChange={(e) => setNewJockeyId(e.target.value)}
                    className={`w-full h-10 px-2.5 text-xs border rounded-lg ${
                      isJockeyConflicted
                        ? 'border-warning-text bg-warning-bg text-warning-text font-bold'
                        : 'border-border bg-surface text-ink'
                    }`}
                  >
                    {jockeys.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.name} ({j.weightKg}kg - KN {j.experienceYears} năm)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-ink">Phân công Groom chăm sóc</label>
                  <select
                    value={newGroomId}
                    onChange={(e) => setNewGroomId(e.target.value)}
                    className="w-full h-10 px-2.5 text-xs bg-surface border border-border rounded-lg text-ink"
                  >
                    {grooms.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.specialty})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-btn border border-border bg-white text-muted hover:text-ink text-xs font-semibold"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSelectedHorseLocked || isJockeyConflicted}
                  className={`px-5 py-2 rounded-btn text-xs font-bold transition-all shadow-sm ${
                    isSelectedHorseLocked || isJockeyConflicted
                      ? 'bg-muted/40 text-muted cursor-not-allowed'
                      : 'bg-forest hover:bg-forest-deep text-white active:scale-[0.98]'
                  }`}
                >
                  {isSelectedHorseLocked
                    ? 'Bị chặn bởi Medical Lock'
                    : isJockeyConflicted
                    ? 'Bị chặn: Trùng giờ Nài'
                    : 'Xác nhận xếp lịch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
