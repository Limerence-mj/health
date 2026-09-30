import { ACTIVITY_FACTORS, METRIC_LIMITS, MODEL_SCOPE_VERSION, STEPS, type Goal, type StepKey } from "@/contracts/constants";
import { isStageComplete } from "@/contracts/questionnaire";
import type {
  AssessmentAnswers,
  CalculationOutcome,
  CompleteAssessmentInput,
  Eligibility,
  PredictionPoint,
  Progress,
} from "@/domain/types";

const DAY_MS = 86_400_000;

function roundOne(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function bmi(weightKg: number, heightCm: number): number {
  return weightKg / (heightCm / 100) ** 2;
}

export function targetRange(goal: Goal, heightCm: number, weightKg: number): { min: number; max: number } | null {
  void goal;
  void heightCm;
  void weightKg;
  return { min: METRIC_LIMITS.targetWeightKg.min, max: METRIC_LIMITS.targetWeightKg.max };
}

export function validateMetrics(goal: Goal, heightCm: number, weightKg: number, targetWeightKg: number): Eligibility {
  void goal;
  if (heightCm < METRIC_LIMITS.heightCm.min || heightCm > METRIC_LIMITS.heightCm.max ||
      weightKg < METRIC_LIMITS.weightKg.min || weightKg > METRIC_LIMITS.weightKg.max) {
    return { status: "UNSUPPORTED", reasonCodes: ["METRICS_OUTSIDE_INPUT_RANGE"] };
  }
  const range = targetRange(goal, heightCm, weightKg);
  if (!range || targetWeightKg < range.min || targetWeightKg > range.max) {
    return { status: "UNSUPPORTED", reasonCodes: ["TARGET_OUTSIDE_ALLOWED_RANGE"], allowedTargetRange: range };
  }
  return { status: "SUPPORTED", reasonCodes: [] };
}

export function toCompleteInput(answers: AssessmentAnswers): CompleteAssessmentInput | null {
  if (
    answers.age === null || answers.sex === null || answers.goal === null || answers.heightCm === null ||
    answers.weightKg === null || answers.targetWeightKg === null || answers.activityLevel === null ||
    answers.scopeVersion !== MODEL_SCOPE_VERSION || answers.scopeConfirmedAt === null
  ) return null;
  return {
    age: answers.age,
    sex: answers.sex,
    goal: answers.goal,
    heightCm: answers.heightCm,
    weightKg: answers.weightKg,
    targetWeightKg: answers.targetWeightKg,
    activityLevel: answers.activityLevel,
  };
}

export function calculateEligibility(answers: AssessmentAnswers): Eligibility {
  if (answers.age !== null && (answers.age < METRIC_LIMITS.age.min || answers.age > METRIC_LIMITS.age.max)) {
    return { status: "UNSUPPORTED", reasonCodes: ["AGE_OUTSIDE_MODEL_RANGE"] };
  }
  if (answers.scopeVersion !== null && answers.scopeVersion !== MODEL_SCOPE_VERSION) {
    return { status: "UNSUPPORTED", reasonCodes: ["SCOPE_VERSION_UNSUPPORTED"] };
  }
  if (answers.goal && answers.heightCm !== null && answers.weightKg !== null && answers.targetWeightKg !== null) {
    const metrics = validateMetrics(answers.goal, answers.heightCm, answers.weightKg, answers.targetWeightKg);
    if (metrics.status === "UNSUPPORTED") return metrics;
  }
  const input = toCompleteInput(answers);
  if (!input) return { status: "INCOMPLETE", reasonCodes: [] };
  const outcome = calculateAssessment(input, new Date("2000-01-01T00:00:00.000Z"));
  return outcome.status === "SUPPORTED" ? { status: "SUPPORTED", reasonCodes: [] } : outcome;
}

export function calculateProgress(answers: AssessmentAnswers, completed = false): { progress: Progress; eligibility: Eligibility } {
  const valid: Record<StepKey, boolean> = {
    profile: answers.goal !== null && answers.scopeVersion === MODEL_SCOPE_VERSION && answers.scopeConfirmedAt !== null && isStageComplete(answers.questionnaireAnswers, "profile"),
    activity: answers.activityLevel !== null && isStageComplete(answers.questionnaireAnswers, "activity"),
    lifestyle: isStageComplete(answers.questionnaireAnswers, "lifestyle"),
    nutrition: isStageComplete(answers.questionnaireAnswers, "nutrition"),
    metrics: false,
  };
  if (answers.age !== null && answers.sex !== null && answers.goal && answers.heightCm !== null && answers.weightKg !== null && answers.targetWeightKg !== null) {
    valid.metrics = answers.age >= METRIC_LIMITS.age.min && answers.age <= METRIC_LIMITS.age.max &&
      isStageComplete(answers.questionnaireAnswers, "metrics") &&
      validateMetrics(answers.goal, answers.heightCm, answers.weightKg, answers.targetWeightKg).status === "SUPPORTED";
  }
  const completedSteps: StepKey[] = [];
  for (const step of STEPS) {
    if (!valid[step]) break;
    completedSteps.push(step);
  }
  const invalidatedSteps = STEPS.filter((step, index) => index < furthestAnsweredIndex(answers) && !valid[step]);
  const eligibility = calculateEligibility(answers);
  const nextStep = completedSteps.length === STEPS.length ? null : STEPS[completedSteps.length] ?? null;
  return {
    eligibility,
    progress: {
      completedSteps,
      invalidatedSteps,
      percent: completedSteps.length * 20,
      nextStep,
      canSubmit: !completed && completedSteps.length === STEPS.length && eligibility.status === "SUPPORTED",
    },
  };
}

function furthestAnsweredIndex(answers: AssessmentAnswers): number {
  let index = 0;
  for (const [position, step] of STEPS.entries()) {
    if (answers.questionnaireAnswers[step] && Object.keys(answers.questionnaireAnswers[step] ?? {}).length > 0) index = position + 1;
  }
  return index;
}

export function calculateAssessment(input: CompleteAssessmentInput, calculationDate: Date): CalculationOutcome {
  if (input.age < METRIC_LIMITS.age.min || input.age > METRIC_LIMITS.age.max) return { status: "UNSUPPORTED", reasonCodes: ["AGE_OUTSIDE_MODEL_RANGE"] };
  const metrics = validateMetrics(input.goal, input.heightCm, input.weightKg, input.targetWeightKg);
  if (metrics.status !== "SUPPORTED") return { status: "UNSUPPORTED", reasonCodes: metrics.reasonCodes };

  const calculatedBmi = bmi(input.weightKg, input.heightCm);
  const ree = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age + (input.sex === "MALE" ? 5 : -161);
  const maintenance = ree * ACTIVITY_FACTORS[input.activityLevel];
  const suggested = input.goal === "LOSE_WEIGHT"
    ? Math.max(ree, maintenance - Math.min(maintenance * 0.15, 500))
    : input.goal === "GAIN_WEIGHT"
      ? maintenance + Math.min(maintenance * 0.1, 250)
      : maintenance;
  if (![ree, maintenance, suggested].every(Number.isFinite) || ree <= 0 || maintenance <= 0 || suggested <= 0) {
    return { status: "UNSUPPORTED", reasonCodes: ["CALCULATION_NOT_FINITE"] };
  }

  const baseDate = formatUtcDate(calculationDate);
  const difference = Math.abs(input.targetWeightKg - input.weightKg);
  const durationDays = input.goal === "MAINTAIN" ? 0 : Math.ceil(difference / 0.25 * 7);
  const targetDate = addUtcDays(baseDate, durationDays);
  const predictionCurve = buildPredictionCurve(baseDate, durationDays, input.weightKg, input.targetWeightKg);
  const calculatedWarnings: { code: string; message: string }[] = [];
  if (calculatedBmi < 18.5 || calculatedBmi >= 40) {
    calculatedWarnings.push({ code: "BMI_REVIEW_RECOMMENDED", message: "当前 BMI 位于常规自助计划之外，建议先向医生或注册营养师确认合适目标。" });
  }
  if (difference > input.weightKg * 0.2) {
    calculatedWarnings.push({ code: "PHASED_GOAL_RECOMMENDED", message: "目标变化幅度较大，报告将其视为长期方向，建议拆分为多个阶段并定期复评。" });
  }
  if (suggested < 1000 || suggested > 5000) {
    calculatedWarnings.push({ code: "ENERGY_ESTIMATE_REVIEW_RECOMMENDED", message: "能量估算超出通用自助场景，完整报告中的数值只用于展示计算情景，不应直接作为摄入目标；请先咨询医生或注册营养师。" });
  }
  const directionMismatch = (input.goal === "LOSE_WEIGHT" && input.targetWeightKg >= input.weightKg) ||
    (input.goal === "GAIN_WEIGHT" && input.targetWeightKg <= input.weightKg);
  if (directionMismatch) calculatedWarnings.push({ code: "GOAL_DIRECTION_MISMATCH", message: "目标体重与所选方向不一致，已保留你的输入，请在执行前再次确认。" });
  return {
    status: "SUPPORTED",
    result: {
      bmi: calculatedBmi,
      restingEnergyKcal: Math.round(ree),
      maintenanceKcal: Math.round(maintenance),
      suggestedIntakeKcal: Math.round(suggested),
      predictionStatus: durationDays === 0 ? "AT_TARGET" : "PROJECTED",
      baseDate,
      targetDate,
      durationDays,
      weeklyChangeKg: durationDays === 0 ? 0 : 0.25,
      predictionCurve,
      warnings: calculatedWarnings,
    },
  };
}

function buildPredictionCurve(baseDate: string, durationDays: number, from: number, to: number): PredictionPoint[] {
  if (durationDays === 0) return [{ date: baseDate, weightKg: roundOne(from) }];
  const points: PredictionPoint[] = [{ date: baseDate, weightKg: roundOne(from) }];
  const intervalDays = Math.max(7, Math.ceil(durationDays / 104 / 7) * 7);
  for (let day = intervalDays; day < durationDays; day += intervalDays) {
    points.push({ date: addUtcDays(baseDate, day), weightKg: roundOne(from + (to - from) * day / durationDays) });
  }
  points.push({ date: addUtcDays(baseDate, durationDays), weightKg: roundOne(to) });
  return points;
}

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(isoDate: string, days: number): string {
  const timestamp = Date.parse(`${isoDate}T00:00:00.000Z`) + days * DAY_MS;
  return new Date(timestamp).toISOString().slice(0, 10);
}
