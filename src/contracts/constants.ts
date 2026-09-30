export const HEALTH_CONSENT_VERSION = "health-v2" as const;
export const MODEL_SCOPE_VERSION = "wellness-scope-v2" as const;
export const ALGORITHM_VERSION = "wellness-v3.0" as const;
export const SESSION_COOKIE = "health_session" as const;

export const STEPS = ["profile", "activity", "lifestyle", "nutrition", "metrics"] as const;
export type StepKey = (typeof STEPS)[number];

export const SEXES = ["MALE", "FEMALE"] as const;
export type Sex = (typeof SEXES)[number];

export const GOALS = ["LOSE_WEIGHT", "MAINTAIN", "GAIN_WEIGHT"] as const;
export type Goal = (typeof GOALS)[number];

export const ACTIVITY_LEVELS = ["SEDENTARY", "LIGHT", "MODERATE", "HIGH"] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.375,
  MODERATE: 1.55,
  HIGH: 1.725,
};

export const METRIC_LIMITS = {
  age: { min: 18, max: 80 },
  heightCm: { min: 90, max: 242 },
  weightKg: { min: 25, max: 300 },
  targetWeightKg: { min: 25, max: 300 },
} as const;
