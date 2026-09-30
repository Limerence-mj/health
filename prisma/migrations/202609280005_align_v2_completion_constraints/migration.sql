ALTER TABLE "assessments"
  DROP CONSTRAINT "assessments_status_fields",
  ADD CONSTRAINT "assessments_status_fields" CHECK (
    (status = 'DRAFT' AND submitted_at IS NULL) OR
    (status = 'COMPLETED' AND submitted_at IS NOT NULL AND age BETWEEN 18 AND 80 AND sex IS NOT NULL AND
     scope_version IS NOT NULL AND scope_confirmed_at IS NOT NULL AND goal IS NOT NULL AND height_cm IS NOT NULL AND
     weight_kg IS NOT NULL AND target_weight_kg IS NOT NULL AND activity_level IS NOT NULL)
  );

ALTER TABLE "assessment_results"
  DROP CONSTRAINT "results_prediction_shape",
  ADD CONSTRAINT "results_prediction_shape" CHECK (
    (prediction_status = 'PROJECTED' AND target_date = base_date + duration_days AND duration_days >= 1 AND weekly_change_kg = 0.25 AND jsonb_array_length(prediction_curve) >= 2) OR
    (prediction_status = 'AT_TARGET' AND target_date = base_date AND duration_days = 0 AND weekly_change_kg = 0 AND jsonb_array_length(prediction_curve) = 1) OR
    (prediction_status = 'HORIZON_EXCEEDED' AND target_date IS NULL AND duration_days IS NULL AND weekly_change_kg = 0.25 AND jsonb_array_length(prediction_curve) = 0)
  );
