import { paymentBodySchema } from "@/contracts/schemas";
import { requireAuth, setSessionCookie } from "@/server/auth";
import { ok, readJson, requireIdempotencyKey, requireOrigin, route } from "@/server/http";
import { activateMockPayment } from "@/server/payment-service";

export async function POST(request: Request) {
  return route(async () => {
    const nextRequest = request as import("next/server").NextRequest;
    requireOrigin(nextRequest);
    const auth = await requireAuth(nextRequest);
    const key = requireIdempotencyKey(nextRequest);
    const body = await readJson(nextRequest, paymentBodySchema);
    const result = await activateMockPayment({ userId: auth.user.id, sessionId: auth.session.id, key, body });
    const response = ok(result.data, 200, {
      ...(result.idempotencyReplayed ? { "Idempotency-Replayed": "true" } : {}),
      ...(result.eventReplayed ? { "Payment-Event-Replayed": "true" } : {}),
    });
    if (auth.source === "cookie") setSessionCookie(response, auth.rawToken, new Date(String(result.data.sessionExpiresAt)));
    return response;
  });
}
