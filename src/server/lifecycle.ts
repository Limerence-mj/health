import { Prisma } from "@prisma/client";
import { nextPurgeAfter } from "@/domain/subscription";
import { retentionPolicy } from "@/server/config";
import type { TransactionClient } from "@/server/idempotency";

export async function lockUser(tx: TransactionClient, userId: string): Promise<void> {
  await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '2s'");
  await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5s'");
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`);
  if (rows.length !== 1) throw new Error("USER_LOCK_FAILED");
}

export async function touchPurgeAfter(tx: TransactionClient, userId: string, now: Date): Promise<Date> {
  const retention = retentionPolicy();
  const [user, sessions, subscription] = await Promise.all([
    tx.user.findUniqueOrThrow({ where: { id: userId }, select: { purgeAfter: true } }),
    tx.session.findMany({ where: { userId, revokedAt: null }, select: { expiresAt: true } }),
    tx.subscription.findUnique({ where: { userId }, select: { expiresAt: true } }),
  ]);
  const purgeAfter = nextPurgeAfter({
    currentPurgeAfter: user.purgeAfter,
    now,
    sessionExpiries: sessions.map((session) => session.expiresAt),
    subscriptionExpiry: subscription?.expiresAt ?? null,
    inactiveDays: retention.inactiveDays,
    subscriptionGraceDays: retention.postUnlockGraceDays,
  });
  if (purgeAfter > user.purgeAfter) await tx.user.update({ where: { id: userId }, data: { purgeAfter } });
  return purgeAfter;
}
