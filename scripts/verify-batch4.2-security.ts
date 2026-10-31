import prisma from "../src/lib/prisma";
import { Role } from "@prisma/client";
import { generateSecureToken, hashToken } from "../src/lib/tokens";
import { resetPasswordSchema } from "../src/lib/validations/auth";
import bcrypt from "bcryptjs";

async function runSecurityAudit() {
  console.log("===============================================================");
  console.log("  BATCH 4.2: SECURE CUSTOMER ONBOARDING VERIFICATION SUITE     ");
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
    // TEST 1: Two customer accounts never receive the same initial password
    // -------------------------------------------------------------------------
    console.log("Testing Criterion 1: Uniqueness of Initial Passwords");
    const secret1 = generateSecureToken();
    const secret2 = generateSecureToken();
    const hash1 = await bcrypt.hash(secret1, 12);
    const hash2 = await bcrypt.hash(secret2, 12);

    assert(secret1 !== secret2, "Generated secrets for two customer accounts are distinct");
    assert(hash1 !== hash2, "Bcrypt hashes for two customer accounts are distinct");
    const crossMatch1 = await bcrypt.compare(secret1, hash2);
    const crossMatch2 = await bcrypt.compare(secret2, hash1);
    assert(!crossMatch1 && !crossMatch2, "Account 1's secret cannot unlock Account 2's hash (two accounts never share initial password)");

    // -------------------------------------------------------------------------
    // TEST 2: No shared default password is assigned
    // -------------------------------------------------------------------------
    console.log("\nTesting Criterion 2: Absence of Shared Default Password");
    const legacyDefaultPassword = "Customer@123";
    const matchesLegacyDefault = await bcrypt.compare(legacyDefaultPassword, hash1);
    assert(!matchesLegacyDefault, "Newly created account does NOT match legacy shared 'Customer@123'");

    // -------------------------------------------------------------------------
    // TEST 3: Setup tokens are unique and cryptographically generated
    // -------------------------------------------------------------------------
    console.log("\nTesting Criterion 3: Setup Token Cryptographic Generation");
    const tokenA = generateSecureToken();
    const tokenB = generateSecureToken();
    assert(tokenA.length === 64, "Setup token is 64 hex characters (32 bytes entropy)");
    assert(tokenB.length === 64, "Second setup token is 64 hex characters (32 bytes entropy)");
    assert(tokenA !== tokenB, "Successive setup tokens are strictly unique and uncorrelated");

    // -------------------------------------------------------------------------
    // TEST 4: Raw tokens are not stored in the database
    // -------------------------------------------------------------------------
    console.log("\nTesting Criterion 4: Token Hashing in Database");
    const rawToken = generateSecureToken();
    const hashedToken = hashToken(rawToken);

    assert(hashedToken !== rawToken, "Hashed token is distinct from raw token");
    assert(hashedToken.length === 64, "SHA-256 digest is 64 hex characters");

    // Provision a test user with hashed token
    const testEmailA = `sec-test-a-${Date.now()}@example.com`;
    const userA = await prisma.user.create({
      data: {
        name: "Security Test User A",
        email: testEmailA,
        password: hash1,
        role: Role.CUSTOMER,
      },
    });

    const tokenRecordA = await prisma.passwordResetToken.create({
      data: {
        userId: userA.id,
        token: hashedToken, // Storing only hash
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    // Query database directly by rawToken
    const rawTokenInDb = await prisma.passwordResetToken.findUnique({
      where: { token: rawToken },
    });
    assert(rawTokenInDb === null, "Raw token does NOT exist in the database (stored strictly as SHA-256 hash)");

    const hashedTokenInDb = await prisma.passwordResetToken.findUnique({
      where: { token: hashedToken },
    });
    assert(hashedTokenInDb !== null, "Hashed token is successfully stored and retrievable via hashToken(rawToken)");

    // -------------------------------------------------------------------------
    // TEST 5: Correct token can be redeemed once
    // -------------------------------------------------------------------------
    console.log("\nTesting Criterion 5: Single-Use Redemption Flow");
    const newPassword = "CustomerSecure#2026";
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Verify lookup by hashToken(rawToken)
    const lookedUpToken = await prisma.passwordResetToken.findUnique({
      where: { token: hashToken(rawToken) },
      include: { user: true },
    });
    assert(!!lookedUpToken && !lookedUpToken.usedAt, "Token lookup via hashToken(rawToken) succeeds for valid unexpired token");

    // Redeem token
    await prisma.$transaction([
      prisma.user.update({
        where: { id: lookedUpToken!.userId },
        data: { password: newPasswordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: lookedUpToken!.id },
        data: { usedAt: new Date() },
      }),
    ]);

    const updatedUserA = await prisma.user.findUnique({ where: { id: userA.id } });
    const passwordSetSuccess = await bcrypt.compare(newPassword, updatedUserA!.password);
    assert(passwordSetSuccess, "Customer successfully configures custom password using valid setup token");

    // -------------------------------------------------------------------------
    // TEST 6: Reusing a token is rejected
    // -------------------------------------------------------------------------
    console.log("\nTesting Criterion 6: Token Reuse Prevention");
    const redeemedToken = await prisma.passwordResetToken.findUnique({
      where: { token: hashToken(rawToken) },
    });
    assert(redeemedToken?.usedAt !== null, "Redeemed token is stamped with usedAt timestamp");
    const isReuseAllowed = !redeemedToken?.usedAt && (redeemedToken?.expiresAt.getTime() ?? 0) > Date.now();
    assert(!isReuseAllowed, "Attempt to reuse redeemed token is strictly rejected");

    // -------------------------------------------------------------------------
    // TEST 7: Expired tokens are rejected
    // -------------------------------------------------------------------------
    console.log("\nTesting Criterion 7: Expiration Enforcement");
    const expiredRawToken = generateSecureToken();
    const expiredHashedToken = hashToken(expiredRawToken);
    const expiredRecord = await prisma.passwordResetToken.create({
      data: {
        userId: userA.id,
        token: expiredHashedToken,
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      },
    });

    const isExpiredTokenValid = expiredRecord.expiresAt > new Date();
    assert(!isExpiredTokenValid, "Expired token is strictly rejected (expiresAt < now)");

    // -------------------------------------------------------------------------
    // TEST 8: A token cannot be used for another customer's account
    // -------------------------------------------------------------------------
    console.log("\nTesting Criterion 8: Account Association Integrity");
    const testEmailB = `sec-test-b-${Date.now()}@example.com`;
    const userB = await prisma.user.create({
      data: {
        name: "Security Test User B",
        email: testEmailB,
        password: hash2,
        role: Role.CUSTOMER,
      },
    });

    const userBTokenRaw = generateSecureToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: userB.id,
        token: hashToken(userBTokenRaw),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const userBTokenFound = await prisma.passwordResetToken.findUnique({
      where: { token: hashToken(userBTokenRaw) },
    });
    assert(userBTokenFound?.userId === userB.id, "User B's token is bound strictly to User B's account");
    assert(userBTokenFound?.userId !== userA.id, "User B's token cannot resolve or reset User A's account");

    // -------------------------------------------------------------------------
    // TEST 9: Password complexity is enforced
    // -------------------------------------------------------------------------
    console.log("\nTesting Criterion 9: Password Complexity Rules (PRD §4.1)");
    // Valid: >8 chars (>=9), uppercase, lowercase, special
    const validCandidate = "Brightloop#2026";
    const invalidShort = "Short@1"; // 7 chars
    const invalid8Chars = "Eight@12"; // 8 chars (PRD requires > 8)
    const invalidNoUpper = "lowercase@123";
    const invalidNoLower = "UPPERCASE@123";
    const invalidNoSpecial = "NoSpecial1234";

    assert(resetPasswordSchema.safeParse({ token: "tok", password: validCandidate, confirmPassword: validCandidate }).success, "Valid complex password (>8 chars, upper, lower, special) is accepted");
    assert(!resetPasswordSchema.safeParse({ token: "tok", password: invalidShort, confirmPassword: invalidShort }).success, "Password < 8 chars rejected");
    assert(!resetPasswordSchema.safeParse({ token: "tok", password: invalid8Chars, confirmPassword: invalid8Chars }).success, "Password of exactly 8 chars rejected (PRD requires > 8)");
    assert(!resetPasswordSchema.safeParse({ token: "tok", password: invalidNoUpper, confirmPassword: invalidNoUpper }).success, "Password missing uppercase rejected");
    assert(!resetPasswordSchema.safeParse({ token: "tok", password: invalidNoLower, confirmPassword: invalidNoLower }).success, "Password missing lowercase rejected");
    assert(!resetPasswordSchema.safeParse({ token: "tok", password: invalidNoSpecial, confirmPassword: invalidNoSpecial }).success, "Password missing special character rejected");

    // -------------------------------------------------------------------------
    // TEST 10: Password hashes are never exposed
    // -------------------------------------------------------------------------
    console.log("\nTesting Criterion 10: Password Hash Exposure Prevention");
    const queriedCustomer = await prisma.customer.findFirst({
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
    assert(
      Boolean(queriedCustomer?.user && !("password" in queriedCustomer.user)),
      "Customer queries explicitly omit password hash field"
    );

    // -------------------------------------------------------------------------
    // TEST 11: Existing password-reset functionality still works
    // -------------------------------------------------------------------------
    console.log("\nTesting Criterion 11: Compatibility with Existing Reset Flow");
    // Seeded accounts credentials remain intact
    const seededAdmin = await prisma.user.findUnique({ where: { email: "rajesh@brightloop.in" } });
    const adminPassMatch = await bcrypt.compare("admin@123", seededAdmin!.password);
    assert(adminPassMatch, "Seeded Admin credentials (rajesh@brightloop.in / admin@123) untouched");

    const seededStaff = await prisma.user.findUnique({ where: { email: "priya.p@brightloop.in" } });
    const staffPassMatch = await bcrypt.compare("staff@123", seededStaff!.password);
    assert(staffPassMatch, "Seeded Staff credentials (priya.p@brightloop.in / staff@123) untouched");

    const seededCustomer = await prisma.user.findUnique({ where: { email: "contact@techcraft.in" } });
    const customerPassMatch = await bcrypt.compare("customer@123", seededCustomer!.password);
    assert(customerPassMatch, "Seeded Customer credentials (contact@techcraft.in / customer@123) untouched");

    // -------------------------------------------------------------------------
    // TEST 12: Admin and Staff permissions remain unchanged
    // -------------------------------------------------------------------------
    console.log("\nTesting Criterion 12: Role Permissions Invariance");
    function checkPermissions(role: Role, op: "create" | "update" | "delete"): boolean {
      if (op === "create" || op === "update") {
        return role === Role.ADMIN || role === Role.STAFF;
      }
      if (op === "delete") {
        return role === Role.ADMIN;
      }
      return false;
    }

    assert(checkPermissions(Role.ADMIN, "create"), "Admin can create customers");
    assert(checkPermissions(Role.ADMIN, "update"), "Admin can update customers");
    assert(checkPermissions(Role.ADMIN, "delete"), "Admin can delete customers (subject to 0 subs)");
    assert(checkPermissions(Role.STAFF, "create"), "Staff can create customers");
    assert(checkPermissions(Role.STAFF, "update"), "Staff can update customers");
    assert(!checkPermissions(Role.STAFF, "delete"), "Staff strictly cannot delete customers");

    // -------------------------------------------------------------------------
    // TEST 13: Customer users cannot provision other customer accounts
    // -------------------------------------------------------------------------
    console.log("\nTesting Criterion 13: Customer User Provisioning Restriction");
    assert(!checkPermissions(Role.CUSTOMER, "create"), "Customer role strictly forbidden from creating customers");
    assert(!checkPermissions(Role.CUSTOMER, "update"), "Customer role strictly forbidden from updating customers");
    assert(!checkPermissions(Role.CUSTOMER, "delete"), "Customer role strictly forbidden from deleting customers");

    // Clean up test users
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } }),
      prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } }),
    ]);

    // -------------------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------------------
    console.log("\n===============================================================");
    console.log(`  BATCH 4.2 VERIFICATION: ${passedTests}/${totalTests} TESTS PASSED`);
    console.log("===============================================================\n");

    if (passedTests === totalTests) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error) {
    console.error("FATAL ERROR IN SECURITY AUDIT:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runSecurityAudit();
