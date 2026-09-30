import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { effectiveSubscriptionStatus, sessionExpiryForActivation } from "@/domain/subscription";
import { env } from "@/server/config";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { replayIfPresent, requestHash, saveReceipt } from "@/server/idempotency";
import { lockUser, touchPurgeAfter } from "@/server/lifecycle";
import { subscriptionDto } from "@/server/presenters";

const DAY_MS = 86_400_000;

type PaymentBody = { assessmentId: string; eventId: string; planCode: "DEMO_30D" };

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function activateMockPayment(input: {
  userId: string;
  sessionId: string;
  key: string;
  body: PaymentBody;
  now?: Date;
}) {
  if (!env().MOCK_PAYMENTS_ENABLED) throw new AppError(404, "FEATURE_DISABLED", "模拟支付未开启");
  const now = input.now ?? new Date();
  const operation = "POST:/api/v1/payments/mock";
  const hash = requestHash(input.body);
  return db.$transaction(async (tx) => {
    await lockUser(tx, input.userId);
    const replay = await replayIfPresent<Record<string, unknown>>(tx, {
      userId: input.userId, operation, key: input.key, hash,
    });
    if (replay) return { data: replay, idempotencyReplayed: true, eventReplayed: false };

    const subscription = await tx.subscription.findUniqueOrThrow({ where: { userId: input.userId } });
    const priorEvent = await tx.paymentEvent.findUnique({
      where: { userId_provider_eventId: { userId: input.userId, provider: "MOCK", eventId: input.body.eventId } },
    });
    if (priorEvent) {
      if (priorEvent.requestHash !== hash) {
        throw new AppError(409, "PAYMENT_EVENT_REUSED", "该支付事件已用于不同请求");
      }
      const session = await tx.session.findFirstOrThrow({ where: { id: input.sessionId, userId: input.userId } });
      const data = {
        paymentId: priorEvent.id,
        eventId: priorEvent.eventId,
        assessmentId: priorEvent.assessmentId,
        outcome: priorEvent.outcome,
        simulated: true,
        subscription: subscriptionDto(subscription, now),
        sessionExpiresAt: session.expiresAt.toISOString(),
      };
      await saveReceipt(tx, { userId: input.userId, operation, key: input.key, hash, status: 200, data: json(data) });
      return { data, idempotencyReplayed: false, eventReplayed: true };
    }

    const assessment = await tx.assessment.findFirst({
      where: { id: input.body.assessmentId, userId: input.userId, status: "COMPLETED" },
    });
    if (!assessment) throw new AppError(404, "ASSESSMENT_NOT_FOUND", "已完成测评不存在");

    const effectiveStatus = effectiveSubscriptionStatus({
      status: subscription.status as "INACTIVE" | "ACTIVE",
      startsAt: subscription.startsAt,
      expiresAt: subscription.expiresAt,
    }, now);
    if (effectiveStatus === "INVALID") throw new AppError(503, "TEMPORARILY_UNAVAILABLE", "权益状态暂时不可用");
    const startsAt = effectiveStatus === "ACTIVE" ? subscription.startsAt! : now;
    const expiresAt = effectiveStatus === "ACTIVE" ? subscription.expiresAt! : new Date(now.getTime() + 30 * DAY_MS);
    const outcome = effectiveStatus === "ACTIVE" ? "ALREADY_ACTIVE" : "ACTIVATED";
    const savedSubscription = effectiveStatus === "ACTIVE" ? subscription : await tx.subscription.update({
      where: { id: subscription.id },
      data: { status: "ACTIVE", planCode: "DEMO_30D", startsAt, expiresAt, updatedAt: now },
    });
    const currentSession = await tx.session.findFirstOrThrow({ where: { id: input.sessionId, userId: input.userId } });
    const nextSessionExpiry = sessionExpiryForActivation(currentSession.expiresAt, expiresAt);
    const savedSession = nextSessionExpiry > currentSession.expiresAt
      ? await tx.session.update({ where: { id: currentSession.id }, data: { expiresAt: nextSessionExpiry } })
      : currentSession;
    const createdEvent = await tx.paymentEvent.create({ data: {
      id: randomUUID(),
      userId: input.userId,
      assessmentId: assessment.id,
      subscriptionId: savedSubscription.id,
      provider: "MOCK",
      eventId: input.body.eventId,
      requestHash: hash,
      outcome,
      planCode: "DEMO_30D",
      observedStartsAt: startsAt,
      observedExpiresAt: expiresAt,
      createdAt: now,
    } });
    await touchPurgeAfter(tx, input.userId, now);
    const data = {
      paymentId: createdEvent.id,
      eventId: input.body.eventId,
      assessmentId: assessment.id,
      outcome,
      simulated: true,
      subscription: subscriptionDto(savedSubscription, now),
      sessionExpiresAt: savedSession.expiresAt.toISOString(),
    };
    await saveReceipt(tx, { userId: input.userId, operation, key: input.key, hash, status: 200, data: json(data) });
    return { data, idempotencyReplayed: false, eventReplayed: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 2_000, timeout: 5_000 });
}
