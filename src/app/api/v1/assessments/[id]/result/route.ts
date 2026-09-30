import { assessmentIdSchema } from "@/contracts/schemas";
import { requireAuth } from "@/server/auth";
import { ok, route } from "@/server/http";
import { getReport } from "@/server/result-service";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const auth = await requireAuth(request as import("next/server").NextRequest);
    const { id } = await context.params;
    return ok(await getReport(auth.user.id, assessmentIdSchema.parse(id)));
  });
}
