import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { MedicalLockModal } from './components/MedicalLockModal';
import { TrainingDashboard } from './pages/TrainingDashboard';
import { TrainingPlans } from './pages/TrainingPlans';
import { TrainingSchedule } from './pages/TrainingSchedule';
import { SessionEvaluationPage } from './pages/SessionEvaluation';
import {
  MOCK_HORSES,
  MOCK_JOCKEYS,
  MOCK_GROOMS,
  MOCK_TRAINING_PLANS,
  MOCK_WEEKLY_SESSIONS,
} from './data/mockData';
import { Horse, TrainingPlan, WorkoutSession } from './types/training';

export const App: React.FC = () => {
  // Application Data States
  const [horses] = useState<Horse[]>(MOCK_HORSES);
  const [jockeys] = useState(MOCK_JOCKEYS);
  const [grooms] = useState(MOCK_GROOMS);
  const [plans, setPlans] = useState<TrainingPlan[]>(MOCK_TRAINING_PLANS);
  const [sessions, setSessions] = useState<WorkoutSession[]>(MOCK_WEEKLY_SESSIONS);

  // Global UI States
  const [isMedicalLockModalOpen, setIsMedicalLockModalOpen] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const lockedHorse = horses.find((h) => h.isMedicalLocked);

  const handleCreatePlan = (newPlan: TrainingPlan) => {
    setPlans((prev) => [newPlan, ...prev]);
  };

  const handleAddSession = (newSession: WorkoutSession) => {
    setSessions((prev) => [...prev, newSession]);
  };

  return (
    <div className="min-h-screen bg-canvas text-ink font-sans antialiased">
      {/* 1. Master Navbar (64px fixed) */}
      <Navbar
        onOpenMedicalLock={() => setIsMedicalLockModalOpen(true)}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
      />

      {/* 2. Master Sidebar (224px fixed) */}
      <Sidebar onOpenMedicalLock={() => setIsMedicalLockModalOpen(true)} />

      {/* 3. Main Workspace Canvas (Offset ml-56 pt-16) */}
      <main className="ml-56 pt-16 min-h-screen">
        <div className="max-w-[1440px] mx-auto p-7">
          <Routes>
            {/* Default Route */}
            <Route path="/" element={<Navigate to="/training/dashboard" replace />} />

            {/* Dashboard: Trang Dashboard Thể lực Đàn ngựa (T01) */}
            <Route
              path="/training/dashboard"
              element={
                <TrainingDashboard
                  horses={horses}
                  sessions={sessions}
                  onOpenMedicalLock={() => setIsMedicalLockModalOpen(true)}
                />
              }
            />

            {/* Plans: Task GH-BE-14 (FR-004) - Lập kế hoạch giáo án (T02) */}
            <Route
              path="/training/plans"
              element={
                <TrainingPlans
                  horses={horses}
                  plans={plans}
                  onCreatePlan={handleCreatePlan}
                  onOpenMedicalLock={() => setIsMedicalLockModalOpen(true)}
                />
              }
            />

            {/* Schedule: Task GH-BE-16 (FR-006) - Lịch tập luyện hàng ngày (T03) */}
            <Route
              path="/training/schedule"
              element={
                <TrainingSchedule
                  horses={horses}
                  jockeys={jockeys}
                  grooms={grooms}
                  sessions={sessions}
                  onAddSession={handleAddSession}
                  onOpenMedicalLock={() => setIsMedicalLockModalOpen(true)}
                />
              }
            />

            {/* Evaluation: Task GH-BE-17 (FR-007) - Ghi nhận kết quả chạy thử (T04) */}
            <Route path="/training/sessions/:id" element={<SessionEvaluationPage />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/training/dashboard" replace />} />
          </Routes>
        </div>
      </main>

      {/* 4. Medical Lock Enforcement Dialog (FR-005, Screen T05) */}
      <MedicalLockModal
        isOpen={isMedicalLockModalOpen}
        onClose={() => setIsMedicalLockModalOpen(false)}
        horse={lockedHorse}
      />
    </div>
  );
};

export default App;
