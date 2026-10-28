-- CreateEnum
CREATE TYPE "StudyActivityType" AS ENUM ('QUESTION', 'SIMULATION', 'EXAM');

-- CreateTable
CREATE TABLE "study_activities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "StudyActivityType" NOT NULL,
    "simulationId" TEXT,
    "questionId" TEXT,
    "examId" TEXT,
    "durationSeconds" INTEGER,
    "scorePercentage" DOUBLE PRECISION,
    "correctCount" INTEGER,
    "wrongCount" INTEGER,
    "unansweredCount" INTEGER,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "study_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_streaks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastActivityDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_streaks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "study_activities_simulationId_key" ON "study_activities"("simulationId");

-- CreateIndex
CREATE INDEX "study_activities_userId_completedAt_idx" ON "study_activities"("userId", "completedAt");

-- CreateIndex
CREATE INDEX "study_activities_userId_type_idx" ON "study_activities"("userId", "type");

-- CreateIndex
CREATE INDEX "study_activities_questionId_idx" ON "study_activities"("questionId");

-- CreateIndex
CREATE INDEX "study_activities_examId_idx" ON "study_activities"("examId");

-- CreateIndex
CREATE UNIQUE INDEX "user_streaks_userId_key" ON "user_streaks"("userId");

-- CreateIndex
CREATE INDEX "user_streaks_userId_idx" ON "user_streaks"("userId");

-- AddForeignKey
ALTER TABLE "study_activities" ADD CONSTRAINT "study_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_activities" ADD CONSTRAINT "study_activities_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "simulations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_activities" ADD CONSTRAINT "study_activities_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_activities" ADD CONSTRAINT "study_activities_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
