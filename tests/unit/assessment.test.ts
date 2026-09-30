import { describe, expect, it } from "vitest";
import { activityDataSchema, metricsDataSchema, profileDataSchema } from "@/contracts/schemas";
import { calculateAssessment, calculateProgress, targetRange, validateMetrics } from "@/domain/assessment";
import { buildPersonalPlan, toPlanPreview } from "@/domain/personal-plan";
import type { AssessmentAnswers, CompleteAssessmentInput } from "@/domain/types";

const normal: CompleteAssessmentInput = {
  age: 30,
  sex: "FEMALE",
  goal: "LOSE_WEIGHT",
  heightCm: 170,
  weightKg: 70,
  targetWeightKg: 65,
  activityLevel: "MODERATE",
};

const questionnaireAnswers = {
  profile: { healthDataConsent: true, modelScopeConfirmed: true, ageRange: "30_39", pilatesExperience: "NO", goal: "LOSE_WEIGHT", secondaryGoals: ["POSTURE"], bodyBuild: "MID", dreamBody: "TONED", weightTendency: "CHANGE_EASILY", bestShapeTiming: "ONE_TWO_YEARS" },
  activity: { flexibility: "STARTING", exerciseFrequency: "SEVERAL_WEEKLY", targetZones: ["CORE"], stairsBreath: "SLIGHTLY", sensitivities: ["NONE"], walkingFrequency: "THREE_FOUR_WEEKLY", equipmentExperience: "NEVER" },
  lifestyle: { workSchedule: "DAYTIME", typicalDay: "ACTIVE_BREAKS", energyLevel: "STEADY", waterIntake: "TWO_SIX", sleepDuration: "SEVEN_EIGHT", weightGainEvents: ["NONE"] },
  nutrition: { breakfastTime: "SIX_EIGHT", lunchTime: "NOON_TWO", dinnerTime: "SIX_EIGHT", dietPreference: "TRADITIONAL", eatingHabits: ["NONE"] },
  metrics: { heightCm: 170, weightKg: 70, targetWeightKg: 65, age: 30, sex: "FEMALE", importantEvent: "NONE" },
} satisfies AssessmentAnswers["questionnaireAnswers"];

function completeAnswers(overrides: Partial<AssessmentAnswers> = {}): AssessmentAnswers {
  return {
    age: 30,
    sex: "FEMALE",
    scopeVersion: "wellness-scope-v2",
    scopeConfirmedAt: new Date("2026-09-28T00:00:00Z"),
    goal: "LOSE_WEIGHT",
    heightCm: 170,
    weightKg: 70,
    targetWeightKg: 65,
    activityLevel: "MODERATE",
    questionnaireAnswers,
    ...overrides,
  };
}

describe("健康评估纯函数", () => {
  it("计算固定正常样例", () => {
    const outcome = calculateAssessment(normal, new Date("2026-09-28T20:00:00-04:00"));
    expect(outcome.status).toBe("SUPPORTED");
    if (outcome.status !== "SUPPORTED") return;
    expect(outcome.result.bmi).toBeCloseTo(24.221, 3);
    expect(outcome.result.restingEnergyKcal).toBe(1452);
    expect(outcome.result.maintenanceKcal).toBe(2250);
    expect(outcome.result.suggestedIntakeKcal).toBe(1912);
    expect(outcome.result.durationDays).toBe(140);
    expect(outcome.result.baseDate).toBe("2026-09-29");
    expect(outcome.result.targetDate).toBe("2027-02-16");
    expect(outcome.result.predictionCurve.at(0)).toEqual({ date: "2026-09-29", weightKg: 70 });
    expect(outcome.result.predictionCurve.at(-1)).toEqual({ date: "2027-02-16", weightKg: 65 });
  });

  it("低能量边界不再拒绝合法成年人输入", () => {
    const outcome = calculateAssessment({
      age: 80, sex: "FEMALE", goal: "MAINTAIN", heightCm: 120,
      weightKg: 25, targetWeightKg: 25, activityLevel: "SEDENTARY",
    }, new Date("2026-09-28T00:00:00Z"));
    expect(outcome.status).toBe("SUPPORTED");
    if (outcome.status !== "SUPPORTED") return;
    expect(outcome.result.warnings.map((warning) => warning.code)).toContain("ENERGY_ESTIMATE_REVIEW_RECOMMENDED");
  });

  it("目标体重只使用 25–300 kg 物理范围，不使用当前体重百分比", () => {
    expect(targetRange("LOSE_WEIGHT", 170, 110)).toEqual({ min: 25, max: 300 });
    expect(validateMetrics("LOSE_WEIGHT", 170, 110, 60)).toEqual({ status: "SUPPORTED", reasonCodes: [] });
    expect(validateMetrics("LOSE_WEIGHT", 170, 110, 24.9)).toMatchObject({ status: "UNSUPPORTED", reasonCodes: ["TARGET_OUTSIDE_ALLOWED_RANGE"] });
  });

  it("目标方向不一致时保留输入并给出提示", () => {
    const outcome = calculateAssessment({ ...normal, targetWeightKg: 75 }, new Date("2026-09-28T00:00:00Z"));
    expect(outcome.status).toBe("SUPPORTED");
    if (outcome.status !== "SUPPORTED") return;
    expect(outcome.result.warnings.map((warning) => warning.code)).toContain("GOAL_DIRECTION_MISMATCH");
  });

  it("维持目标生成单点曲线并避免除零", () => {
    const outcome = calculateAssessment({ ...normal, goal: "MAINTAIN", targetWeightKg: 70 }, new Date("2028-02-29T12:00:00Z"));
    expect(outcome.status).toBe("SUPPORTED");
    if (outcome.status !== "SUPPORTED") return;
    expect(outcome.result.predictionStatus).toBe("AT_TARGET");
    expect(outcome.result.durationDays).toBe(0);
    expect(outcome.result.targetDate).toBe("2028-02-29");
    expect(outcome.result.predictionCurve).toEqual([{ date: "2028-02-29", weightKg: 70 }]);
  });

  it("长期目标保留日期和稀疏曲线，并提示分阶段执行", () => {
    const outcome = calculateAssessment({
      age: 30, sex: "MALE", goal: "LOSE_WEIGHT", heightCm: 220,
      weightKg: 190, targetWeightKg: 60, activityLevel: "HIGH",
    }, new Date("2026-09-28T00:00:00Z"));
    expect(outcome.status).toBe("SUPPORTED");
    if (outcome.status !== "SUPPORTED") return;
    expect(outcome.result.predictionStatus).toBe("PROJECTED");
    expect(outcome.result.targetDate).not.toBeNull();
    expect(outcome.result.durationDays).toBeGreaterThan(730);
    expect(outcome.result.predictionCurve.length).toBeLessThanOrEqual(106);
    expect(outcome.result.warnings.map((warning) => warning.code)).toContain("PHASED_GOAL_RECOMMENDED");
  });

  it("五个主题阶段都完整时才允许提交", () => {
    const valid = calculateProgress(completeAnswers());
    expect(valid.progress).toMatchObject({ percent: 100, nextStep: null, canSubmit: true });
    const incompleteLifestyle = Object.fromEntries(Object.entries(questionnaireAnswers.lifestyle).filter(([key]) => key !== "sleepDuration"));
    const partialQuestionnaire: AssessmentAnswers["questionnaireAnswers"] = { ...questionnaireAnswers, lifestyle: incompleteLifestyle };
    const invalid = calculateProgress(completeAnswers({ questionnaireAnswers: partialQuestionnaire }));
    expect(invalid.progress.completedSteps).toEqual(["profile", "activity"]);
    expect(invalid.progress.nextStep).toBe("lifestyle");
  });
});

