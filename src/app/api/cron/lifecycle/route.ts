import { NextRequest, NextResponse } from "next/server";
import { evaluateAutomatedLifecycleTransitions } from "@/lib/lifecycleAutomation";
import crypto from "crypto";

/**
 * Constant-time string comparison using SHA-256 digests.
 * Normalizing both inputs to 32-byte fixed-length hashes prevents timing leaks based on string length,
 * and timingSafeEqual prevents timing leaks on byte contents.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash("sha256").update(a).digest();
  const hashB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * GET requests must NOT perform state-changing lifecycle mutations.
 * Returns 405 Method Not Allowed with guidance to use POST.
 */
export async function GET() {
  return NextResponse.json(
    {
      error: "Method Not Allowed",
      message: "GET does not perform state-changing lifecycle operations. Use POST with authorization for execution.",
    },
    {
      status: 405,
      headers: { Allow: "POST" },
    }
  );
}

/**
 * Scheduled Cron Endpoint for Automated Lifecycle Transitions (PRD §4.3, §4.5, §10).
 * State-changing execution requires HTTP POST.
 *
 * Security Requirements:
 * 1. Fails closed when CRON_SECRET is missing or empty.
 * 2. Rejects missing or invalid credentials with 401 Unauthorized.
 * 3. Uses constant-time comparison.
 * 4. Does not accept an arbitrary actor user ID from request parameters or headers.
 * 5. Sanitizes error responses to prevent leaking secrets or database details.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // 1. Fail closed if CRON_SECRET is missing or empty
  const configuredSecret = process.env.CRON_SECRET?.trim();
  if (!configuredSecret) {
    console.error("[CRON SECURITY] CRON_SECRET is missing or empty. Rejecting execution (fail closed).");
    return NextResponse.json(
      {
        error: "Server Misconfiguration",
        message: "CRON_SECRET is not configured on the server. Scheduled execution fails closed.",
      },
      { status: 500 }
    );
  }

  // 2. Extract credential from Authorization header or custom x-cron-secret header
  const authHeader = request.headers.get("authorization");
  const customSecretHeader = request.headers.get("x-cron-secret");

  let providedSecret: string | null = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    providedSecret = authHeader.substring(7).trim();
  } else if (customSecretHeader) {
    providedSecret = customSecretHeader.trim();
  }

  // 3. Constant-time comparison
  const isAuthorized =
    typeof providedSecret === "string" &&
    providedSecret.length > 0 &&
    timingSafeEqual(providedSecret, configuredSecret);

  if (!isAuthorized) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        message: "Invalid or missing cron authorization secret.",
      },
      { status: 401 }
    );
  }

  // 4. State-changing execution
  try {
    // Note: evaluateAutomatedLifecycleTransitions() resolves its actor internally
    // and intentionally does NOT accept arbitrary actor IDs from callers.
    const result = await evaluateAutomatedLifecycleTransitions();
    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: result.success,
      timestamp: result.timestamp,
      expiredQuotationsClosed: result.expiredQuotationsClosed,
      autoClosedSubscriptions: result.autoClosedSubscriptions,
      durationMs,
    });
  } catch (error) {
    console.error("[CRON EXECUTION ERROR] Lifecycle automation encountered a failure:", error);
    // Sanitize error response: never expose database details or secrets
    return NextResponse.json(
      {
        success: false,
        error: "An internal error occurred while executing lifecycle automation.",
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}
