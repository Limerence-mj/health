ALTER TABLE "assessments"
ADD COLUMN "questionnaire_answers" JSONB NOT NULL DEFAULT '{}'::jsonb;
