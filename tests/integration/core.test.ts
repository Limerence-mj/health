import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ActivityData, LifestyleData, MetricsData, NutritionData, ProfileData } from "@/contracts/schemas";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required");
const testDatabaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, "");
if (!testDatabaseName.endsWith("_test")) throw new Error("TEST_DATABASE_URL must point to a database ending in _test");
process.env.DATABASE_URL = testDatabaseUrl;
process.env.DIRECT_URL = testDatabaseUrl;
process.env.APP_ORIGIN = "http://127.0.0.1:3000";
process.env.APP_ENV = "test";
process.env.MOCK_PAYMENTS_ENABLED = "true";
process.env.DEMO_MODE = "false";

const testDb = new PrismaClient({ datasourceUrl: testDatabaseUrl });
let assessmentService: typeof import("@/server/assessment-service");
let sessionService: typeof import("@/server/session-service");
let resultService: typeof import("@/server/result-service");
let paymentService: typeof import("@/server/payment-service");
let accountService: typeof import("@/server/account-service");
let configService: typeof import("@/server/config");
let profileRoute: typeof import("@/app/api/v1/assessments/[id]/steps/[step]/route");
let sessionsRoute: typeof import("@/app/api/v1/sessions/route");
let serverDb: typeof import("@/server/db").db;

const now = new Date("2026-09-28T08:00:00.000Z");
const consentData = { healthDataConsent: true, consentVersion: "health-v2", modelScopeConfirmed: true, scopeVersion: "wellness-scope-v2" } as const;
const profileData: ProfileData = { ...consentData, ageRange: "30_39", pilatesExperience: "NO", goal: "LOSE_WEIGHT", secondaryGoals: ["POSTURE"], bodyBuild: "MID", dreamBody: "TONED", weightTendency: "CHANGE_EASILY", bestShapeTiming: "ONE_TWO_YEARS" };
const activityData: ActivityData = { flexibility: "STARTING", exerciseFrequency: "SEVERAL_WEEKLY", targetZones: ["CORE"], stairsBreath: "SLIGHTLY", sensitivities: ["NONE"], walkingFrequency: "THREE_FOUR_WEEKLY", equipmentExperience: "NEVER" };
const lifestyleData: LifestyleData = { workSchedule: "DAYTIME", typicalDay: "ACTIVE_BREAKS", energyLevel: "STEADY", waterIntake: "TWO_SIX", sleepDuration: "SEVEN_EIGHT", weightGainEvents: ["NONE"] };
const nutritionData: NutritionData = { breakfastTime: "SIX_EIGHT", lunchTime: "NOON_TWO", dinnerTime: "SIX_EIGHT", dietPreference: "TRADITIONAL", eatingHabits: ["NONE"] };
const metricsData: MetricsData = { heightCm: 165, weightKg: 72, targetWeightKg: 60, age: 32, sex: "FEMALE", importantEvent: "NONE" };

function questionnaireAnswersFrom(profile: ProfileData, activity: ActivityData, lifestyle: LifestyleData, nutrition: NutritionData, metrics: MetricsData) {
  return { profile, activity, lifestyle, nutrition, metrics };
}

async function cleanDatabase() {
  await testDb.paymentEvent.deleteMany();
  await testDb.idempotencyRecord.deleteMany();
  await testDb.rateLimitBucket.deleteMany();
  await testDb.assessmentResult.deleteMany();
  await testDb.assessment.deleteMany();
  await testDb.session.deleteMany();
  await testDb.subscription.deleteMany();
  await testDb.user.deleteMany();
}

beforeAll(async () => {
  assessmentService = await import("@/server/assessment-service");
  sessionService = await import("@/server/session-service");
  resultService = await import("@/server/result-service");
  paymentService = await import("@/server/payment-service");
  accountService = await import("@/server/account-service");
  configService = await import("@/server/config");
  profileRoute = await import("@/app/api/v1/assessments/[id]/steps/[step]/route");
  sessionsRoute = await import("@/app/api/v1/sessions/route");
  serverDb = (await import("@/server/db")).db;
});

beforeEach(cleanDatabase);

