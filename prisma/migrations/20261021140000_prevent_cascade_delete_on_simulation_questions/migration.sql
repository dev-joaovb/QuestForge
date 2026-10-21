-- DropForeignKey
ALTER TABLE "simulation_questions" DROP CONSTRAINT "simulation_questions_questionId_fkey";

-- DropForeignKey
ALTER TABLE "question_attempts" DROP CONSTRAINT "question_attempts_questionId_fkey";

-- AddForeignKey
ALTER TABLE "simulation_questions" ADD CONSTRAINT "simulation_questions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_attempts" ADD CONSTRAINT "question_attempts_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
