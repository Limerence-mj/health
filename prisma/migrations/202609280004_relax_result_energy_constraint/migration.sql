ALTER TABLE "assessment_results"
  DROP CONSTRAINT "results_scalar_ranges",
  ADD CONSTRAINT "results_scalar_ranges" CHECK (
    source_revision >= 0
    AND bmi > 0
    AND resting_energy_kcal > 0
    AND maintenance_kcal > 0
    AND suggested_intake_kcal > 0
  );
