import { NextRequest, NextResponse } from "next/server";
import { evaluateAutomatedLifecycleTransitions } from "@/lib/lifecycleAutomation";

/**
 * Scheduled Cron Endpoint for Automated Lifecycle Transitions (PRD §4.3, §4.5, §10).
 *
 * Securing the endpoint:
 * In production: Configured with process.env.CRON_SECRET.
 * Requests must pass "Authorization: Bearer <CRON_SECRET>" or "x-cron-secret: <CRON_SECRET>".
 */
export async function GET(request: NextRequest) {
  return handleCronExecution(request);
}

export async function POST(request: NextRequest) {
  return handleCronExecution(request);
}

async function handleCronExecution(request: NextRequest) {
  const startTime = Date.now();
  const authHeader = request.headers.get("authorization");
  const customSecretHeader = request.headers.get("x-cron-secret");

  const expectedSecret = process.env.CRON_SECRET || "brightloop-dev-cron-secret";

  // Check Bearer token or custom header
  let providedSecret: string | null = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    providedSecret = authHeader.substring(7).trim();
  } else if (customSecretHeader) {
    providedSecret = customSecretHeader.trim();
  }

  // Verify secret (or permit localhost in non-production when secret not set)
  const isLocalhost =
    request.headers.get("host")?.includes("localhost") ||
    request.headers.get("host")?.includes("127.0.0.1");

  const isAuthorized =
    providedSecret === expectedSecret ||
    (!process.env.CRON_SECRET && isLocalhost);

  if (!isAuthorized) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        message: "Invalid or missing cron authorization secret.",
      },
      { status: 401 }
    );
  }

  try {
    const result = await evaluateAutomatedLifecycleTransitions();
    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      ...result,
      durationMs,
    });
  } catch (error) {
    console.error("Scheduled lifecycle job failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error during lifecycle automation",
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}
