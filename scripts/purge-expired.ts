import { db } from "../src/server/db";
import { purgeExpiredAccounts } from "../src/server/account-service";

async function main() {
  const execute = process.argv.includes("--execute");
  const now = new Date();
  if (!execute) {
    const candidates = await db.user.findMany({
      where: { isDemo: false, purgeAfter: { lte: now } },
      select: { id: true },
      orderBy: { purgeAfter: "asc" },
      take: 500,
    });
    console.info(JSON.stringify({ mode: "dry-run", eligibleUsers: candidates.length, checkedAt: now.toISOString() }));
    return;
  }
  const result = await purgeExpiredAccounts(now, 500);
  console.info(JSON.stringify({ mode: "execute", ...result, finishedAt: new Date().toISOString() }));
}

main().finally(async () => db.$disconnect());
