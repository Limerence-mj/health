import { z } from "zod";
import {
  ACTIVITY_LEVELS,
  GOALS,
  HEALTH_CONSENT_VERSION,
  METRIC_LIMITS,
  MODEL_SCOPE_VERSION,
  SEXES,
  STEPS,
} from "@/contracts/constants";

const oneDecimal = (value: number) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;

export const revisionSchema = z.number().int().min(0);
export const idempotencyKeySchema = z.uuid();
export const assessmentIdSchema = z.uuid();

const oneOrMore = <T extends readonly [string, ...string[]]>(values: T) => z.array(z.enum(values)).min(1).max(12).refine(
  (items) => new Set(items).size === items.length,
  "选项不能重复",
);
const noneExclusive = <T extends z.ZodType<string[]>>(schema: T) => schema.refine(
  (values) => !(values.includes("NONE") && values.length > 1),
  "NONE 不能与其他选项同时提交",
);
const partialStep = <T extends z.ZodRawShape>(shape: T) => z.strictObject(shape).refine(
  (value) => Object.keys(value).length > 0,
  "至少提交一个答案",
);

export const profileDataSchema = partialStep({
  healthDataConsent: z.literal(true).optional(),
  consentVersion: z.literal(HEALTH_CONSENT_VERSION).optional(),
  modelScopeConfirmed: z.literal(true).optional(),
  scopeVersion: z.literal(MODEL_SCOPE_VERSION).optional(),
  ageRange: z.enum(["18_29", "30_39", "40_49", "50_PLUS"]).optional(),
  pilatesExperience: z.enum(["YES", "NO"]).optional(),
  goal: z.enum(GOALS).optional(),
  secondaryGoals: noneExclusive(oneOrMore(["STRENGTH", "POSTURE", "STRESS", "FLEXIBILITY", "NONE"])).optional(),
  bodyBuild: z.enum(["SLIM", "MID", "PLUS", "LARGE"]).optional(),
  dreamBody: z.enum(["LEAN", "TONED", "CURVY", "BALANCED"]).optional(),
  weightTendency: z.enum(["GAIN_FAST", "CHANGE_EASILY", "GAIN_HARD"]).optional(),
  bestShapeTiming: z.enum(["UNDER_YEAR", "ONE_TWO_YEARS", "OVER_THREE_YEARS", "NEVER"]).optional(),
});

const decimalField = (label: string, min: number, max: number) =>
  z.number().finite().min(min, `${label}不能小于 ${min}`).max(max, `${label}不能大于 ${max}`).refine(oneDecimal, `${label}最多一位小数`);

export const metricsDataSchema = z.strictObject({
  heightCm: decimalField("身高", METRIC_LIMITS.heightCm.min, METRIC_LIMITS.heightCm.max).optional(),
  weightKg: decimalField("当前体重", METRIC_LIMITS.weightKg.min, METRIC_LIMITS.weightKg.max).optional(),
  targetWeightKg: decimalField("目标体重", METRIC_LIMITS.targetWeightKg.min, METRIC_LIMITS.targetWeightKg.max).optional(),
  age: z.number().int().min(METRIC_LIMITS.age.min).max(METRIC_LIMITS.age.max).optional(),
  sex: z.enum(SEXES).optional(),
  importantEvent: z.enum(["VACATION", "WEDDING", "HOLIDAY", "SPORT", "REUNION", "BIRTHDAY", "OTHER", "NONE"]).optional(),
}).refine((value) => Object.keys(value).length > 0, "至少提交一个答案");

