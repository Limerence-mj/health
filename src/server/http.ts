import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError, type ZodType } from "zod";
import { AppError, validationError } from "@/server/errors";
import { env } from "@/server/config";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function readJson<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  const length = request.headers.get("content-length");
  if (length !== null && Number(length) > 16_384) throw new AppError(413, "PAYLOAD_TOO_LARGE", "请求体超过 16KB");
  let text: string;
  try {
    text = await request.text();
  } catch {
    throw new AppError(400, "INVALID_JSON", "无法读取请求体");
  }
  if (Buffer.byteLength(text, "utf8") > 16_384) throw new AppError(413, "PAYLOAD_TOO_LARGE", "请求体超过 16KB");
  let body: unknown;
  try {
    body = text.length ? JSON.parse(text) : {};
  } catch {
    throw new AppError(400, "INVALID_JSON", "请求体不是合法 JSON");
  }
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) throw validationError(error);
    throw error;
  }
}

export function requireOrigin(request: NextRequest): void {
  if (request.headers.get("origin") !== env().APP_ORIGIN) {
    throw new AppError(403, "ORIGIN_REJECTED", "请求来源不受信任");
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "写请求只接受 application/json");
  }
}

export function requireIdempotencyKey(request: NextRequest): string {
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
    throw new AppError(422, "VALIDATION_ERROR", "缺少合法的 Idempotency-Key", { "header.idempotency-key": "必须是 UUID" });
  }
  return key.toLowerCase();
}

export function ok(data: unknown, status = 200, headers?: HeadersInit): NextResponse {
  return NextResponse.json({ data, meta: { requestId: randomUUID() } }, { status, headers: { ...NO_STORE, ...headers } });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}

export function apiError(error: unknown, requestId = randomUUID()): NextResponse {
  const transientDatabaseError = error instanceof Prisma.PrismaClientKnownRequestError && (
    error.code === "P2028" || error.code === "P2034" ||
    (error.code === "P2010" && ["55P03", "57014"].includes(String(error.meta?.code)))
  );
  const normalized = error instanceof AppError
    ? error
    : error instanceof ZodError
      ? validationError(error)
      : transientDatabaseError
        ? new AppError(503, "RETRY_LATER", "服务繁忙，请稍后重试")
      : new AppError(500, "INTERNAL_ERROR", "服务暂时不可用");
  if (!(error instanceof AppError) && !(error instanceof ZodError) && !transientDatabaseError) {
    console.error(JSON.stringify({ event: "request.failed", requestId, code: normalized.code }));
  }
  return NextResponse.json({
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.fields ? { fields: normalized.fields } : {}),
      ...(normalized.details ? { details: normalized.details } : {}),
    },
    meta: { requestId },
  }, { status: normalized.status, headers: { ...NO_STORE, ...normalized.responseHeaders } });
}

export async function route(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    return apiError(error);
  }
}
