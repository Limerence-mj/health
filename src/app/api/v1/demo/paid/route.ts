import { z } from "zod";
import { getPublicDemoReport } from "@/server/demo-service";
import { AppError } from "@/server/errors";
import { ok, route } from "@/server/http";

const viewSchema = z.enum(["preview", "full"]);

export async function GET(request: Request) {
  return route(async () => {
    const url = new URL(request.url);
    const keys = [...url.searchParams.keys()];
    if (keys.some((key) => key !== "view") || url.searchParams.getAll("view").length > 1) {
      throw new AppError(422, "VALIDATION_ERROR", "公开演示只接受单个 view 参数", { query: "只允许 view=preview 或 view=full" });
    }
    const view = viewSchema.parse(url.searchParams.get("view") ?? "full");
    return ok(await getPublicDemoReport(view));
  });
}
