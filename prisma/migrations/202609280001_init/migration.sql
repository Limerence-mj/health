CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "is_demo" BOOLEAN NOT NULL DEFAULT false,
  "health_consent_version" VARCHAR(32),
  "health_consent_at" TIMESTAMPTZ(6),
  "purge_after" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_consent_pair" CHECK ((health_consent_version IS NULL) = (health_consent_at IS NULL)),
  CONSTRAINT "users_purge_after_created" CHECK (purge_after >= created_at)
);

CREATE TABLE "sessions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sessions_token_hash_format" CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "sessions_expiry" CHECK (expires_at > created_at),
  CONSTRAINT "sessions_revoked_after_created" CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE TABLE "assessments" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "source_assessment_id" UUID,
  "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  "revision" INTEGER NOT NULL DEFAULT 0,
  "age" SMALLINT,
  "sex" VARCHAR(16),
  "scope_version" VARCHAR(32),
  "scope_confirmed_at" TIMESTAMPTZ(6),
  "goal" VARCHAR(24),
  "height_cm" NUMERIC(5,1),
  "weight_kg" NUMERIC(5,1),
  "target_weight_kg" NUMERIC(5,1),
  "activity_level" VARCHAR(24),
  "submitted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "assessments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assessments_id_user_key" UNIQUE ("id", "user_id"),
  CONSTRAINT "assessments_status" CHECK (status IN ('DRAFT','COMPLETED')),
  CONSTRAINT "assessments_revision" CHECK (revision >= 0),
  CONSTRAINT "assessments_age" CHECK (age IS NULL OR age BETWEEN 18 AND 80),
  CONSTRAINT "assessments_sex" CHECK (sex IS NULL OR sex IN ('MALE','FEMALE')),
  CONSTRAINT "assessments_goal" CHECK (goal IS NULL OR goal IN ('LOSE_WEIGHT','MAINTAIN','GAIN_WEIGHT')),
  CONSTRAINT "assessments_activity" CHECK (activity_level IS NULL OR activity_level IN ('SEDENTARY','LIGHT','MODERATE','HIGH')),
  CONSTRAINT "assessments_height" CHECK (height_cm IS NULL OR height_cm BETWEEN 120 AND 220),
  CONSTRAINT "assessments_weight" CHECK (weight_kg IS NULL OR weight_kg BETWEEN 30 AND 250),
  CONSTRAINT "assessments_target_weight" CHECK (target_weight_kg IS NULL OR target_weight_kg BETWEEN 30 AND 250),
  CONSTRAINT "assessments_scope_pair" CHECK ((scope_version IS NULL) = (scope_confirmed_at IS NULL)),
  CONSTRAINT "assessments_status_fields" CHECK (
    (status = 'DRAFT' AND submitted_at IS NULL) OR
    (status = 'COMPLETED' AND submitted_at IS NOT NULL AND age BETWEEN 20 AND 78 AND sex IS NOT NULL AND
     scope_version IS NOT NULL AND scope_confirmed_at IS NOT NULL AND goal IS NOT NULL AND height_cm IS NOT NULL AND
     weight_kg IS NOT NULL AND target_weight_kg IS NOT NULL AND activity_level IS NOT NULL)
  )
);

