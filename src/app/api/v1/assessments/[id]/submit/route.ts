import { assessmentIdSchema, submitBodySchema } from "@/contracts/schemas";
import { submitAssessment } from "@/server/assessment-service";
import { requireAuth } from "@/server/auth";
import { ok, readJson, requireIdempotencyKey, requireOrigin, route } from "@/server/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const nextRequest = request as import("next/server").NextRequest;
    requireOrigin(nextRequest);
    const auth = await requireAuth(nextRequest);
    const key = requireIdempotencyKey(nextRequest);
    const body = await readJson(nextRequest, submitBodySchema);
    const { id } = await context.params;
    const result = await submitAssessment({ userId: auth.user.id, assessmentId: assessmentIdSchema.parse(id), expectedRevision: body.expectedRevision, key });
    return ok(result.data, 200, result.replayed ? { "Idempotency-Replayed": "true" } : undefined);
  });
}
