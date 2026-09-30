import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import type { TransactionClient } from "@/server/idempotency";
import { lockUser } from "@/server/lifecycle";

async function deleteUserGraph(tx: TransactionClient, userId: string): Promise<void> {
    const assessments = await tx.assessment.findMany({ where: { userId }, select: { id: true } });
    const assessmentIds = assessments.map((item) => item.id);
    await tx.paymentEvent.deleteMany({ where: { userId } });
    await tx.idempotencyRecord.deleteMany({ where: { userId } });
    if (assessmentIds.length) await tx.assessmentResult.deleteMany({ where: { assessmentId: { in: assessmentIds } } });
    await tx.assessment.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.subscription.deleteMany({ where: { userId } });
    await tx.user.delete({ where: { id: userId } });
}

export async function deleteAccount(userId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await lockUser(tx, userId);
    await deleteUserGraph(tx, userId);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 2_000, timeout: 5_000 });
}

export async function purgeExpiredAccount(userId: string, now = new Date()): Promise<boolean> {
  return db.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const eligible = await tx.user.findFirst({
      where: { id: userId, isDemo: false, purgeAfter: { lte: now } },
      select: { id: true },
    });
    if (!eligible) return false;
    await deleteUserGraph(tx, userId);
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 2_000, timeout: 5_000 });
}
