import { z } from "zod";
import { optionalAuth, setSessionCookie } from "@/server/auth";
import { AppError } from "@/server/errors";
import { ok, readJson, requireOrigin, route } from "@/server/http";
import { createSession, readSession } from "@/server/session-service";
import { consumeSessionCreationCapacity } from "@/server/rate-limit";

const emptyBody = z.strictObject({});

export async function POST(request: Request) {
  return route(async () => {
    const nextRequest = request as import("next/server").NextRequest;
    requireOrigin(nextRequest);
    await readJson(nextRequest, emptyBody);
    let auth = null;
    try {
      auth = await optionalAuth(nextRequest);
    } catch (error) {
      const staleCookie = error instanceof AppError && error.code === "SESSION_EXPIRED" && !nextRequest.headers.has("authorization");
      if (!staleCookie) throw error;
    }
    if (auth) {
      const current = await readSession(auth);
      const response = ok(current.data, 200);
      if (auth.source === "cookie") setSessionCookie(response, auth.rawToken, current.expiresAt);
      return response;
    }
    await consumeSessionCreationCapacity();
    const created = await createSession();
    const response = ok(created.data, 201);
    setSessionCookie(response, created.token, created.expiresAt);
    return response;
  });
}
