import { effectiveSubscriptionStatus } from "@/domain/subscription";
import { env } from "@/server/config";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { fullReport, previewReport } from "@/server/presenters";

export async function getPublicDemoReport(view: "preview" | "full", now = new Date()) {
  const config = env();
  if (!config.DEMO_MODE) throw new AppError(404, "FEATURE_DISABLED", "公开演示未开启");
  const sessionId = config.DEMO_PAID_SESSION_ID!;
  const assessmentId = config.DEMO_PAID_ASSESSMENT_ID!;
  const session = await db.session.findUnique({ where: { id: sessionId }, include: { user: { include: { subscription: true } } } });
  if (!session || !session.user.isDemo || session.revokedAt || session.expiresAt <= now || !session.user.subscription) {
    throw new AppError(503, "DEMO_NOT_READY", "完整演示报告暂时不可用");
  }
  const assessment = await db.assessment.findFirst({
    where: { id: assessmentId, userId: session.userId, status: "COMPLETED" },
    include: { result: true },
  });
  if (!assessment?.result) throw new AppError(503, "DEMO_NOT_READY", "完整演示报告暂时不可用");
  const status = effectiveSubscriptionStatus({
    status: session.user.subscription.status as "INACTIVE" | "ACTIVE",
    startsAt: session.user.subscription.startsAt,
    expiresAt: session.user.subscription.expiresAt,
  }, now);
  if (status !== "ACTIVE") throw new AppError(503, "DEMO_NOT_READY", "完整演示报告暂时不可用");
  const report = view === "preview"
    ? previewReport(assessment, assessment.result, session.user.subscription, now, true)
    : fullReport(assessment, assessment.result, session.user.subscription, now, true);
  return {
    ...report,
    demo: true,
    demoSessionExpiresAt: session.expiresAt.toISOString(),
  };
}