afterAll(async () => {
  await cleanDatabase();
  await Promise.all([testDb.$disconnect(), serverDb.$disconnect()]);
});

async function newIdentity() {
  const created = await sessionService.createSession(now);
  const session = await testDb.session.findUniqueOrThrow({ where: { id: created.data.sessionId } });
  return { ...created, userId: session.userId, assessmentId: created.data.currentAssessmentId! };
}

async function saveQuestionnaire(identity: Awaited<ReturnType<typeof newIdentity>>, overrides: {
  profile?: ProfileData; activity?: ActivityData; lifestyle?: LifestyleData; nutrition?: NutritionData; metrics?: MetricsData;
} = {}) {
  const common = { userId: identity.userId, assessmentId: identity.assessmentId, now };
  await assessmentService.saveStep({ ...common, step: "profile", key: randomUUID(), body: { expectedRevision: 0, data: overrides.profile ?? profileData } });
  await assessmentService.saveStep({ ...common, step: "activity", key: randomUUID(), body: { expectedRevision: 1, data: overrides.activity ?? activityData } });
  await assessmentService.saveStep({ ...common, step: "lifestyle", key: randomUUID(), body: { expectedRevision: 2, data: overrides.lifestyle ?? lifestyleData } });
  await assessmentService.saveStep({ ...common, step: "nutrition", key: randomUUID(), body: { expectedRevision: 3, data: overrides.nutrition ?? nutritionData } });
  return assessmentService.saveStep({ ...common, step: "metrics", key: randomUUID(), body: { expectedRevision: 4, data: overrides.metrics ?? metricsData } });
}

async function completeAssessment() {
  const identity = await newIdentity();
  await saveQuestionnaire(identity);
  const submitted = await assessmentService.submitAssessment({
    userId: identity.userId, assessmentId: identity.assessmentId, expectedRevision: 5, key: randomUUID(), now,
  });
  return { ...identity, submitted };
}

