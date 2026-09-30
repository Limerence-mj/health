import type { ActivityLevel, StepKey } from "@/contracts/constants";

export type QuestionnaireValue = string | number | boolean | string[];
export type StageAnswers = Record<string, QuestionnaireValue>;
export type QuestionnaireAnswers = Partial<Record<StepKey, StageAnswers>>;

export const REQUIRED_ANSWER_KEYS: Record<StepKey, readonly string[]> = {
  profile: ["healthDataConsent", "modelScopeConfirmed", "ageRange", "pilatesExperience", "goal", "secondaryGoals", "bodyBuild", "dreamBody", "weightTendency", "bestShapeTiming"],
  activity: ["flexibility", "exerciseFrequency", "targetZones", "stairsBreath", "sensitivities", "walkingFrequency", "equipmentExperience"],
  lifestyle: ["workSchedule", "typicalDay", "energyLevel", "waterIntake", "sleepDuration", "weightGainEvents"],
  nutrition: ["breakfastTime", "lunchTime", "dinnerTime", "dietPreference", "eatingHabits"],
  metrics: ["heightCm", "weightKg", "targetWeightKg", "age", "sex", "importantEvent"],
};

export function hasAnswer(value: QuestionnaireValue | undefined): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return value !== undefined && value !== false;
}

export function isStageComplete(answers: QuestionnaireAnswers, step: StepKey): boolean {
  const stage = answers[step];
  return Boolean(stage && REQUIRED_ANSWER_KEYS[step].every((key) => hasAnswer(stage[key])));
}

export function activityLevelFromFrequency(value: string | undefined): ActivityLevel | null {
  if (value === "ALMOST_DAILY") return "HIGH";
  if (value === "SEVERAL_WEEKLY") return "MODERATE";
  if (value === "SEVERAL_MONTHLY") return "LIGHT";
  if (value === "NEVER") return "SEDENTARY";
  return null;
}
