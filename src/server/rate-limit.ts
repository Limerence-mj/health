import { Prisma } from "@prisma/client";
import { env } from "@/server/config";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";

const WINDOW_MS = 60_000;
const SESSION_BUCKET = "session-creation-global";
const ADVISORY_LOCK_KEY = 2_091_770_031;

export async function consumeSessionCreationCapacity(now = new Date()): Promise<void> {
  const limit = env().SESSION_CREATION_LIMIT_PER_MINUTE;
  await db.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_KEY})`);
    const bucket = await tx.rateLimitBucket.findUnique({ where: { key: SESSION_BUCKET } });
    const windowExpired = !bucket || now.getTime() - bucket.windowStart.getTime() >= WINDOW_MS;
    if (windowExpired) {
      await tx.rateLimitBucket.upsert({
        where: { key: SESSION_BUCKET },
        create: { key: SESSION_BUCKET, windowStart: now, count: 1, updatedAt: now },
        update: { windowStart: now, count: 1, updatedAt: now },
      });
      return;
    }
    if (bucket.count >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.windowStart.getTime() + WINDOW_MS - now.getTime()) / 1000));
      throw new AppError(
        429,
        "RATE_LIMITED",
        "新建匿名会话过于频繁，请稍后再试",
        undefined,
        { retryAfterSeconds },
        { "Retry-After": String(retryAfterSeconds) },
      );
    }
    await tx.rateLimitBucket.update({ where: { key: SESSION_BUCKET }, data: { count: { increment: 1 }, updatedAt: now } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 2_000, timeout: 5_000 });
}
