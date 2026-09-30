import { assessmentIdSchema } from "@/contracts/schemas";
import { getAssessment } from "@/server/assessment-service";
import { requireAuth } from "@/server/auth";
import { ok, route } from "@/server/http";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const auth = await requireAuth(request as import("next/server").NextRequest);
    const { id } = await context.params;
    return ok(await getAssessment(auth.user.id, assessmentIdSchema.parse(id)));
  });
}
