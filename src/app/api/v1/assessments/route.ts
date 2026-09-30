import { createAssessmentBodySchema } from "@/contracts/schemas";
import { createAssessment } from "@/server/assessment-service";
import { requireAuth } from "@/server/auth";
import { ok, readJson, requireIdempotencyKey, requireOrigin, route } from "@/server/http";

export async function POST(request: Request) {
  return route(async () => {
    const nextRequest = request as import("next/server").NextRequest;
    requireOrigin(nextRequest);
    const auth = await requireAuth(nextRequest);
    const key = requireIdempotencyKey(nextRequest);
    const body = await readJson(nextRequest, createAssessmentBodySchema);
    const result = await createAssessment({ userId: auth.user.id, key, ...body });
    return ok(result.data, result.status, result.replayed ? { "Idempotency-Replayed": "true" } : undefined);
  });
}
