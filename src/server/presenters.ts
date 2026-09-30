import type { Assessment, AssessmentResult, Prisma, Subscription } from "@prisma/client";
import { ALGORITHM_VERSION, HEALTH_CONSENT_VERSION, MODEL_SCOPE_VERSION, STEPS, type StepKey } from "@/contracts/constants";
import { calculateProgress } from "@/domain/assessment";
import { effectiveSubscriptionStatus } from "@/domain/subscription";
import type { AssessmentAnswers } from "@/domain/types";
import { buildPersonalPlan, toPlanPreview, type PersonalPlan } from "@/domain/personal-plan";
import type { QuestionnaireAnswers, StageAnswers } from "@/contracts/questionnaire";
import { env } from "@/server/config";
import { AppError } from "@/server/errors";

export function assessmentAnswers(assessment: Assessment): AssessmentAnswers {
  return {
    age: assessment.age,
    sex: assessment.sex as AssessmentAnswers["sex"],
    scopeVersion: assessment.scopeVersion,
    scopeConfirmedAt: assessment.scopeConfirmedAt,
    goal: assessment.goal as AssessmentAnswers["goal"],
    heightCm: assessment.heightCm === null ? null : Number(assessment.heightCm),
    weightKg: assessment.weightKg === null ? null : Number(assessment.weightKg),
    targetWeightKg: assessment.targetWeightKg === null ? null : Number(assessment.targetWeightKg),
    activityLevel: assessment.activityLevel as AssessmentAnswers["activityLevel"],
    questionnaireAnswers: parseQuestionnaireAnswers(assessment.questionnaireAnswers),
  };
}

function parseQuestionnaireAnswers(value: Prisma.JsonValue): QuestionnaireAnswers {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as QuestionnaireAnswers;
}

export function toAssessmentDto(assessment: Assessment) {
  const answers = assessmentAnswers(assessment);
  const { progress, eligibility } = calculateProgress(answers, assessment.status === "COMPLETED");
  return {
    assessmentId: assessment.id,
    sourceAssessmentId: assessment.sourceAssessmentId,
    status: assessment.status,
    revision: assessment.revision,
    answers: {
      age: answers.age,
      sex: answers.sex,
      goal: answers.goal,
      heightCm: answers.heightCm,
      weightKg: answers.weightKg,
      targetWeightKg: answers.targetWeightKg,
      activityLevel: answers.activityLevel,
    },
    questionnaireAnswers: answers.questionnaireAnswers,
    scope: {
      requiredVersion: MODEL_SCOPE_VERSION,
      acceptedVersion: answers.scopeVersion,
      confirmedAt: answers.scopeConfirmedAt?.toISOString() ?? null,
      confirmed: answers.scopeVersion === MODEL_SCOPE_VERSION && answers.scopeConfirmedAt !== null,
    },
    progress,
    eligibility,
  };
}

export function nextRoute(dto: ReturnType<typeof toAssessmentDto>): string {
  if (dto.status === "COMPLETED") return `/results/${dto.assessmentId}`;
  if (dto.eligibility.status === "UNSUPPORTED" && dto.progress.percent === 100) return "/assessment/review";
  if (dto.progress.nextStep) return `/assessment/${dto.progress.nextStep}`;
  return "/assessment/review";
}

export function subscriptionDto(subscription: Subscription, now: Date) {
  const effectiveStatus = effectiveSubscriptionStatus({
    status: subscription.status as "INACTIVE" | "ACTIVE",
    startsAt: subscription.startsAt,
    expiresAt: subscription.expiresAt,
  }, now);
  if (effectiveStatus === "INVALID") throw new AppError(503, "TEMPORARILY_UNAVAILABLE", "权益状态暂时不可用");
  return {
    effectiveStatus,
    startsAt: subscription.startsAt?.toISOString() ?? null,
    expiresAt: subscription.expiresAt?.toISOString() ?? null,
  };
}

export function sessionDto(input: {
  sessionId: string;
  expiresAt: Date;
  assessment: Assessment | null;
  healthConsentVersion: string | null;
  healthConsentAt: Date | null;
  subscription: Subscription;
  now: Date;
}) {
  const assessment = input.assessment ? toAssessmentDto(input.assessment) : null;
  return {
    sessionId: input.sessionId,
    expiresAt: input.expiresAt.toISOString(),
    currentAssessmentId: assessment?.assessmentId ?? null,
    nextStep: assessment?.progress.nextStep ?? null,
    nextRoute: assessment ? nextRoute(assessment) : null,
    consent: {
      requiredVersion: HEALTH_CONSENT_VERSION,
      acceptedVersion: input.healthConsentVersion,
      acceptedAt: input.healthConsentAt?.toISOString() ?? null,
      accepted: input.healthConsentVersion === HEALTH_CONSENT_VERSION && input.healthConsentAt !== null,
    },
    subscription: subscriptionDto(input.subscription, input.now),
    capabilities: {
      mockPaymentsEnabled: env().MOCK_PAYMENTS_ENABLED,
      publicDemoEnabled: env().DEMO_MODE,
    },
  };
}

