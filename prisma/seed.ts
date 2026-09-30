import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { ALGORITHM_VERSION, HEALTH_CONSENT_VERSION, MODEL_SCOPE_VERSION } from "../src/contracts/constants";
import { calculateAssessment } from "../src/domain/assessment";
import { buildPersonalPlan } from "../src/domain/personal-plan";

const db = new PrismaClient();
const userId = "00000000-0000-4000-8000-000000000030";
const subscriptionId = "00000000-0000-4000-8000-000000000040";
const resultId = "00000000-0000-4000-8000-000000000050";
const sessionId = process.env.DEMO_PAID_SESSION_ID ?? "00000000-0000-4000-8000-000000000010";
const assessmentId = process.env.DEMO_PAID_ASSESSMENT_ID ?? "00000000-0000-4000-8000-000000000020";

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function main() {
  const now = new Date();
  const startsAt = new Date(now.getTime() - 86_400_000);
  const expiresAt = new Date(now.getTime() + 45 * 86_400_000);
  const input = {
    age: 32, sex: "FEMALE" as const, goal: "LOSE_WEIGHT" as const,
    heightCm: 165, weightKg: 72, targetWeightKg: 64, activityLevel: "MODERATE" as const,
  };
  const questionnaireAnswers = {
    profile: { healthDataConsent: true, consentVersion: HEALTH_CONSENT_VERSION, modelScopeConfirmed: true, scopeVersion: MODEL_SCOPE_VERSION, ageRange: "30_39", pilatesExperience: "NO", goal: "LOSE_WEIGHT", secondaryGoals: ["POSTURE", "FLEXIBILITY"], bodyBuild: "MID", dreamBody: "TONED", weightTendency: "CHANGE_EASILY", bestShapeTiming: "ONE_TWO_YEARS" },
    activity: { flexibility: "STARTING", exerciseFrequency: "SEVERAL_WEEKLY", targetZones: ["CORE", "BACK"], stairsBreath: "SLIGHTLY", sensitivities: ["NONE"], walkingFrequency: "THREE_FOUR_WEEKLY", equipmentExperience: "NEVER", equipmentBarrier: "NO_EQUIPMENT" },
    lifestyle: { workSchedule: "DAYTIME", typicalDay: "ACTIVE_BREAKS", energyLevel: "STEADY", waterIntake: "TWO_SIX", sleepDuration: "SEVEN_EIGHT", weightGainEvents: ["NONE"] },
    nutrition: { breakfastTime: "SIX_EIGHT", lunchTime: "NOON_TWO", dinnerTime: "SIX_EIGHT", dietPreference: "TRADITIONAL", eatingHabits: ["NONE"] },
    metrics: {
      heightCm: input.heightCm,
      weightKg: input.weightKg,
      targetWeightKg: input.targetWeightKg,
      age: input.age,
      sex: input.sex,
      importantEvent: "NONE",
    },
  };
  const outcome = calculateAssessment(input, now);
  if (outcome.status !== "SUPPORTED") throw new Error("DEMO_DATA_UNSUPPORTED");
  const result = outcome.result;
  const personalPlan = buildPersonalPlan({ goal: input.goal, age: input.age, activityLevel: input.activityLevel, questionnaireAnswers });
  await db.$transaction(async (tx) => {
    await tx.user.upsert({
      where: { id: userId },
      create: { id: userId, isDemo: true, healthConsentVersion: HEALTH_CONSENT_VERSION, healthConsentAt: now, purgeAfter: expiresAt, createdAt: now, updatedAt: now },
      update: { isDemo: true, healthConsentVersion: HEALTH_CONSENT_VERSION, healthConsentAt: now, purgeAfter: expiresAt, updatedAt: now },
    });
    await tx.session.upsert({
      where: { id: sessionId },
      create: { id: sessionId, userId, tokenHash: createHash("sha256").update("public-demo-not-a-credential").digest("hex"), expiresAt, createdAt: now },
      update: { userId, expiresAt, revokedAt: null },
    });
    await tx.assessment.upsert({
      where: { id: assessmentId },
      create: { id: assessmentId, userId, status: "COMPLETED", revision: 6, ...input, questionnaireAnswers: json(questionnaireAnswers), scopeVersion: MODEL_SCOPE_VERSION, scopeConfirmedAt: now, submittedAt: now, createdAt: now, updatedAt: now },
      update: { userId, status: "COMPLETED", revision: 6, ...input, questionnaireAnswers: json(questionnaireAnswers), scopeVersion: MODEL_SCOPE_VERSION, scopeConfirmedAt: now, submittedAt: now, updatedAt: now },
    });
    await tx.assessmentResult.upsert({
      where: { assessmentId },
      create: {
        id: resultId, assessmentId, sourceRevision: 5, algorithmVersion: ALGORITHM_VERSION,
        inputSnapshot: json({ ...input, questionnaireAnswers }), calculationMetadata: json({ activityLevel: input.activityLevel, activityFactor: 1.55, predictionScenario: "0.25kg/week", warnings: result.warnings }), personalPlan: json(personalPlan),
        bmi: result.bmi, restingEnergyKcal: result.restingEnergyKcal, maintenanceKcal: result.maintenanceKcal,
        suggestedIntakeKcal: result.suggestedIntakeKcal, predictionStatus: result.predictionStatus,
        baseDate: new Date(`${result.baseDate}T00:00:00.000Z`), targetDate: result.targetDate ? new Date(`${result.targetDate}T00:00:00.000Z`) : null,
        durationDays: result.durationDays, weeklyChangeKg: result.weeklyChangeKg, predictionCurve: json(result.predictionCurve), createdAt: now,
      },
      update: {
        sourceRevision: 5, algorithmVersion: ALGORITHM_VERSION, inputSnapshot: json({ ...input, questionnaireAnswers }),
        calculationMetadata: json({ activityLevel: input.activityLevel, activityFactor: 1.55, predictionScenario: "0.25kg/week", warnings: result.warnings }), personalPlan: json(personalPlan),
        bmi: result.bmi, restingEnergyKcal: result.restingEnergyKcal, maintenanceKcal: result.maintenanceKcal,
        suggestedIntakeKcal: result.suggestedIntakeKcal, predictionStatus: result.predictionStatus,
        baseDate: new Date(`${result.baseDate}T00:00:00.000Z`), targetDate: result.targetDate ? new Date(`${result.targetDate}T00:00:00.000Z`) : null,
        durationDays: result.durationDays, weeklyChangeKg: result.weeklyChangeKg, predictionCurve: json(result.predictionCurve),
      },
    });
    await tx.subscription.upsert({
      where: { userId },
      create: { id: subscriptionId, userId, status: "ACTIVE", planCode: "DEMO_30D", startsAt, expiresAt, createdAt: now, updatedAt: now },
      update: { status: "ACTIVE", planCode: "DEMO_30D", startsAt, expiresAt, updatedAt: now },
    });
  });
}

main().finally(async () => db.$disconnect());
