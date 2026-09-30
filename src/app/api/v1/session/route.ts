import { requireAuth, setSessionCookie } from "@/server/auth";
import { ok, route } from "@/server/http";
import { readSession } from "@/server/session-service";

export async function GET(request: Request) {
  return route(async () => {
    const auth = await requireAuth(request as import("next/server").NextRequest);
    const current = await readSession(auth);
    const response = ok(current.data);
    if (auth.source === "cookie") setSessionCookie(response, auth.rawToken, current.expiresAt);
    return response;
  });
}
