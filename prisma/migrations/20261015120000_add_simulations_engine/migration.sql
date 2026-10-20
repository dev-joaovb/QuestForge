-- CreateEnum
CREATE TYPE "SimulationStatus" AS ENUM ('CREATED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AnswerKeySource" AS ENUM ('OFFICIAL_KEY', 'QUESTION_BANK');

-- CreateTable
CREATE TABLE "simulations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "status" "SimulationStatus" NOT NULL DEFAULT 'CREATED',
    "totalQuestions" INTEGER NOT NULL,
    "timeLimitSeconds" INTEGER,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "scorePercentage" DOUBLE PRECISION,
    "correctCount" INTEGER,
    "wrongCount" INTEGER,
    "unansweredCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "simulations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulation_questions" (
    "id" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "answerKeySnapshot" TEXT,
    "isAnnulledSnapshot" BOOLEAN NOT NULL DEFAULT false,
    "snapshotSource" "AnswerKeySource" NOT NULL DEFAULT 'QUESTION_BANK',
    "officialAnswerKeyId" TEXT,
    "officialAnswerKeyItemId" TEXT,
    "officialAnswerKeyVersion" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simulation_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedAlternativeId" TEXT,
    "selectedLetter" TEXT,
    "isCorrect" BOOLEAN,
    "timeSpentSeconds" INTEGER,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "simulations_userId_status_idx" ON "simulations"("userId", "status");

-- CreateIndex
CREATE INDEX "simulations_userId_createdAt_idx" ON "simulations"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "simulation_questions_simulationId_idx" ON "simulation_questions"("simulationId");

-- CreateIndex
CREATE INDEX "simulation_questions_questionId_idx" ON "simulation_questions"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "simulation_questions_simulationId_position_key" ON "simulation_questions"("simulationId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "simulation_questions_simulationId_questionId_key" ON "simulation_questions"("simulationId", "questionId");

-- CreateIndex
CREATE INDEX "question_attempts_userId_idx" ON "question_attempts"("userId");

-- CreateIndex
CREATE INDEX "question_attempts_simulationId_idx" ON "question_attempts"("simulationId");

-- CreateIndex
CREATE INDEX "question_attempts_questionId_idx" ON "question_attempts"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "question_attempts_simulationId_questionId_key" ON "question_attempts"("simulationId", "questionId");

-- AddForeignKey
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_questions" ADD CONSTRAINT "simulation_questions_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "simulations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulation_questions" ADD CONSTRAINT "simulation_questions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "simulations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_selectedAlternativeId_fkey" FOREIGN KEY ("selectedAlternativeId") REFERENCES "alternatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;
