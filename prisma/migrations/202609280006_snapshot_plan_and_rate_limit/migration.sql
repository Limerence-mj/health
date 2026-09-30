ALTER TABLE "assessment_results"
ADD COLUMN "personal_plan" JSONB;

CREATE TABLE "rate_limit_buckets" (
    "key" VARCHAR(64) NOT NULL,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "count" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "rate_limit_buckets_count_check" CHECK ("count" >= 0)
);
