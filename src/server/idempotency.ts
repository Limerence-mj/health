import { createHash, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "@/server/errors";

export type TransactionClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

export function requestHash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export async function replayIfPresent<T>(tx: TransactionClient, input: {
  userId: string;
  operation: string;
  key: string;
  hash: string;
}): Promise<T | null> {
  const record = await tx.idempotencyRecord.findUnique({
    where: { userId_operation_key: { userId: input.userId, operation: input.operation, key: input.key } },
  });
  if (!record) return null;
  if (record.requestHash !== input.hash) throw new AppError(409, "IDEMPOTENCY_KEY_REUSED", "该请求标识已用于不同内容");
  return record.responseData as T;
}

export async function saveReceipt(tx: TransactionClient, input: {
  userId: string;
  operation: string;
  key: string;
  hash: string;
  status: number;
  data: Prisma.InputJsonValue;
}): Promise<void> {
  await tx.idempotencyRecord.create({ data: {
    id: randomUUID(),
    userId: input.userId,
    operation: input.operation,
    key: input.key,
    requestHash: input.hash,
    responseStatus: input.status,
    responseData: input.data,
  } });
}
