import { deleteMeBodySchema } from "@/contracts/schemas";
import { deleteAccount } from "@/server/account-service";
import { clearSessionCookie, requireAuth } from "@/server/auth";
import { noContent, readJson, requireOrigin, route } from "@/server/http";

export async function DELETE(request: Request) {
  return route(async () => {
    const nextRequest = request as import("next/server").NextRequest;
    requireOrigin(nextRequest);
    const auth = await requireAuth(nextRequest);
    await readJson(nextRequest, deleteMeBodySchema);
    await deleteAccount(auth.user.id);
    const response = noContent();
    clearSessionCookie(response);
    return response;
  });
}
