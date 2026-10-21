-- CreateEnum
CREATE TYPE "SimulatorSessionType" AS ENUM ('WORKOUT', 'RACE');

-- CreateEnum
CREATE TYPE "SimulatorSessionStatus" AS ENUM ('RUNNING', 'COMPLETED', 'ABORTED_INJURY');

-- AlterTable
ALTER TABLE "IncidentReport" ADD COLUMN "sourceEventId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "IncidentReport_sourceEventId_key" ON "IncidentReport"("sourceEventId");

-- CreateTable
CREATE TABLE "SimulatorSession" (
    "id" TEXT NOT NULL,
    "type" "SimulatorSessionType" NOT NULL,
    "status" "SimulatorSessionStatus" NOT NULL DEFAULT 'RUNNING',
    "horseIds" TEXT[],
    "lastSnapshot" JSONB,
    "result" JSONB,
    "actorUserId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimulatorSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SimulatorSession_status_updatedAt_idx" ON "SimulatorSession"("status", "updatedAt");
