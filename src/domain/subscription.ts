const DAY_MS = 86_400_000;

export type StoredSubscription = {
  status: "INACTIVE" | "ACTIVE";
  startsAt: Date | null;
  expiresAt: Date | null;
};

export type EffectiveSubscriptionStatus = "INACTIVE" | "ACTIVE" | "EXPIRED" | "INVALID";

export function effectiveSubscriptionStatus(subscription: StoredSubscription, now: Date): EffectiveSubscriptionStatus {
  if (subscription.status === "INACTIVE") {
    return subscription.startsAt === null && subscription.expiresAt === null ? "INACTIVE" : "INVALID";
  }
  if (!subscription.startsAt || !subscription.expiresAt || subscription.expiresAt <= subscription.startsAt || subscription.startsAt > now) {
    return "INVALID";
  }
  return now < subscription.expiresAt ? "ACTIVE" : "EXPIRED";
}

export function sessionExpiryForActivation(currentExpiry: Date, subscriptionExpiry: Date): Date {
  const required = new Date(subscriptionExpiry.getTime() + 7 * DAY_MS);
  return currentExpiry > required ? currentExpiry : required;
}

export function nextPurgeAfter(input: {
  currentPurgeAfter: Date;
  now: Date;
  sessionExpiries: Date[];
  subscriptionExpiry: Date | null;
}): Date {
  const candidates = [input.currentPurgeAfter.getTime(), input.now.getTime() + 30 * DAY_MS];
  for (const expiry of input.sessionExpiries) candidates.push(expiry.getTime());
  if (input.subscriptionExpiry) candidates.push(input.subscriptionExpiry.getTime() + 7 * DAY_MS);
  return new Date(Math.max(...candidates));
}
