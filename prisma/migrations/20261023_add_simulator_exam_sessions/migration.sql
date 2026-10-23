-- Reconcile the backend-issued workout fields previously introduced through `prisma db push`.
ALTER TYPE "SimulatorSessionStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TABLE "SimulatorSession" ADD COLUMN IF NOT EXISTS "workoutSessionId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "SimulatorSession_workoutSessionId_key" ON "SimulatorSession"("workoutSessionId");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SimulatorSession_workoutSessionId_fkey') THEN
    ALTER TABLE "SimulatorSession" ADD CONSTRAINT "SimulatorSession_workoutSessionId_fkey"
    FOREIGN KEY ("workoutSessionId") REFERENCES "WorkoutSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TYPE "SimulatorSessionType" ADD VALUE IF NOT EXISTS 'EXAM';

ALTER TABLE "SimulatorSession" ADD COLUMN IF NOT EXISTS "medicalRecordId" TEXT;

CREATE INDEX IF NOT EXISTS "SimulatorSession_medicalRecordId_idx" ON "SimulatorSession"("medicalRecordId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SimulatorSession_medicalRecordId_fkey') THEN
    ALTER TABLE "SimulatorSession" ADD CONSTRAINT "SimulatorSession_medicalRecordId_fkey"
    FOREIGN KEY ("medicalRecordId") REFERENCES "MedicalRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
