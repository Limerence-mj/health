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
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '2s'");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5s'");
    const eligible = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id
      FROM users
      WHERE id = ${userId}::uuid
        AND is_demo = false
        AND purge_after <= ${now}
      FOR UPDATE SKIP LOCKED
    `);
    if (eligible.length === 0) return false;
    await deleteUserGraph(tx, userId);
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 2_000, timeout: 5_000 });
}

export async function purgeExpiredAccounts(now = new Date(), limit = 100) {
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  const candidates = await db.user.findMany({
    where: { isDemo: false, purgeAfter: { lte: now } },
    select: { id: true },
    orderBy: { purgeAfter: "asc" },
    take: safeLimit,
  });
  let deletedUsers = 0;
  for (const candidate of candidates) {
    if (await purgeExpiredAccount(candidate.id, new Date())) deletedUsers += 1;
  }
  return { eligibleUsers: candidates.length, deletedUsers, checkedAt: now.toISOString() };
}
