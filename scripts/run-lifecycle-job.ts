import { evaluateAutomatedLifecycleTransitions } from "../src/lib/lifecycleAutomation";
import { evaluateAutomatedBilling } from "../src/lib/billingEngine";
import prisma from "../src/lib/prisma";

async function executeJobOnce(): Promise<boolean> {
  const start = Date.now();
  console.log(`[${new Date().toISOString()}] Starting automated lifecycle and billing job...`);

  try {
    const lifecycleRes = await evaluateAutomatedLifecycleTransitions();
    const billingRes = await evaluateAutomatedBilling();
    const elapsed = Date.now() - start;

    console.log(
      `[${new Date().toISOString()}] Job completed in ${elapsed}ms: ` +
      `${lifecycleRes.expiredQuotationsClosed} expired quotations closed, ` +
      `${lifecycleRes.autoClosedSubscriptions} subscriptions auto-closed, ` +
      `${billingRes.invoicesGenerated} invoices generated across ${billingRes.subscriptionsProcessed} subscriptions.`
    );

    const allErrors = [
      ...(lifecycleRes.errors || []),
      ...(billingRes.errors || []),
    ];

    if (allErrors.length > 0) {
      console.error(`[${new Date().toISOString()}] Job reported ${allErrors.length} errors:`, allErrors);
      return false;
    }

    return lifecycleRes.success && billingRes.success;
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
      try {
        await executeJobOnce();
      } catch (err) {
        console.error("[Lifecycle Automation Daemon] Cycle error:", err);
      }
    }, intervalSeconds * 1000);

    const shutdown = async () => {
      console.log("\n[Lifecycle Automation Daemon] Shutting down cleanly...");
      clearInterval(intervalHandle);
      await prisma.$disconnect().catch(() => {});
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
}

main().catch(async (err) => {
  console.error("Fatal error in lifecycle job runner:", err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