describe("请求 Schema", () => {
  it("拒绝字符串数值、未知字段与超过一位小数", () => {
    expect(metricsDataSchema.safeParse({ heightCm: "170" }).success).toBe(false);
    expect(metricsDataSchema.safeParse({ weightKg: 70.11 }).success).toBe(false);
    expect(metricsDataSchema.safeParse({ targetWeightKg: 65, bmi: 24 }).success).toBe(false);
    expect(metricsDataSchema.safeParse({ age: 32.5 }).success).toBe(false);
  });

  it("健康数据同意和模型范围必须显式为 true", () => {
    expect(profileDataSchema.safeParse({ healthDataConsent: false }).success).toBe(false);
    expect(profileDataSchema.safeParse({ modelScopeConfirmed: false }).success).toBe(false);
    expect(profileDataSchema.safeParse({ healthDataConsent: true, consentVersion: "health-v2", modelScopeConfirmed: true, scopeVersion: "wellness-scope-v2" }).success).toBe(true);
  });

  it("问卷步骤拒绝未知枚举、NONE 冲突和空对象", () => {
    expect(profileDataSchema.safeParse({}).success).toBe(false);
    expect(activityDataSchema.safeParse({ exerciseFrequency: "VERY_HIGH" }).success).toBe(false);
    expect(activityDataSchema.safeParse({ targetZones: ["NOT_A_ZONE"] }).success).toBe(false);
    expect(activityDataSchema.safeParse({ targetZones: ["CORE", "CORE"] }).success).toBe(false);
    expect(activityDataSchema.safeParse({ sensitivities: ["NONE", "KNEES"] }).success).toBe(false);
    expect(profileDataSchema.safeParse({ secondaryGoals: ["NOT_A_GOAL"] }).success).toBe(false);
  });
});

describe("个性化 28 天方案", () => {
  it("把活动频次、目标部位、器材和饮食答案映射为完整周计划", () => {
    const plan = buildPersonalPlan({ goal: "LOSE_WEIGHT", age: 30, activityLevel: "MODERATE", questionnaireAnswers });
    expect(plan).toMatchObject({
      title: "28 天轻盈与塑形计划",
      durationDays: 28,
      cadence: { workoutsPerWeek: 4, walkDays: 4, equipment: "瑜伽垫或徒手" },
      nutritionRhythm: { pattern: "均衡家常" },
    });
    expect(plan.weeklySchedule).toHaveLength(7);
    expect(plan.trainingPrinciples.join(" ")).toContain("核心稳定");
    expect(toPlanPreview(plan)).toMatchObject({ durationLabel: "28 天", cadenceLabel: "每周 4 次主训练" });
  });

  it("柔韧受限、明显气喘、膝盖敏感和短睡眠会生成温和版本", () => {
    const plan = buildPersonalPlan({
      goal: "MAINTAIN",
      age: 56,
      activityLevel: "HIGH",
      questionnaireAnswers: {
        ...questionnaireAnswers,
        activity: {
          ...questionnaireAnswers.activity,
          flexibility: "LIMITED",
          exerciseFrequency: "ALMOST_DAILY",
          stairsBreath: "VERY_BREATHLESS",
          sensitivities: ["KNEES"],
        },
        lifestyle: { ...questionnaireAnswers.lifestyle, sleepDuration: "UNDER_FIVE" },
      },
    });
    expect(plan.cadence).toMatchObject({ workoutsPerWeek: 3, sessionMinutes: "10–15 分钟" });
    expect(plan.recoveryActions.join(" ")).toContain("膝盖敏感");
    expect(plan.recoveryActions.join(" ")).toContain("睡眠偏短");
  });
});
