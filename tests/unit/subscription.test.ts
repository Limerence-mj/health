import { describe, expect, it } from "vitest";
import { effectiveSubscriptionStatus, nextPurgeAfter, sessionExpiryForActivation } from "@/domain/subscription";

const base = new Date("2026-09-28T00:00:00Z");
const day = 86_400_000;

describe("订阅与生命周期", () => {
  it("正确处理开始、到期与异常状态边界", () => {
    expect(effectiveSubscriptionStatus({ status: "INACTIVE", startsAt: null, expiresAt: null }, base)).toBe("INACTIVE");
    expect(effectiveSubscriptionStatus({ status: "ACTIVE", startsAt: base, expiresAt: new Date(+base + day) }, base)).toBe("ACTIVE");
    expect(effectiveSubscriptionStatus({ status: "ACTIVE", startsAt: base, expiresAt: new Date(+base + day) }, new Date(+base + day))).toBe("EXPIRED");
    expect(effectiveSubscriptionStatus({ status: "ACTIVE", startsAt: new Date(+base + day), expiresAt: new Date(+base + 2 * day) }, base)).toBe("INVALID");
  });

  it("支付后会话至少覆盖权益到期后七天", () => {
    const subscriptionExpiry = new Date(+base + 30 * day);
    expect(sessionExpiryForActivation(new Date(+base + 7 * day), subscriptionExpiry)).toEqual(new Date(+base + 37 * day));
    expect(sessionExpiryForActivation(new Date(+base + 40 * day), subscriptionExpiry)).toEqual(new Date(+base + 40 * day));
  });

  it("清理期限不早于会话、权益加七天和最后写入加三十天", () => {
    expect(nextPurgeAfter({
      currentPurgeAfter: new Date(+base + 10 * day),
      now: base,
      sessionExpiries: [new Date(+base + 40 * day)],
      subscriptionExpiry: new Date(+base + 30 * day),
    })).toEqual(new Date(+base + 40 * day));
  });
});
