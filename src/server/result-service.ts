import { effectiveSubscriptionStatus } from "@/domain/subscription";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { fullReport, previewReport } from "@/server/presenters";

export async function getReport(userId: string, assessmentId: string, now = new Date()) {
  const [assessment, subscription] = await Promise.all([
    db.assessment.findFirst({ where: { id: assessmentId, userId }, include: { result: true } }),
    db.subscription.findUnique({ where: { userId } }),
  ]);
  if (!assessment) throw new AppError(404, "ASSESSMENT_NOT_FOUND", "测评不存在");
  if (assessment.status !== "COMPLETED" || !assessment.result) {
    throw new AppError(409, "ASSESSMENT_NOT_SUBMITTED", "测评尚未提交");
  }
  if (!subscription) throw new AppError(503, "TEMPORARILY_UNAVAILABLE", "权益状态暂时不可用");
  const status = effectiveSubscriptionStatus({
    status: subscription.status as "INACTIVE" | "ACTIVE",
    startsAt: subscription.startsAt,
    expiresAt: subscription.expiresAt,
  }, now);
  return status === "ACTIVE"
    ? fullReport(assessment, assessment.result, subscription, now)
    : previewReport(assessment, assessment.result, subscription, now);
}
