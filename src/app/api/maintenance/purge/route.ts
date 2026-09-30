import { purgeExpiredAccounts } from "@/server/account-service";
import { env } from "@/server/config";
import { AppError } from "@/server/errors";
import { ok, route } from "@/server/http";

export async function GET(request: Request) {
  return route(async () => {
    const secret = env().CRON_SECRET;
    if (!secret) throw new AppError(404, "FEATURE_DISABLED", "自动清理入口未开启");
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      throw new AppError(401, "MAINTENANCE_AUTH_REQUIRED", "维护凭证无效");
    }
    return ok(await purgeExpiredAccounts(new Date(), 100));
  });
}
