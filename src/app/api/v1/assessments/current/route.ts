import { getCurrentAssessment } from "@/server/assessment-service";
import { requireAuth } from "@/server/auth";
import { ok, route } from "@/server/http";

export async function GET(request: Request) {
  return route(async () => {
    const auth = await requireAuth(request as import("next/server").NextRequest);
    return ok(await getCurrentAssessment(auth.user.id));
  });
}
