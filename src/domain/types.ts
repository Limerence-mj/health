import type { ActivityLevel, Goal, Sex, StepKey } from "@/contracts/constants";
import type { QuestionnaireAnswers } from "@/contracts/questionnaire";

export type AssessmentAnswers = {
  age: number | null;
  sex: Sex | null;
  scopeVersion: string | null;
  scopeConfirmedAt: Date | null;
  goal: Goal | null;
  heightCm: number | null;
  weightKg: number | null;
  targetWeightKg: number | null;
  activityLevel: ActivityLevel | null;
  questionnaireAnswers: QuestionnaireAnswers;
};

export type CompleteAssessmentInput = {
  age: number;
  sex: Sex;
  goal: Goal;
  heightCm: number;
  weightKg: number;
  targetWeightKg: number;
  activityLevel: ActivityLevel;
};

export type Eligibility =
  | { status: "INCOMPLETE"; reasonCodes: string[] }
  | { status: "SUPPORTED"; reasonCodes: string[] }
  | { status: "UNSUPPORTED"; reasonCodes: string[]; allowedTargetRange?: { min: number; max: number } | null };

export type Progress = {
  completedSteps: StepKey[];
  invalidatedSteps: StepKey[];
  percent: number;
  nextStep: StepKey | null;
  canSubmit: boolean;
};

export type PredictionPoint = { date: string; weightKg: number };

export type CalculationResult = {
  bmi: number;
  restingEnergyKcal: number;
  maintenanceKcal: number;
  suggestedIntakeKcal: number;
  predictionStatus: "PROJECTED" | "AT_TARGET";
  baseDate: string;
  targetDate: string | null;
  durationDays: number | null;
  weeklyChangeKg: number;
  predictionCurve: PredictionPoint[];
  warnings: { code: string; message: string }[];
};

export type CalculationOutcome =
  | { status: "SUPPORTED"; result: CalculationResult }
  | { status: "UNSUPPORTED"; reasonCodes: string[] };
