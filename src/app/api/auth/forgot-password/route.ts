import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { generateSecureToken, hashToken } from "@/lib/tokens";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = forgotPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const { email } = parsed.data;
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      // Return 200 for security to avoid email enumeration
      return NextResponse.json({
        message: "If an account exists, a password reset link has been dispatched.",
      });
    }

    const rawToken = generateSecureToken();
    const hashedToken = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store only the SHA-256 hash in database; raw token is never persisted
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt,
      },
    });

    return NextResponse.json({
      message: "If an account exists, a password reset link has been dispatched.",
      resetUrl: process.env.NODE_ENV === "development" ? `/reset-password?token=${rawToken}` : undefined,
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
