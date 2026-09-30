import { db } from "../src/server/db";
import { purgeExpiredAccount } from "../src/server/account-service";

async function main() {
  const execute = process.argv.includes("--execute");
  const now = new Date();
  const candidates = await db.user.findMany({
    where: { isDemo: false, purgeAfter: { lte: now } },
    select: { id: true },
    orderBy: { purgeAfter: "asc" },
    take: 500,
  });
  if (!execute) {
    console.info(JSON.stringify({ mode: "dry-run", eligibleUsers: candidates.length, checkedAt: now.toISOString() }));
    return;
  }
  let deletedUsers = 0;
  for (const candidate of candidates) {
    if (await purgeExpiredAccount(candidate.id, new Date())) deletedUsers += 1;
  }
  console.info(JSON.stringify({ mode: "execute", eligibleUsers: candidates.length, deletedUsers, finishedAt: new Date().toISOString() }));
}

main().finally(async () => db.$disconnect());