export function warningsFromResult(result: AssessmentResult): { code: string; message: string }[] {
  const metadata = result.calculationMetadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const warnings = (metadata as Record<string, unknown>).warnings;
  if (!Array.isArray(warnings)) return [];
  return warnings.filter((item): item is { code: string; message: string } => Boolean(
    item && typeof item === "object" && typeof (item as Record<string, unknown>).code === "string" &&
    typeof (item as Record<string, unknown>).message === "string",
  ));
}

function resultSnapshot(assessment: Assessment, result: AssessmentResult) {
  const value = result.inputSnapshot;
  const snapshot = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    goal: typeof snapshot.goal === "string" ? snapshot.goal : assessment.goal,
    age: typeof snapshot.age === "number" ? snapshot.age : assessment.age,
    activityLevel: typeof snapshot.activityLevel === "string" ? snapshot.activityLevel : assessment.activityLevel,
    questionnaireAnswers: parseQuestionnaireAnswers((snapshot.questionnaireAnswers ?? assessment.questionnaireAnswers) as Prisma.JsonValue),
  };
}

function planFromResult(assessment: Assessment, result: AssessmentResult): PersonalPlan {
  if (result.personalPlan && typeof result.personalPlan === "object" && !Array.isArray(result.personalPlan)) {
    return result.personalPlan as unknown as PersonalPlan;
  }
  const snapshot = resultSnapshot(assessment, result);
  return buildPersonalPlan(snapshot);
}

function wellnessProfile(questionnaire: QuestionnaireAnswers) {
  const stage = (key: keyof QuestionnaireAnswers): StageAnswers => questionnaire[key] ?? {};
  return {
    secondaryGoals: stage("profile").secondaryGoals ?? [],
    dreamBody: stage("profile").dreamBody ?? null,
    flexibility: stage("activity").flexibility ?? null,
    exerciseFrequency: stage("activity").exerciseFrequency ?? null,
    targetZones: stage("activity").targetZones ?? [],
    sensitivities: stage("activity").sensitivities ?? [],
    workSchedule: stage("lifestyle").workSchedule ?? null,
    energyLevel: stage("lifestyle").energyLevel ?? null,
    waterIntake: stage("lifestyle").waterIntake ?? null,
    sleepDuration: stage("lifestyle").sleepDuration ?? null,
    dietPreference: stage("nutrition").dietPreference ?? null,
    eatingHabits: stage("nutrition").eatingHabits ?? [],
  };
}

export function previewReport(assessment: Assessment, result: AssessmentResult, subscription: Subscription, now: Date, demo = false) {
  const status = subscriptionDto(subscription, now);
  const snapshot = resultSnapshot(assessment, result);
  const personalPlan = planFromResult(assessment, result);
  return {
    assessmentId: assessment.id,
    access: "PREVIEW" as const,
    summary: { bmi: Math.round(Number(result.bmi) * 10) / 10, goal: snapshot.goal },
    wellnessProfile: wellnessProfile(snapshot.questionnaireAnswers),
    planPreview: toPlanPreview(personalPlan),
    lockedFeatures: ["personalPlan", "nutrition", "targetDate", "predictionCurve"],
    warnings: warningsFromResult(result),
    subscription: status,
    paymentAvailable: !demo && env().MOCK_PAYMENTS_ENABLED && status.effectiveStatus !== "ACTIVE",
    upgradeRequired: !demo,
    notice: "估算仅用于本测评演示，不构成医疗建议",
  };
}

export function fullReport(assessment: Assessment, result: AssessmentResult, subscription: Subscription, now: Date, demo = false) {
  const status = subscriptionDto(subscription, now);
  if (status.effectiveStatus !== "ACTIVE") throw new AppError(503, "DEMO_NOT_READY", "完整演示报告暂时不可用");
  const curve = result.predictionCurve as { date: string; weightKg: number }[];
  const snapshot = resultSnapshot(assessment, result);
  const personalPlan = planFromResult(assessment, result);
  return {
    assessmentId: assessment.id,
    access: "FULL" as const,
    summary: { bmi: Math.round(Number(result.bmi) * 10) / 10, goal: snapshot.goal },
    wellnessProfile: wellnessProfile(snapshot.questionnaireAnswers),
    planPreview: toPlanPreview(personalPlan),
    personalPlan,
    nutrition: {
      restingEnergyKcal: result.restingEnergyKcal,
      maintenanceKcal: result.maintenanceKcal,
      suggestedIntakeKcal: result.suggestedIntakeKcal,
    },
    prediction: {
      status: result.predictionStatus,
      baseDate: result.baseDate.toISOString().slice(0, 10),
      targetDate: result.targetDate?.toISOString().slice(0, 10) ?? null,
      durationDays: result.durationDays,
      weeklyChangeKg: Number(result.weeklyChangeKg),
      curve,
    },
    subscription: status,
    algorithmVersion: result.algorithmVersion || ALGORITHM_VERSION,
    warnings: warningsFromResult(result),
    paymentAvailable: false,
    upgradeRequired: false,
    notice: "固定变化速度的情景估算，实际变化可能不同",
    ...(demo ? { demo: true } : {}),
  };
}

export function isStepOpen(completedSteps: StepKey[], step: StepKey): boolean {
  const index = STEPS.indexOf(step);
  return index === 0 || completedSteps.length >= index;
}