describe("真实 PostgreSQL 业务闭环", () => {
  it("未授权时拒绝第一项健康画像写入且数据库保持空草稿", async () => {
    const identity = await newIdentity();
    await expect(assessmentService.saveStep({
      userId: identity.userId, assessmentId: identity.assessmentId, step: "profile", key: randomUUID(), now,
      body: { expectedRevision: 0, data: { ageRange: "30_39" } },
    })).rejects.toMatchObject({ code: "CONSENT_REQUIRED", status: 422 });
    expect(await testDb.assessment.findUniqueOrThrow({ where: { id: identity.assessmentId } })).toMatchObject({ revision: 0, questionnaireAnswers: {} });
    expect(await testDb.user.findUniqueOrThrow({ where: { id: identity.userId } })).toMatchObject({ healthConsentVersion: null, healthConsentAt: null });
  });

  it("保存五个主题阶段、提交结果并在无权益时只返回预览", async () => {
    const flow = await completeAssessment();
    expect(flow.submitted.data).toMatchObject({ status: "COMPLETED", revision: 6 });
    const report = await resultService.getReport(flow.userId, flow.assessmentId, now);
    expect(report).toMatchObject({ access: "PREVIEW", upgradeRequired: true, paymentAvailable: true });
    expect(report.planPreview).toMatchObject({ durationLabel: "28 天", cadenceLabel: "每周 4 次主训练" });
    expect(report).not.toHaveProperty("personalPlan");
    expect(await testDb.assessmentResult.count()).toBe(1);
  });

  it("同一幂等键同内容回放，不重复增加 revision", async () => {
    const identity = await newIdentity();
    const key = randomUUID();
    const input = {
      userId: identity.userId, assessmentId: identity.assessmentId, step: "profile" as const, key, now,
      body: { expectedRevision: 0, data: { ...consentData, ageRange: "30_39" as const } },
    };
    const first = await assessmentService.saveStep(input);
    const replay = await assessmentService.saveStep(input);
    expect(first.data.revision).toBe(1);
    expect(replay.replayed).toBe(true);
    expect((await testDb.assessment.findUniqueOrThrow({ where: { id: identity.assessmentId } })).revision).toBe(1);
  });

  it("同一幂等键不同内容返回冲突", async () => {
    const identity = await newIdentity();
    const key = randomUUID();
    await assessmentService.saveStep({
      userId: identity.userId, assessmentId: identity.assessmentId, step: "profile", key, now,
      body: { expectedRevision: 0, data: { ...consentData, ageRange: "30_39" } },
    });
    await expect(assessmentService.saveStep({
      userId: identity.userId, assessmentId: identity.assessmentId, step: "profile", key, now,
      body: { expectedRevision: 0, data: { ...consentData, ageRange: "40_49" } },
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED", status: 409 });
  });

  it("过期 revision 不会覆盖新答案", async () => {
    const identity = await newIdentity();
    await assessmentService.saveStep({
      userId: identity.userId, assessmentId: identity.assessmentId, step: "profile", key: randomUUID(), now,
      body: { expectedRevision: 0, data: { ...consentData, ageRange: "30_39" } },
    });
    await expect(assessmentService.saveStep({
      userId: identity.userId, assessmentId: identity.assessmentId, step: "profile", key: randomUUID(), now,
      body: { expectedRevision: 0, data: { ...consentData, ageRange: "40_49" } },
    })).rejects.toMatchObject({ code: "REVISION_CONFLICT", status: 409 });
  });

  it("25 kg 目标与低能量边界可以提交，并以提示代替硬拒绝", async () => {
    const identity = await newIdentity();
    const saved = await saveQuestionnaire(identity, { metrics: { ...metricsData, heightCm: 120, weightKg: 30, targetWeightKg: 25, age: 80 } });
    expect(saved.data).toMatchObject({ progress: { percent: 100, canSubmit: true }, eligibility: { status: "SUPPORTED" } });
    await assessmentService.submitAssessment({ userId: identity.userId, assessmentId: identity.assessmentId, expectedRevision: 5, key: randomUUID(), now });
    expect(await testDb.assessmentResult.count()).toBe(1);
    expect((await resultService.getReport(identity.userId, identity.assessmentId, now)).warnings).toContainEqual(expect.objectContaining({ code: "ENERGY_ESTIMATE_REVIEW_RECOMMENDED" }));
  });

  it("模拟激活原子写入事件、权益并把当前会话延到权益后七天", async () => {
    const flow = await completeAssessment();
    const paidAt = new Date("2026-09-28T09:00:00.000Z");
    const result = await paymentService.activateMockPayment({
      userId: flow.userId, sessionId: flow.data.sessionId, key: randomUUID(), now: paidAt,
      body: { assessmentId: flow.assessmentId, eventId: randomUUID(), planCode: "DEMO_30D" },
    });
    expect(result.data).toMatchObject({ outcome: "ACTIVATED", subscription: { effectiveStatus: "ACTIVE" } });
    const subscription = await testDb.subscription.findUniqueOrThrow({ where: { userId: flow.userId } });
    const session = await testDb.session.findUniqueOrThrow({ where: { id: flow.data.sessionId } });
    expect(session.expiresAt.getTime()).toBe(subscription.expiresAt!.getTime() + 7 * 86_400_000);
    const report = await resultService.getReport(flow.userId, flow.assessmentId, paidAt);
    expect(report.access).toBe("FULL");
    if (report.access !== "FULL") return;
    expect(report.personalPlan.weeklySchedule).toHaveLength(7);
    expect(report.personalPlan).toMatchObject({ durationDays: 28, cadence: { workoutsPerWeek: 4 } });
  });

  it("完整行动方案使用提交时快照，后续数据漂移不会改变历史报告", async () => {
    const flow = await completeAssessment();
    await paymentService.activateMockPayment({
      userId: flow.userId, sessionId: flow.data.sessionId, key: randomUUID(), now,
      body: { assessmentId: flow.assessmentId, eventId: randomUUID(), planCode: "DEMO_30D" },
    });
    const before = await resultService.getReport(flow.userId, flow.assessmentId, now);
    expect(before.access).toBe("FULL");
    if (before.access !== "FULL") return;
    expect(before.algorithmVersion).toBe("wellness-v3.0");
    expect((await testDb.assessmentResult.findUniqueOrThrow({ where: { assessmentId: flow.assessmentId } })).personalPlan).not.toBeNull();
    await testDb.assessment.update({
      where: { id: flow.assessmentId },
      data: {
        goal: "GAIN_WEIGHT",
        questionnaireAnswers: { ...questionnaireAnswersFrom(profileData, activityData, lifestyleData, nutritionData, metricsData), profile: { ...profileData, goal: "GAIN_WEIGHT" }, activity: { ...activityData, exerciseFrequency: "NEVER" } },
      },
    });
    const after = await resultService.getReport(flow.userId, flow.assessmentId, now);
    expect(after.access).toBe("FULL");
    if (after.access !== "FULL") return;
    expect(after.summary).toEqual(before.summary);
    expect(after.personalPlan).toEqual(before.personalPlan);
    expect(after.wellnessProfile).toEqual(before.wellnessProfile);
  });

  it("支付请求键回放与事件键回放都不会重复延长期限", async () => {
    const flow = await completeAssessment();
    const eventId = randomUUID();
    const key = randomUUID();
    const input = { userId: flow.userId, sessionId: flow.data.sessionId, key, now, body: { assessmentId: flow.assessmentId, eventId, planCode: "DEMO_30D" as const } };
    const first = await paymentService.activateMockPayment(input);
    const expiry = String(first.data.sessionExpiresAt);
    expect((await paymentService.activateMockPayment(input)).idempotencyReplayed).toBe(true);
    const eventReplay = await paymentService.activateMockPayment({ ...input, key: randomUUID(), now: new Date(now.getTime() + 86_400_000) });
    expect(eventReplay.eventReplayed).toBe(true);
    expect(String(eventReplay.data.sessionExpiresAt)).toBe(expiry);
    expect(await testDb.paymentEvent.count()).toBe(1);
  });

  it("同一支付 eventId 改换测评会在资源查询前返回事件冲突", async () => {
    const flow = await completeAssessment();
    const eventId = randomUUID();
    await paymentService.activateMockPayment({ userId: flow.userId, sessionId: flow.data.sessionId, key: randomUUID(), now, body: { assessmentId: flow.assessmentId, eventId, planCode: "DEMO_30D" } });
    await expect(paymentService.activateMockPayment({
      userId: flow.userId, sessionId: flow.data.sessionId, key: randomUUID(), now,
      body: { assessmentId: randomUUID(), eventId, planCode: "DEMO_30D" },
    })).rejects.toMatchObject({ code: "PAYMENT_EVENT_REUSED", status: 409 });
  });

  it("其他匿名用户不能读取不属于自己的测评", async () => {
    const flow = await completeAssessment();
    const stranger = await newIdentity();
    await expect(resultService.getReport(stranger.userId, flow.assessmentId, now)).rejects.toMatchObject({ code: "ASSESSMENT_NOT_FOUND", status: 404 });
  });

  it("并发新建测评最终只保留同一个草稿", async () => {
    const flow = await completeAssessment();
    const [left, right] = await Promise.all([
      assessmentService.createAssessment({ userId: flow.userId, key: randomUUID(), now }),
      assessmentService.createAssessment({ userId: flow.userId, key: randomUUID(), now }),
    ]);
    expect(left.data.assessmentId).toBe(right.data.assessmentId);
    expect(await testDb.assessment.count({ where: { userId: flow.userId, status: "DRAFT" } })).toBe(1);
    expect((await assessmentService.getCurrentAssessment(flow.userId)).status).toBe("DRAFT");
  });

  it("未来开始的异常权益拒绝报告与支付，不写新事件", async () => {
    const flow = await completeAssessment();
    await testDb.subscription.update({ where: { userId: flow.userId }, data: {
      status: "ACTIVE", planCode: "DEMO_30D", startsAt: new Date(now.getTime() + 86_400_000), expiresAt: new Date(now.getTime() + 31 * 86_400_000),
    } });
    await expect(resultService.getReport(flow.userId, flow.assessmentId, now)).rejects.toMatchObject({ code: "TEMPORARILY_UNAVAILABLE", status: 503 });
    await expect(paymentService.activateMockPayment({
      userId: flow.userId, sessionId: flow.data.sessionId, key: randomUUID(), now,
      body: { assessmentId: flow.assessmentId, eventId: randomUUID(), planCode: "DEMO_30D" },
    })).rejects.toMatchObject({ code: "TEMPORARILY_UNAVAILABLE", status: 503 });
    expect(await testDb.paymentEvent.count()).toBe(0);
  });

  it("删除本人数据会移除报告、权益、事件、会话与身份", async () => {
    const flow = await completeAssessment();
    await paymentService.activateMockPayment({
      userId: flow.userId, sessionId: flow.data.sessionId, key: randomUUID(), now,
      body: { assessmentId: flow.assessmentId, eventId: randomUUID(), planCode: "DEMO_30D" },
    });
    await accountService.deleteAccount(flow.userId);
    expect(await testDb.user.findUnique({ where: { id: flow.userId } })).toBeNull();
    expect(await testDb.session.count({ where: { userId: flow.userId } })).toBe(0);
    expect(await testDb.assessment.count({ where: { userId: flow.userId } })).toBe(0);
    expect(await testDb.paymentEvent.count({ where: { userId: flow.userId } })).toBe(0);
  });
});

describe("数据库防线", () => {
  it("唯一索引阻止同一用户出现两个草稿", async () => {
    const identity = await newIdentity();
    await expect(testDb.assessment.create({ data: {
      id: randomUUID(), userId: identity.userId, createdAt: now, updatedAt: now,
    } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("CHECK 约束阻止无期限的 ACTIVE 权益", async () => {
    const identity = await newIdentity();
    await expect(testDb.subscription.update({ where: { userId: identity.userId }, data: { status: "ACTIVE", planCode: "DEMO_30D" } })).rejects.toBeTruthy();
  });

  it("测量值 CHECK 与 v2 的 90–242 cm、25–300 kg 范围一致", async () => {
    const identity = await newIdentity();
    await expect(testDb.assessment.update({
      where: { id: identity.assessmentId },
      data: { heightCm: 90, weightKg: 25, targetWeightKg: 300 },
    })).resolves.toMatchObject({
      heightCm: new Prisma.Decimal(90),
      weightKg: new Prisma.Decimal(25),
      targetWeightKg: new Prisma.Decimal(300),
    });
    await expect(testDb.assessment.update({
      where: { id: identity.assessmentId },
      data: { heightCm: 89.9 },
    })).rejects.toBeTruthy();
    await expect(testDb.assessment.update({
      where: { id: identity.assessmentId },
      data: { weightKg: 300.1 },
    })).rejects.toBeTruthy();
  });
});

describe("补充并发、边界与回滚证据", () => {
  it("共享数据库会话创建限流返回 429 和 Retry-After", async () => {
    const previousLimit = process.env.SESSION_CREATION_LIMIT_PER_MINUTE;
    process.env.SESSION_CREATION_LIMIT_PER_MINUTE = "1";
    configService.resetEnvForTests();
    const request = () => new NextRequest("http://127.0.0.1:3000/api/v1/sessions", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:3000", "content-type": "application/json" },
      body: "{}",
    });
    try {
      expect((await sessionsRoute.POST(request())).status).toBe(201);
      const limited = await sessionsRoute.POST(request());
      expect(limited.status).toBe(429);
      expect(limited.headers.get("retry-after")).toBe("60");
      await expect(limited.json()).resolves.toMatchObject({ error: { code: "RATE_LIMITED", details: { retryAfterSeconds: 60 } } });
    } finally {
      if (previousLimit === undefined) delete process.env.SESSION_CREATION_LIMIT_PER_MINUTE;
      else process.env.SESSION_CREATION_LIMIT_PER_MINUTE = previousLimit;
      configService.resetEnvForTests();
    }
  });

  it("profile 出现未知字段时由 HTTP Schema 拒绝且整步不落库", async () => {
    const identity = await newIdentity();
    const request = new NextRequest(`http://127.0.0.1:3000/api/v1/assessments/${identity.assessmentId}/steps/profile`, {
      method: "PUT",
      headers: { origin: "http://127.0.0.1:3000", "content-type": "application/json", "idempotency-key": randomUUID(), cookie: `health_session=${identity.token}` },
      body: JSON.stringify({ expectedRevision: 0, data: { ageRange: "30_39", unknown: true } }),
    });
    const response = await profileRoute.PUT(request, { params: Promise.resolve({ id: identity.assessmentId, step: "profile" }) });
    expect(response.status).toBe(422);
    const saved = await testDb.assessment.findUniqueOrThrow({ where: { id: identity.assessmentId } });
    expect(saved).toMatchObject({ age: null, sex: null, revision: 0, questionnaireAnswers: {} });
    expect((await testDb.user.findUniqueOrThrow({ where: { id: identity.userId } })).healthConsentAt).toBeNull();
  });

  it("缺少前置步骤时跳步保存返回 STEP_OUT_OF_ORDER", async () => {
    const identity = await newIdentity();
    await expect(assessmentService.saveStep({
      userId: identity.userId, assessmentId: identity.assessmentId, step: "lifestyle", key: randomUUID(), now,
      body: { expectedRevision: 0, data: { workSchedule: "DAYTIME" } },
    })).rejects.toMatchObject({ code: "STEP_OUT_OF_ORDER", status: 409 });
  });

  it("并发不同请求键使用同一 revision 时恰好一个成功", async () => {
    const identity = await newIdentity();
    await assessmentService.saveStep({
      userId: identity.userId, assessmentId: identity.assessmentId, step: "profile", key: randomUUID(), now,
      body: { expectedRevision: 0, data: profileData },
    });
    const results = await Promise.allSettled([
      assessmentService.saveStep({ userId: identity.userId, assessmentId: identity.assessmentId, step: "activity", key: randomUUID(), now, body: { expectedRevision: 1, data: activityData } }),
      assessmentService.saveStep({ userId: identity.userId, assessmentId: identity.assessmentId, step: "activity", key: randomUUID(), now, body: { expectedRevision: 1, data: { ...activityData, exerciseFrequency: "ALMOST_DAILY" } } }),
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((item) => item.status === "rejected")).toHaveLength(1);
    expect((await testDb.assessment.findUniqueOrThrow({ where: { id: identity.assessmentId } })).revision).toBe(2);
  });

  it("不同请求键重复提交已完成测评返回同一 resultId 且不重算", async () => {
    const flow = await completeAssessment();
    const firstResultId = String(flow.submitted.data.resultId);
    const sourceReplay = await assessmentService.submitAssessment({ userId: flow.userId, assessmentId: flow.assessmentId, expectedRevision: 5, key: randomUUID(), now: new Date(now.getTime() + 86_400_000) });
    const completedReplay = await assessmentService.submitAssessment({ userId: flow.userId, assessmentId: flow.assessmentId, expectedRevision: 6, key: randomUUID(), now: new Date(now.getTime() + 172_800_000) });
    expect(sourceReplay.data.resultId).toBe(firstResultId);
    expect(completedReplay.data.resultId).toBe(firstResultId);
    expect(await testDb.assessmentResult.count()).toBe(1);
  });

  it("有效权益上的新支付事件记录 ALREADY_ACTIVE 且不叠加期限", async () => {
    const flow = await completeAssessment();
    const first = await paymentService.activateMockPayment({ userId: flow.userId, sessionId: flow.data.sessionId, key: randomUUID(), now, body: { assessmentId: flow.assessmentId, eventId: randomUUID(), planCode: "DEMO_30D" } });
    const second = await paymentService.activateMockPayment({ userId: flow.userId, sessionId: flow.data.sessionId, key: randomUUID(), now: new Date(now.getTime() + 86_400_000), body: { assessmentId: flow.assessmentId, eventId: randomUUID(), planCode: "DEMO_30D" } });
    expect(second.data.outcome).toBe("ALREADY_ACTIVE");
    expect(second.data.sessionExpiresAt).toBe(first.data.sessionExpiresAt);
    expect(await testDb.paymentEvent.count()).toBe(2);
  });

  it("权益到期后旧 event 只回放，新 event 才重新激活", async () => {
    const flow = await completeAssessment();
    const oldEventId = randomUUID();
    await paymentService.activateMockPayment({ userId: flow.userId, sessionId: flow.data.sessionId, key: randomUUID(), now, body: { assessmentId: flow.assessmentId, eventId: oldEventId, planCode: "DEMO_30D" } });
    const later = new Date(now.getTime() + 31 * 86_400_000);
    const oldReplay = await paymentService.activateMockPayment({ userId: flow.userId, sessionId: flow.data.sessionId, key: randomUUID(), now: later, body: { assessmentId: flow.assessmentId, eventId: oldEventId, planCode: "DEMO_30D" } });
    expect(oldReplay.eventReplayed).toBe(true);
    expect((oldReplay.data.subscription as { effectiveStatus: string }).effectiveStatus).toBe("EXPIRED");
    const renewed = await paymentService.activateMockPayment({ userId: flow.userId, sessionId: flow.data.sessionId, key: randomUUID(), now: later, body: { assessmentId: flow.assessmentId, eventId: randomUUID(), planCode: "DEMO_30D" } });
    expect(renewed.data.outcome).toBe("ACTIVATED");
  });

  it("当前 120 kg、目标 60 kg 可以完整保存并提交长期情景，不再受 20% 下限或两年窗口限制", async () => {
    const identity = await newIdentity();
    const saved = await saveQuestionnaire(identity, { metrics: { ...metricsData, heightCm: 180, weightKg: 120, targetWeightKg: 60 } });
    expect(saved.data).toMatchObject({ progress: { percent: 100, canSubmit: true } });
    expect(await testDb.assessment.findUniqueOrThrow({ where: { id: identity.assessmentId } })).toMatchObject({ weightKg: new Prisma.Decimal(120), targetWeightKg: new Prisma.Decimal(60), revision: 5 });
    await assessmentService.submitAssessment({ userId: identity.userId, assessmentId: identity.assessmentId, expectedRevision: 5, key: randomUUID(), now });
    expect(await testDb.assessmentResult.findUniqueOrThrow({ where: { assessmentId: identity.assessmentId } })).toMatchObject({
      predictionStatus: "PROJECTED",
      durationDays: 1680,
    });
  });

  it("关闭模拟支付后拒绝新事件，但不影响已激活完整报告", async () => {
    const flow = await completeAssessment();
    await paymentService.activateMockPayment({ userId: flow.userId, sessionId: flow.data.sessionId, key: randomUUID(), now, body: { assessmentId: flow.assessmentId, eventId: randomUUID(), planCode: "DEMO_30D" } });
    const eventsBefore = await testDb.paymentEvent.count();
    process.env.MOCK_PAYMENTS_ENABLED = "false";
    configService.resetEnvForTests();
    try {
      expect((await resultService.getReport(flow.userId, flow.assessmentId, now)).access).toBe("FULL");
      await expect(paymentService.activateMockPayment({ userId: flow.userId, sessionId: flow.data.sessionId, key: randomUUID(), now, body: { assessmentId: flow.assessmentId, eventId: randomUUID(), planCode: "DEMO_30D" } })).rejects.toMatchObject({ code: "FEATURE_DISABLED", status: 404 });
      expect(await testDb.paymentEvent.count()).toBe(eventsBefore);
    } finally {
      process.env.MOCK_PAYMENTS_ENABLED = "true";
      configService.resetEnvForTests();
    }
  });

  it("初始会话为七天，权益第 30 天恰好转为预览", async () => {
    const flow = await completeAssessment();
    const initial = await testDb.session.findUniqueOrThrow({ where: { id: flow.data.sessionId } });
    expect(initial.expiresAt.getTime()).toBe(now.getTime() + 7 * 86_400_000);
    await paymentService.activateMockPayment({ userId: flow.userId, sessionId: flow.data.sessionId, key: randomUUID(), now, body: { assessmentId: flow.assessmentId, eventId: randomUUID(), planCode: "DEMO_30D" } });
    expect((await resultService.getReport(flow.userId, flow.assessmentId, new Date(now.getTime() + 30 * 86_400_000 - 1))).access).toBe("FULL");
    expect((await resultService.getReport(flow.userId, flow.assessmentId, new Date(now.getTime() + 30 * 86_400_000))).access).toBe("PREVIEW");
  });

  it("提交前撤回当前健康数据同意会拒绝并保持草稿", async () => {
    const identity = await newIdentity();
    const common = { userId: identity.userId, assessmentId: identity.assessmentId, now };
    await saveQuestionnaire(identity);
    await testDb.user.update({ where: { id: identity.userId }, data: { healthConsentVersion: null, healthConsentAt: null } });
    await expect(assessmentService.submitAssessment({ ...common, expectedRevision: 5, key: randomUUID() })).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    expect(await testDb.assessmentResult.count()).toBe(0);
    expect((await testDb.assessment.findUniqueOrThrow({ where: { id: identity.assessmentId } })).status).toBe("DRAFT");
  });

  it("结果唯一约束阻止同一测评出现第二份结果", async () => {
    const flow = await completeAssessment();
    const result = await testDb.assessmentResult.findUniqueOrThrow({ where: { assessmentId: flow.assessmentId } });
    await expect(testDb.assessmentResult.create({ data: {
      id: randomUUID(), assessmentId: result.assessmentId, sourceRevision: result.sourceRevision, algorithmVersion: result.algorithmVersion,
      inputSnapshot: result.inputSnapshot as Prisma.InputJsonValue, calculationMetadata: result.calculationMetadata as Prisma.InputJsonValue,
      bmi: result.bmi, restingEnergyKcal: result.restingEnergyKcal, maintenanceKcal: result.maintenanceKcal,
      suggestedIntakeKcal: result.suggestedIntakeKcal, predictionStatus: result.predictionStatus, baseDate: result.baseDate,
      targetDate: result.targetDate, durationDays: result.durationDays, weeklyChangeKg: result.weeklyChangeKg,
      predictionCurve: result.predictionCurve as Prisma.InputJsonValue, createdAt: now,
    } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("支付事件唯一约束阻止相同用户/provider/eventId 的第二条记录", async () => {
    const flow = await completeAssessment();
    const eventId = randomUUID();
    await paymentService.activateMockPayment({ userId: flow.userId, sessionId: flow.data.sessionId, key: randomUUID(), now, body: { assessmentId: flow.assessmentId, eventId, planCode: "DEMO_30D" } });
    const event = await testDb.paymentEvent.findFirstOrThrow({ where: { userId: flow.userId, eventId } });
    await expect(testDb.paymentEvent.create({ data: {
      id: randomUUID(), userId: event.userId, assessmentId: event.assessmentId, subscriptionId: event.subscriptionId,
      provider: event.provider, eventId: event.eventId, requestHash: event.requestHash, outcome: event.outcome,
      planCode: event.planCode, observedStartsAt: event.observedStartsAt, observedExpiresAt: event.observedExpiresAt, createdAt: now,
    } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("自动清理在行锁内排除未到期用户与 demo 用户", async () => {
    const identity = await newIdentity();
    expect(await accountService.purgeExpiredAccount(identity.userId, now)).toBe(false);
    const demoId = randomUUID();
    await testDb.user.create({ data: { id: demoId, isDemo: true, purgeAfter: new Date(now.getTime() - 1), createdAt: new Date(now.getTime() - 2), updatedAt: now } });
    expect(await accountService.purgeExpiredAccount(demoId, now)).toBe(false);
    expect(await testDb.user.findUnique({ where: { id: demoId } })).not.toBeNull();
  });

  it("带复制来源自引用的同一用户测评仍可在一个事务中全部删除", async () => {
    const flow = await completeAssessment();
    const copied = await assessmentService.createAssessment({ userId: flow.userId, copyFromAssessmentId: flow.assessmentId, key: randomUUID(), now });
    expect(copied.data.sourceAssessmentId).toBe(flow.assessmentId);
    expect(copied.data.progress.nextStep).toBe("profile");
    expect(copied.data.questionnaireAnswers.profile).not.toHaveProperty("healthDataConsent");
    await accountService.deleteAccount(flow.userId);
    expect(await testDb.user.findUnique({ where: { id: flow.userId } })).toBeNull();
    expect(await testDb.assessment.count({ where: { userId: flow.userId } })).toBe(0);
  });
});