export const activityDataSchema = partialStep({
  flexibility: z.enum(["FLEXIBLE", "STARTING", "LIMITED", "UNSURE"]).optional(),
  exerciseFrequency: z.enum(["ALMOST_DAILY", "SEVERAL_WEEKLY", "SEVERAL_MONTHLY", "NEVER"]).optional(),
  targetZones: oneOrMore(["CORE", "LEGS", "GLUTES", "CHEST", "ARMS", "BACK"]).optional(),
  stairsBreath: z.enum(["VERY_BREATHLESS", "SLIGHTLY", "ONE_FLIGHT", "FEW_FLIGHTS"]).optional(),
  sensitivities: noneExclusive(oneOrMore(["BACK", "KNEES", "WRISTS", "NONE"])).optional(),
  walkingFrequency: z.enum(["ALMOST_DAILY", "THREE_FOUR_WEEKLY", "ONE_TWO_WEEKLY", "MONTHLY"]).optional(),
  equipmentExperience: z.enum(["LOVED", "DID_NOT_WORK", "NEVER"]).optional(),
  equipmentBarrier: z.enum(["CHALLENGING", "NO_EQUIPMENT", "PRICE", "UNCERTAIN", "USAGE", "BODYWEIGHT", "OTHER"]).optional(),
  activityLevel: z.enum(ACTIVITY_LEVELS).optional(),
});

export const lifestyleDataSchema = partialStep({
  workSchedule: z.enum(["DAYTIME", "NIGHT", "FLEXIBLE", "NOT_WORKING"]).optional(),
  typicalDay: z.enum(["MOSTLY_SITTING", "ACTIVE_BREAKS", "ON_FEET"]).optional(),
  energyLevel: z.enum(["LOW", "AFTERNOON_SLUMP", "BEFORE_MEALS", "STEADY"]).optional(),
  waterIntake: z.enum(["COFFEE_TEA", "TWO_GLASSES", "TWO_SIX", "MORE_SIX"]).optional(),
  sleepDuration: z.enum(["UNDER_FIVE", "FIVE_SIX", "SEVEN_EIGHT", "OVER_EIGHT"]).optional(),
  weightGainEvents: noneExclusive(oneOrMore(["RELATIONSHIP", "BUSY", "FINANCIAL", "STRESS", "AGING", "SOCIAL", "NONE"])).optional(),
});

export const nutritionDataSchema = partialStep({
  breakfastTime: z.enum(["SIX_EIGHT", "EIGHT_TEN", "TEN_NOON", "SKIP"]).optional(),
  lunchTime: z.enum(["TEN_NOON", "NOON_TWO", "TWO_FOUR", "SKIP"]).optional(),
  dinnerTime: z.enum(["FOUR_SIX", "SIX_EIGHT", "EIGHT_TEN", "SKIP"]).optional(),
  dietPreference: z.enum(["TRADITIONAL", "KETO", "PALEO", "VEGETARIAN", "VEGAN", "MEDITERRANEAN", "PESCATARIAN", "LACTOSE_FREE", "GLUTEN_FREE"]).optional(),
  eatingHabits: noneExclusive(oneOrMore(["LATE_NIGHT", "SWEET", "SODA", "SALTY", "NONE"])).optional(),
});

export const stepKeySchema = z.enum(STEPS);

export const stepSaveBodySchemas = {
  profile: z.strictObject({ expectedRevision: revisionSchema, data: profileDataSchema }),
  activity: z.strictObject({ expectedRevision: revisionSchema, data: activityDataSchema }),
  lifestyle: z.strictObject({ expectedRevision: revisionSchema, data: lifestyleDataSchema }),
  nutrition: z.strictObject({ expectedRevision: revisionSchema, data: nutritionDataSchema }),
  metrics: z.strictObject({ expectedRevision: revisionSchema, data: metricsDataSchema }),
} as const;

export const submitBodySchema = z.strictObject({ expectedRevision: revisionSchema });
export const createAssessmentBodySchema = z.strictObject({ copyFromAssessmentId: z.uuid().optional() });
export const paymentBodySchema = z.strictObject({
  assessmentId: z.uuid(),
  eventId: z.uuid(),
  planCode: z.literal("DEMO_30D"),
});
export const deleteMeBodySchema = z.strictObject({ confirmation: z.literal("DELETE_MY_DATA") });

export type ProfileData = z.infer<typeof profileDataSchema>;
export type MetricsData = z.infer<typeof metricsDataSchema>;
export type ActivityData = z.infer<typeof activityDataSchema>;
export type LifestyleData = z.infer<typeof lifestyleDataSchema>;
export type NutritionData = z.infer<typeof nutritionDataSchema>;
