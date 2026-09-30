import { randomUUID } from "node:crypto";
import { Prisma, type Assessment } from "@prisma/client";
import { ACTIVITY_FACTORS, ALGORITHM_VERSION, HEALTH_CONSENT_VERSION, MODEL_SCOPE_VERSION, type Goal, type StepKey } from "@/contracts/constants";
import { activityLevelFromFrequency, type QuestionnaireAnswers, type StageAnswers } from "@/contracts/questionnaire";
import type { ActivityData, LifestyleData, MetricsData, NutritionData, ProfileData } from "@/contracts/schemas";
import { calculateAssessment, toCompleteInput, validateMetrics } from "@/domain/assessment";
import { buildPersonalPlan } from "@/domain/personal-plan";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { replayIfPresent, requestHash, saveReceipt } from "@/server/idempotency";
import { lockUser, touchPurgeAfter } from "@/server/lifecycle";
import { assessmentAnswers, isStepOpen, toAssessmentDto } from "@/server/presenters";

type StepBodyMap = {
  profile: { expectedRevision: number; data: ProfileData };
  activity: { expectedRevision: number; data: ActivityData };
  lifestyle: { expectedRevision: number; data: LifestyleData };
  nutrition: { expectedRevision: number; data: NutritionData };
  metrics: { expectedRevision: number; data: MetricsData };
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function getAssessment(userId: string, assessmentId: string) {
  const assessment = await db.assessment.findFirst({ where: { id: assessmentId, userId } });
  if (!assessment) throw new AppError(404, "ASSESSMENT_NOT_FOUND", "测评不存在");
  return toAssessmentDto(assessment);
}

export async function getCurrentAssessment(userId: string) {
  const assessment = await db.assessment.findFirst({ where: { userId, status: "DRAFT" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })
    ?? await db.assessment.findFirst({ where: { userId, status: "COMPLETED" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  if (!assessment) throw new AppError(404, "ASSESSMENT_NOT_FOUND", "当前没有测评");
  return toAssessmentDto(assessment);
}

export async function createAssessment(input: {
  userId: string;
  key: string;
  copyFromAssessmentId?: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const operation = "POST:/api/v1/assessments";
  const hash = requestHash({ copyFromAssessmentId: input.copyFromAssessmentId ?? null });
  return db.$transaction(async (tx) => {
    await lockUser(tx, input.userId);
    const replay = await replayIfPresent<ReturnType<typeof toAssessmentDto>>(tx, { userId: input.userId, operation, key: input.key, hash });
    if (replay) return { data: replay, status: 200, replayed: true };
    const existing = await tx.assessment.findFirst({ where: { userId: input.userId, status: "DRAFT" } });
    if (existing) {
      const data = toAssessmentDto(existing);
      await saveReceipt(tx, { userId: input.userId, operation, key: input.key, hash, status: 200, data: json(data) });
      return { data, status: 200, replayed: false };
    }
    let copy: Assessment | null = null;
    if (input.copyFromAssessmentId) {
      copy = await tx.assessment.findFirst({ where: { id: input.copyFromAssessmentId, userId: input.userId, status: "COMPLETED" } });
      if (!copy) throw new AppError(404, "ASSESSMENT_NOT_FOUND", "复制来源不存在");
    }
    const assessment = await tx.assessment.create({ data: {
      id: randomUUID(),
      userId: input.userId,
      sourceAssessmentId: copy?.id ?? null,
      age: copy?.age ?? null,
      sex: copy?.sex ?? null,
      goal: copy?.goal ?? null,
      heightCm: copy?.heightCm ?? null,
      weightKg: copy?.weightKg ?? null,
      targetWeightKg: copy?.targetWeightKg ?? null,
      activityLevel: copy?.activityLevel ?? null,
      questionnaireAnswers: copy ? json(withoutConsent(copy.questionnaireAnswers)) : {},
      scopeVersion: null,
      scopeConfirmedAt: null,
      createdAt: now,
      updatedAt: now,
    } });
    await touchPurgeAfter(tx, input.userId, now);
    const data = toAssessmentDto(assessment);
    await saveReceipt(tx, { userId: input.userId, operation, key: input.key, hash, status: 201, data: json(data) });
    return { data, status: 201, replayed: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 2_000, timeout: 5_000 });
}

export async function saveStep<K extends StepKey>(input: {
  userId: string;
  assessmentId: string;
  step: K;
  body: StepBodyMap[K];
  key: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const operation = `PUT:/api/v1/assessments/${input.assessmentId}/steps/${input.step}`;
  const hash = requestHash(input.body);
  return db.$transaction(async (tx) => {
    await lockUser(tx, input.userId);
    const replay = await replayIfPresent<Record<string, unknown>>(tx, { userId: input.userId, operation, key: input.key, hash });
    if (replay) return { data: replay, replayed: true };
    const [assessment, user] = await Promise.all([
      tx.assessment.findFirst({ where: { id: input.assessmentId, userId: input.userId } }),
      tx.user.findUniqueOrThrow({ where: { id: input.userId } }),
    ]);
    if (!assessment) throw new AppError(404, "ASSESSMENT_NOT_FOUND", "测评不存在");
    if (assessment.status !== "DRAFT") throw new AppError(409, "ASSESSMENT_FINALIZED", "已完成测评不可修改");
    if (assessment.revision !== input.body.expectedRevision) {
      throw new AppError(409, "REVISION_CONFLICT", "测评已在其他位置更新", undefined, { currentRevision: assessment.revision });
    }
    const before = toAssessmentDto(assessment);
    if (!isStepOpen(before.progress.completedSteps, input.step)) {
      throw new AppError(409, "STEP_OUT_OF_ORDER", "请先完成前面的步骤", undefined, { nextStep: before.progress.nextStep });
    }

    const stepData = input.body.data as StageAnswers;
    const grantsConsent = input.step === "profile" &&
      stepData.healthDataConsent === true && stepData.consentVersion === HEALTH_CONSENT_VERSION &&
      stepData.modelScopeConfirmed === true && stepData.scopeVersion === MODEL_SCOPE_VERSION;
    const alreadyAuthorized = user.healthConsentVersion === HEALTH_CONSENT_VERSION && user.healthConsentAt !== null &&
      assessment.scopeVersion === MODEL_SCOPE_VERSION && assessment.scopeConfirmedAt !== null;
    if (!alreadyAuthorized && !grantsConsent) {
      throw new AppError(422, "CONSENT_REQUIRED", "保存健康相关回答前需要确认数据处理授权和模型适用范围");
    }

    const update: Prisma.AssessmentUncheckedUpdateInput = {};
    const questionnaire = parseQuestionnaire(assessment.questionnaireAnswers);
    const mergedStep = { ...(questionnaire[input.step] ?? {}), ...stepData };
    update.questionnaireAnswers = json({ ...questionnaire, [input.step]: mergedStep });
    const userConsentChanged = grantsConsent && (user.healthConsentVersion !== HEALTH_CONSENT_VERSION || user.healthConsentAt === null);
    if (grantsConsent) {
      update.scopeVersion = MODEL_SCOPE_VERSION;
      update.scopeConfirmedAt = assessment.scopeConfirmedAt ?? now;
      if (userConsentChanged) {
        await tx.user.update({ where: { id: input.userId }, data: { healthConsentVersion: HEALTH_CONSENT_VERSION, healthConsentAt: now } });
      }
    }
    if (input.step === "profile") {
      const data = input.body.data as ProfileData;
      if (data.goal) update.goal = data.goal;
    } else if (input.step === "activity") {
      const data = input.body.data as ActivityData;
      const activityLevel = data.activityLevel ?? activityLevelFromFrequency(data.exerciseFrequency);
      if (activityLevel) update.activityLevel = activityLevel;
    } else if (input.step === "metrics") {
      const data = input.body.data as MetricsData;
      if (data.age !== undefined) update.age = data.age;
      if (data.sex !== undefined) update.sex = data.sex;
      if (data.heightCm !== undefined) update.heightCm = data.heightCm;
      if (data.weightKg !== undefined) update.weightKg = data.weightKg;
      if (data.targetWeightKg !== undefined) update.targetWeightKg = data.targetWeightKg;
      const pendingHeight = data.heightCm ?? (assessment.heightCm === null ? null : Number(assessment.heightCm));
      const pendingWeight = data.weightKg ?? (assessment.weightKg === null ? null : Number(assessment.weightKg));
      const pendingTarget = data.targetWeightKg ?? (assessment.targetWeightKg === null ? null : Number(assessment.targetWeightKg));
      if (assessment.goal && pendingHeight !== null && pendingWeight !== null && pendingTarget !== null) {
        const check = validateMetrics(assessment.goal as Goal, pendingHeight, pendingWeight, pendingTarget);
        if (check.status === "UNSUPPORTED") {
          throw new AppError(422, "VALIDATION_ERROR", "身体数据超出输入范围", undefined, { reasonCodes: check.reasonCodes, allowedTargetRange: check.allowedTargetRange });
        }
      }
    }

    const changed = assessmentChanged(assessment, update);
    const saved = changed
      ? await tx.assessment.update({ where: { id: assessment.id }, data: { ...update, revision: { increment: 1 }, updatedAt: now } })
      : assessment;
    if (changed || userConsentChanged) await touchPurgeAfter(tx, input.userId, now);
    const dto = toAssessmentDto(saved);
    const data = { ...dto, savedStep: input.step };
    await saveReceipt(tx, { userId: input.userId, operation, key: input.key, hash, status: 200, data: json(data) });
    return { data, replayed: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 2_000, timeout: 5_000 });
}

function assessmentChanged(assessment: Assessment, update: Prisma.AssessmentUncheckedUpdateInput): boolean {
  const pairs: [keyof Assessment, unknown][] = [
    ["age", update.age], ["sex", update.sex], ["scopeVersion", update.scopeVersion], ["scopeConfirmedAt", update.scopeConfirmedAt],
    ["goal", update.goal], ["heightCm", update.heightCm], ["weightKg", update.weightKg],
    ["targetWeightKg", update.targetWeightKg], ["activityLevel", update.activityLevel],
  ];
  const scalarChanged = pairs.some(([key, value]) => {
    if (value === undefined) return false;
    const current = assessment[key];
    if (current instanceof Date && value instanceof Date) return current.getTime() !== value.getTime();
    return String(current ?? "") !== String(value ?? "");
  });
  if (scalarChanged) return true;
  if (update.questionnaireAnswers === undefined) return false;
  return JSON.stringify(assessment.questionnaireAnswers) !== JSON.stringify(update.questionnaireAnswers);
}

function parseQuestionnaire(value: Prisma.JsonValue): QuestionnaireAnswers {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as QuestionnaireAnswers;
}

function withoutConsent(value: Prisma.JsonValue): QuestionnaireAnswers {
  const questionnaire = parseQuestionnaire(value);
  const profile = { ...(questionnaire.profile ?? {}) };
  delete profile.healthDataConsent;
  delete profile.consentVersion;
  delete profile.modelScopeConfirmed;
  delete profile.scopeVersion;
  return { ...questionnaire, profile };
}

export async function submitAssessment(input: {
  userId: string;
  assessmentId: string;
  expectedRevision: number;
  key: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const operation = `POST:/api/v1/assessments/${input.assessmentId}/submit`;
  const hash = requestHash({ expectedRevision: input.expectedRevision });
  return db.$transaction(async (tx) => {
    await lockUser(tx, input.userId);
    const replay = await replayIfPresent<Record<string, unknown>>(tx, { userId: input.userId, operation, key: input.key, hash });
    if (replay) return { data: replay, replayed: true };
    const [assessment, user] = await Promise.all([
      tx.assessment.findFirst({ where: { id: input.assessmentId, userId: input.userId }, include: { result: true } }),
      tx.user.findUniqueOrThrow({ where: { id: input.userId } }),
    ]);
    if (!assessment) throw new AppError(404, "ASSESSMENT_NOT_FOUND", "测评不存在");
    if (assessment.status === "COMPLETED") {
      if (!assessment.result || ![assessment.result.sourceRevision, assessment.revision].includes(input.expectedRevision)) {
        throw new AppError(409, "REVISION_CONFLICT", "提交版本过旧", undefined, { currentRevision: assessment.revision });
      }
      const data = { assessmentId: assessment.id, resultId: assessment.result.id, status: "COMPLETED", revision: assessment.revision };
      await saveReceipt(tx, { userId: input.userId, operation, key: input.key, hash, status: 200, data: json(data) });
      return { data, replayed: false };
    }
    if (assessment.revision !== input.expectedRevision) throw new AppError(409, "REVISION_CONFLICT", "测评已更新", undefined, { currentRevision: assessment.revision });
    if (user.healthConsentVersion !== HEALTH_CONSENT_VERSION || user.healthConsentAt === null) {
      throw new AppError(422, "CONSENT_REQUIRED", "需要重新确认健康数据处理授权");
    }
    const answers = assessmentAnswers(assessment);
    const complete = toCompleteInput(answers);
    if (!complete) throw new AppError(422, "INCOMPLETE_ASSESSMENT", "请先完成全部步骤");
    const outcome = calculateAssessment(complete, now);
    if (outcome.status === "UNSUPPORTED") throw new AppError(422, "PLAN_NOT_SUPPORTED", "当前信息超出本演示模型范围", undefined, { reasonCodes: outcome.reasonCodes });
    const resultId = randomUUID();
    const result = outcome.result;
    const personalPlan = buildPersonalPlan({
      goal: complete.goal,
      age: complete.age,
      activityLevel: complete.activityLevel,
      questionnaireAnswers: answers.questionnaireAnswers,
    });
    await tx.assessmentResult.create({ data: {
      id: resultId,
      assessmentId: assessment.id,
      sourceRevision: assessment.revision,
      algorithmVersion: ALGORITHM_VERSION,
      inputSnapshot: json({ ...complete, questionnaireAnswers: answers.questionnaireAnswers }),
      calculationMetadata: json({ activityLevel: complete.activityLevel, activityFactor: ACTIVITY_FACTORS[complete.activityLevel], predictionScenario: "0.25kg/week", warnings: result.warnings }),
      personalPlan: json(personalPlan),
      bmi: result.bmi,
      restingEnergyKcal: result.restingEnergyKcal,
      maintenanceKcal: result.maintenanceKcal,
      suggestedIntakeKcal: result.suggestedIntakeKcal,
      predictionStatus: result.predictionStatus,
      baseDate: new Date(`${result.baseDate}T00:00:00.000Z`),
      targetDate: result.targetDate ? new Date(`${result.targetDate}T00:00:00.000Z`) : null,
      durationDays: result.durationDays,
      weeklyChangeKg: result.weeklyChangeKg,
      predictionCurve: json(result.predictionCurve),
      createdAt: now,
    } });
    const completed = await tx.assessment.update({ where: { id: assessment.id }, data: { status: "COMPLETED", submittedAt: now, revision: { increment: 1 }, updatedAt: now } });
    await touchPurgeAfter(tx, input.userId, now);
    const data = { assessmentId: completed.id, resultId, status: "COMPLETED", revision: completed.revision };
    await saveReceipt(tx, { userId: input.userId, operation, key: input.key, hash, status: 200, data: json(data) });
    return { data, replayed: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 2_000, timeout: 5_000 });
}
