import { assessmentIdSchema, stepKeySchema, stepSaveBodySchemas } from "@/contracts/schemas";
import { saveStep } from "@/server/assessment-service";
import { requireAuth } from "@/server/auth";
import { ok, readJson, requireIdempotencyKey, requireOrigin, route } from "@/server/http";

export async function PUT(request: Request, context: { params: Promise<{ id: string; step: string }> }) {
  return route(async () => {
    const nextRequest = request as import("next/server").NextRequest;
    requireOrigin(nextRequest);
    const auth = await requireAuth(nextRequest);
    const key = requireIdempotencyKey(nextRequest);
    const params = await context.params;
    const assessmentId = assessmentIdSchema.parse(params.id);
    const step = stepKeySchema.parse(params.step);
    const body = await readJson(nextRequest, stepSaveBodySchemas[step] as import("zod").ZodType);
    const result = await saveStep({ userId: auth.user.id, assessmentId, step, body: body as never, key });
    return ok(result.data, 200, result.replayed ? { "Idempotency-Replayed": "true" } : undefined);
  });
}
