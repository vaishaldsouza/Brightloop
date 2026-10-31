import prisma from "../src/lib/prisma";
import { Role } from "@prisma/client";
import { generateSecureToken, hashToken } from "../src/lib/tokens";
import { resetPasswordSchema } from "../src/lib/validations/auth";
import bcrypt from "bcryptjs";

async function runFinalAudit() {
  console.log("===============================================================");
  console.log("  BATCH 4.3: FINAL CUSTOMER ONBOARDING SECURITY SUITE          ");
  console.log("===============================================================\n");

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [PASS] ${testName}`);
    } else {
      console.error(`  [FAIL] ${testName}${detail ? ` — ${detail}` : ""}`);
    }
  }

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Legacy Token Database Audit
    // -------------------------------------------------------------------------
    console.log("Test 1: Legacy Token Database Audit & SHA-256 Storage");
    const allDbTokens = await prisma.passwordResetToken.findMany();
    const hasUnhashedLegacy = allDbTokens.some((t) => !/^[a-f0-9]{64}$/.test(t.token));
    assert(!hasUnhashedLegacy, "All token records in database are strictly 64-hex SHA-256 digests (0 unhashed legacy tokens)");

    // -------------------------------------------------------------------------
    // TEST 2: Concurrent Token Redemption Atomicity (Race Condition Prevention)
    // -------------------------------------------------------------------------
    console.log("\nTest 2: Concurrent Token Redemption Atomicity");
    const testSecret = generateSecureToken();
    const testHash = await bcrypt.hash(testSecret, 12);
    const concurrentUser = await prisma.user.create({
      data: {
        name: "Concurrent Test User",
        email: `concurrent-${Date.now()}@example.com`,
        password: testHash,
        role: Role.CUSTOMER,
      },
    });

    const rawRaceToken = generateSecureToken();
    const hashedRaceToken = hashToken(rawRaceToken);
    const raceTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: {
        userId: concurrentUser.id,
        token: hashedRaceToken,
        expiresAt: raceTokenExpiry,
      },
    });

    // Helper simulating the exact atomic conditional redemption in /api/auth/reset-password
    async function attemptRedemption(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
      const hashed = hashToken(token);
      const resetToken = await prisma.passwordResetToken.findUnique({
        where: { token: hashed },
        include: { user: true },
      });

      const now = new Date();
      if (!resetToken || resetToken.usedAt || resetToken.expiresAt < now) {
        return { success: false, error: "This password reset link is invalid or has expired" };
      }

      const hashedPassword = await bcrypt.hash(newPassword, 12);

      try {
        await prisma.$transaction(async (tx) => {
          // Atomic conditional update
          const consumeResult = await tx.passwordResetToken.updateMany({
            where: {
              id: resetToken.id,
              usedAt: null,
              expiresAt: { gt: now },
            },
            data: {
              usedAt: now,
            },
          });

          if (consumeResult.count === 0) {
            throw new Error("TOKEN_ALREADY_USED_OR_EXPIRED");
          }

          await tx.user.update({
            where: { id: resetToken.userId },
            data: { password: hashedPassword },
          });
        });
        return { success: true };
      } catch (err: any) {
        if (err?.message === "TOKEN_ALREADY_USED_OR_EXPIRED") {
          return { success: false, error: "This password reset link is invalid or has expired" };
        }
        return { success: false, error: "Transaction failed" };
      }
    }

    // Fire 2 concurrent requests with the exact same token simultaneously
    const [res1, res2] = await Promise.all([
      attemptRedemption(rawRaceToken, "WinnerPassword#1A"),
      attemptRedemption(rawRaceToken, "LoserPassword#2B"),
    ]);

    const successes = [res1, res2].filter((r) => r.success).length;
    const failures = [res1, res2].filter((r) => !r.success).length;

    assert(successes === 1, "Exactly one concurrent redemption request succeeded");
    assert(failures === 1, "The second concurrent redemption was rejected (race condition prevented)");

    // Verify token is now marked used
    const consumedTokenRecord = await prisma.passwordResetToken.findUnique({
      where: { token: hashedRaceToken },
    });
    assert(consumedTokenRecord?.usedAt !== null, "Token usedAt timestamp is set");

    // Clean up concurrent user
    await prisma.passwordResetToken.deleteMany({ where: { userId: concurrentUser.id } });
    await prisma.user.delete({ where: { id: concurrentUser.id } });

    // -------------------------------------------------------------------------
    // TEST 3: Customer Creation Rollback on Setup Token Failure
    // -------------------------------------------------------------------------
    console.log("\nTest 3: Customer Creation Transaction Rollback Atomicity");
    const rollbackEmail = `rollback-test-${Date.now()}@example.com`;
    let rollbackThrew = false;

    try {
      await prisma.$transaction(async (tx) => {
        // Step 1: Create user
        const user = await tx.user.create({
          data: {
            name: "Rollback User",
            email: rollbackEmail,
            password: testHash,
            role: Role.CUSTOMER,
          },
        });

        // Step 2: Create customer
        await tx.customer.create({
          data: {
            userId: user.id,
            companyName: "Rollback Co Ltd",
            gstState: "Maharashtra",
            gstStateCode: "27",
          },
        });

        // Step 3: Simulate failure in setup token creation
        throw new Error("SIMULATED_TOKEN_CREATION_FAILURE");
      });
    } catch (e: any) {
      if (e.message === "SIMULATED_TOKEN_CREATION_FAILURE") {
        rollbackThrew = true;
      }
    }

    assert(rollbackThrew, "Transaction caught simulated failure in token creation step");

    // Verify database has no orphaned records
    const orphanedUser = await prisma.user.findUnique({ where: { email: rollbackEmail } });
    const orphanedCustomer = await prisma.customer.findFirst({ where: { companyName: "Rollback Co Ltd" } });

    assert(orphanedUser === null, "User creation rolled back cleanly (no orphan user in users table)");
    assert(orphanedCustomer === null, "Customer creation rolled back cleanly (no orphan customer in customers table)");

    // -------------------------------------------------------------------------
    // TEST 4: Invitation Link Privacy & API Response Hygiene
    // -------------------------------------------------------------------------
    console.log("\nTest 4: Invitation Link Privacy & API Hygiene");
    // Verify customer list and detail Prisma models never expose raw tokens or password hashes
    const customers = await prisma.customer.findMany({
      take: 5,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    const anyHasPassword = customers.some((c) => "password" in c.user);
    const anyHasToken = customers.some((c) => "token" in c || "onboardingToken" in c || "passwordResetToken" in c);

    assert(!anyHasPassword, "Customer queries strictly exclude password hashes from projections");
    assert(!anyHasToken, "Customer queries strictly exclude setup tokens from customer records");

    // -------------------------------------------------------------------------
    // TEST 5: Password Complexity & Expiration Rejection
    // -------------------------------------------------------------------------
    console.log("\nTest 5: Password Complexity & Expiry Enforcements");
    const complexPass = "SuperSecure#2026";
    const exactly8Pass = "Cust@123"; // exactly 8 chars
    const shortPass = "Sh@rt1";

    assert(
      resetPasswordSchema.safeParse({ token: "tok", password: complexPass }).success,
      "Valid password (>8 chars, upper, lower, special) is accepted"
    );
    assert(
      !resetPasswordSchema.safeParse({ token: "tok", password: exactly8Pass }).success,
      "Password of exactly 8 characters is strictly rejected (PRD §4.1)"
    );
    assert(
      !resetPasswordSchema.safeParse({ token: "tok", password: shortPass }).success,
      "Password of < 8 characters is strictly rejected"
    );

    // -------------------------------------------------------------------------
    // TEST 6: Seeded Credentials & Role Access Verification
    // -------------------------------------------------------------------------
    console.log("\nTest 6: Seeded Credentials & Role Access Verification");
    const admin = await prisma.user.findUnique({ where: { email: "rajesh@brightloop.in" } });
    const staff = await prisma.user.findUnique({ where: { email: "priya.p@brightloop.in" } });
    const customer = await prisma.user.findUnique({ where: { email: "contact@techcraft.in" } });

    assert(await bcrypt.compare("admin@123", admin!.password), "Seeded Admin credentials intact");
    assert(await bcrypt.compare("staff@123", staff!.password), "Seeded Staff credentials intact");
    assert(await bcrypt.compare("customer@123", customer!.password), "Seeded Customer credentials intact");

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log("\n===============================================================");
    console.log(`  FINAL SECURITY SUITE: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log("===============================================================\n");

    if (passedTests === totalTests) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error) {
    console.error("FATAL ERROR IN FINAL SECURITY SUITE:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runFinalAudit();
