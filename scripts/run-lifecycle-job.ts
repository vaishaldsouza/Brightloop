import { evaluateAutomatedLifecycleTransitions } from "../src/lib/lifecycleAutomation";
import prisma from "../src/lib/prisma";

async function executeJobOnce(): Promise<boolean> {
  const start = Date.now();
  console.log(`[${new Date().toISOString()}] Starting automated lifecycle transitions job...`);

  try {
    const res = await evaluateAutomatedLifecycleTransitions();
    const elapsed = Date.now() - start;

    console.log(
      `[${new Date().toISOString()}] Job completed in ${elapsed}ms: ` +
      `${res.expiredQuotationsClosed} expired quotations closed, ` +
      `${res.autoClosedSubscriptions} subscriptions auto-closed.`
    );

    if (res.errors && res.errors.length > 0) {
      console.error(`[${new Date().toISOString()}] Job reported ${res.errors.length} errors:`, res.errors);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Job encountered an unhandled error:`, error);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isDaemon = args.includes("--daemon");
  const intervalArg = args.find((a) => a.startsWith("--interval="));
  const intervalSeconds = intervalArg ? parseInt(intervalArg.split("=")[1], 10) || 60 : 60;

  if (!isDaemon) {
    const ok = await executeJobOnce();
    await prisma.$disconnect();
    process.exit(ok ? 0 : 1);
  } else {
    console.log(`[Lifecycle Automation Daemon] Running every ${intervalSeconds} seconds (Ctrl+C to stop)...`);
    await executeJobOnce();

    const intervalHandle = setInterval(async () => {
      await executeJobOnce();
    }, intervalSeconds * 1000);

    const shutdown = async () => {
      console.log("\n[Lifecycle Automation Daemon] Shutting down...");
      clearInterval(intervalHandle);
      await prisma.$disconnect();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
}

main();