CREATE TABLE "assessment_results" (
  "id" UUID NOT NULL,
  "assessment_id" UUID NOT NULL,
  "source_revision" INTEGER NOT NULL,
  "algorithm_version" VARCHAR(32) NOT NULL,
  "input_snapshot" JSONB NOT NULL,
  "calculation_metadata" JSONB NOT NULL,
  "bmi" NUMERIC(6,3) NOT NULL,
  "resting_energy_kcal" INTEGER NOT NULL,
  "maintenance_kcal" INTEGER NOT NULL,
  "suggested_intake_kcal" INTEGER NOT NULL,
  "prediction_status" VARCHAR(24) NOT NULL,
  "base_date" DATE NOT NULL,
  "target_date" DATE,
  "duration_days" INTEGER,
  "weekly_change_kg" NUMERIC(4,2) NOT NULL,
  "prediction_curve" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assessment_results_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assessment_results_assessment_key" UNIQUE ("assessment_id"),
  CONSTRAINT "results_scalar_ranges" CHECK (source_revision >= 0 AND bmi > 0 AND resting_energy_kcal > 0 AND maintenance_kcal > 0 AND suggested_intake_kcal BETWEEN 1000 AND 5000),
  CONSTRAINT "results_json_types" CHECK (jsonb_typeof(input_snapshot) = 'object' AND jsonb_typeof(calculation_metadata) = 'object' AND jsonb_typeof(prediction_curve) = 'array'),
  CONSTRAINT "results_curve_length" CHECK (CASE WHEN jsonb_typeof(prediction_curve) = 'array' THEN jsonb_array_length(prediction_curve) <= 106 ELSE false END),
  CONSTRAINT "results_prediction_status" CHECK (prediction_status IN ('PROJECTED','AT_TARGET','HORIZON_EXCEEDED')),
  CONSTRAINT "results_prediction_shape" CHECK (
    (prediction_status = 'PROJECTED' AND target_date = base_date + duration_days AND duration_days BETWEEN 1 AND 730 AND weekly_change_kg = 0.25 AND jsonb_array_length(prediction_curve) >= 2) OR
    (prediction_status = 'AT_TARGET' AND target_date = base_date AND duration_days = 0 AND weekly_change_kg = 0 AND jsonb_array_length(prediction_curve) = 1) OR
    (prediction_status = 'HORIZON_EXCEEDED' AND target_date IS NULL AND duration_days IS NULL AND weekly_change_kg = 0.25 AND jsonb_array_length(prediction_curve) = 0)
  )
);

CREATE TABLE "subscriptions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'INACTIVE',
  "plan_code" VARCHAR(32),
  "starts_at" TIMESTAMPTZ(6),
  "expires_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subscriptions_user_key" UNIQUE ("user_id"),
  CONSTRAINT "subscriptions_id_user_key" UNIQUE ("id", "user_id"),
  CONSTRAINT "subscriptions_shape" CHECK (
    (status = 'INACTIVE' AND plan_code IS NULL AND starts_at IS NULL AND expires_at IS NULL) OR
    (status = 'ACTIVE' AND plan_code = 'DEMO_30D' AND starts_at IS NOT NULL AND expires_at > starts_at)
  )
);

CREATE TABLE "payment_events" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "assessment_id" UUID NOT NULL,
  "subscription_id" UUID NOT NULL,
  "provider" VARCHAR(16) NOT NULL DEFAULT 'MOCK',
  "event_id" UUID NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "outcome" VARCHAR(24) NOT NULL,
  "plan_code" VARCHAR(32) NOT NULL DEFAULT 'DEMO_30D',
  "observed_starts_at" TIMESTAMPTZ(6) NOT NULL,
  "observed_expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_events_user_provider_event_key" UNIQUE ("user_id", "provider", "event_id"),
  CONSTRAINT "payment_events_shape" CHECK (provider = 'MOCK' AND plan_code = 'DEMO_30D' AND outcome IN ('ACTIVATED','ALREADY_ACTIVE') AND observed_expires_at > observed_starts_at),
  CONSTRAINT "payment_events_request_hash_format" CHECK (request_hash ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "idempotency_records" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "operation" VARCHAR(200) NOT NULL,
  "key" UUID NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "response_status" SMALLINT NOT NULL,
  "response_data" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "idempotency_user_operation_key" UNIQUE ("user_id", "operation", "key"),
  CONSTRAINT "idempotency_request_hash_format" CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "idempotency_response" CHECK (response_status BETWEEN 200 AND 299 AND jsonb_typeof(response_data) = 'object')
);

CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");
CREATE UNIQUE INDEX "assessments_one_draft_per_user" ON "assessments"("user_id") WHERE "status" = 'DRAFT';
CREATE INDEX "assessments_user_created_idx" ON "assessments"("user_id", "created_at" DESC, "id" DESC);
CREATE INDEX "users_purge_after_idx" ON "users"("purge_after");
CREATE INDEX "payment_events_user_created_idx" ON "payment_events"("user_id", "created_at");
CREATE INDEX "idempotency_records_created_idx" ON "idempotency_records"("created_at");

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_source_fkey" FOREIGN KEY ("source_assessment_id") REFERENCES "assessments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_source_same_user_fkey" FOREIGN KEY ("source_assessment_id", "user_id") REFERENCES "assessments"("id", "user_id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "assessment_results" ADD CONSTRAINT "results_assessment_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_assessment_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_assessment_owner_fkey" FOREIGN KEY ("assessment_id", "user_id") REFERENCES "assessments"("id", "user_id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_subscription_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_subscription_owner_fkey" FOREIGN KEY ("subscription_id", "user_id") REFERENCES "subscriptions"("id", "user_id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
