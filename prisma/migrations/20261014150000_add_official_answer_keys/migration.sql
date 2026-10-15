-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('EXAM', 'ANSWER_KEY');

-- CreateEnum
CREATE TYPE "AnswerKeyType" AS ENUM ('PRELIMINARY', 'FINAL', 'RECTIFIED');

-- CreateEnum
CREATE TYPE "AnswerKeyStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AnswerKeyItemStatus" AS ENUM ('ACTIVE', 'ANNULLED', 'CHANGED', 'NEEDS_REVIEW');

-- AlterTable
ALTER TABLE "pdf_documents" ADD COLUMN "documentType" "DocumentType" NOT NULL DEFAULT 'EXAM';

-- CreateTable
CREATE TABLE "official_answer_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "pdfDocumentId" TEXT,
    "type" "AnswerKeyType" NOT NULL DEFAULT 'PRELIMINARY',
    "status" "AnswerKeyStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "publicationDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_answer_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "official_answer_key_items" (
    "id" TEXT NOT NULL,
    "answerKeyId" TEXT NOT NULL,
    "questionNumber" INTEGER NOT NULL,
    "questionId" TEXT,
    "correctAnswer" TEXT,
    "previousAnswer" TEXT,
    "status" "AnswerKeyItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "isAnnulled" BOOLEAN NOT NULL DEFAULT false,
    "justification" TEXT,
    "textEvidence" TEXT,
    "confidence" DOUBLE PRECISION,
    "sourcePage" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_answer_key_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "official_answer_keys_userId_idx" ON "official_answer_keys"("userId");

-- CreateIndex
CREATE INDEX "official_answer_keys_examId_isCurrent_idx" ON "official_answer_keys"("examId", "isCurrent");

-- CreateIndex
CREATE INDEX "official_answer_keys_examId_status_idx" ON "official_answer_keys"("examId", "status");

-- CreateIndex
CREATE INDEX "official_answer_keys_pdfDocumentId_idx" ON "official_answer_keys"("pdfDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "official_answer_keys_examId_type_version_key" ON "official_answer_keys"("examId", "type", "version");

-- CreateIndex
CREATE INDEX "official_answer_key_items_answerKeyId_status_idx" ON "official_answer_key_items"("answerKeyId", "status");

-- CreateIndex
CREATE INDEX "official_answer_key_items_questionId_idx" ON "official_answer_key_items"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "official_answer_key_items_answerKeyId_questionNumber_key" ON "official_answer_key_items"("answerKeyId", "questionNumber");

-- CreateIndex
CREATE INDEX "pdf_documents_documentType_idx" ON "pdf_documents"("documentType");

-- Partial Unique Index (Sprint 5 constraint: at most one current answer key per exam)
CREATE UNIQUE INDEX "official_answer_keys_exam_current_unique"
ON "official_answer_keys" ("examId")
WHERE "isCurrent" = true;

-- AddForeignKey
ALTER TABLE "official_answer_keys" ADD CONSTRAINT "official_answer_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_answer_keys" ADD CONSTRAINT "official_answer_keys_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_answer_keys" ADD CONSTRAINT "official_answer_keys_pdfDocumentId_fkey" FOREIGN KEY ("pdfDocumentId") REFERENCES "pdf_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_answer_key_items" ADD CONSTRAINT "official_answer_key_items_answerKeyId_fkey" FOREIGN KEY ("answerKeyId") REFERENCES "official_answer_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_answer_key_items" ADD CONSTRAINT "official_answer_key_items_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
