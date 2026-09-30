import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { createSessionToken, hashToken, type AuthContext } from "@/server/auth";
import { retentionPolicy } from "@/server/config";
import { db } from "@/server/db";
import { sessionDto } from "@/server/presenters";

const DAY_MS = 86_400_000;

async function currentAssessment(client: Prisma.TransactionClient | typeof db, userId: string) {
  const draft = await client.assessment.findFirst({
    where: { userId, status: "DRAFT" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return draft ?? client.assessment.findFirst({
    where: { userId, status: "COMPLETED" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export async function createSession(now = new Date()) {
  const retention = retentionPolicy();
  const userId = randomUUID();
  const sessionId = randomUUID();
  const assessmentId = randomUUID();
  const subscriptionId = randomUUID();
  const token = createSessionToken();
  const expiresAt = new Date(now.getTime() + retention.sessionDays * DAY_MS);
  const purgeAfter = new Date(now.getTime() + retention.inactiveDays * DAY_MS);
  const data = await db.$transaction(async (tx) => {
    const user = await tx.user.create({ data: {
      id: userId,
      purgeAfter,
      createdAt: now,
      updatedAt: now,
    } });
    const session = await tx.session.create({ data: {
      id: sessionId,
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      createdAt: now,
    } });
    const assessment = await tx.assessment.create({ data: {
      id: assessmentId,
      userId,
      createdAt: now,
      updatedAt: now,
    } });
    const subscription = await tx.subscription.create({ data: {
      id: subscriptionId,
      userId,
      createdAt: now,
      updatedAt: now,
    } });
    return sessionDto({
      sessionId: session.id,
      expiresAt: session.expiresAt,
      assessment,
      healthConsentVersion: user.healthConsentVersion,
      healthConsentAt: user.healthConsentAt,
      subscription,
      now,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 2_000, timeout: 5_000 });
  return { data, token, expiresAt, created: true };
}

export async function readSession(auth: AuthContext, now = new Date()) {
  const [user, session, assessment, subscription] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: auth.user.id } }),
    db.session.findUniqueOrThrow({ where: { id: auth.session.id } }),
    currentAssessment(db, auth.user.id),
    db.subscription.findUniqueOrThrow({ where: { userId: auth.user.id } }),
  ]);
  return {
    data: sessionDto({
      sessionId: session.id,
      expiresAt: session.expiresAt,
      assessment,
      healthConsentVersion: user.healthConsentVersion,
      healthConsentAt: user.healthConsentAt,
      subscription,
      now,
    }),
    expiresAt: session.expiresAt,
  };
}
