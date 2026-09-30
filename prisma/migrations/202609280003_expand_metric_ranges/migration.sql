ALTER TABLE "assessments"
  DROP CONSTRAINT "assessments_height",
  DROP CONSTRAINT "assessments_weight",
  DROP CONSTRAINT "assessments_target_weight",
  ADD CONSTRAINT "assessments_height" CHECK (height_cm IS NULL OR height_cm BETWEEN 90 AND 242),
  ADD CONSTRAINT "assessments_weight" CHECK (weight_kg IS NULL OR weight_kg BETWEEN 25 AND 300),
  ADD CONSTRAINT "assessments_target_weight" CHECK (target_weight_kg IS NULL OR target_weight_kg BETWEEN 25 AND 300);
