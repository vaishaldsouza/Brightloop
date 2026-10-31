import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { hashToken } from "@/lib/tokens";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { token, password } = parsed.data;

    // Secure lookup: match cryptographic SHA-256 hash of token
    const hashed = hashToken(token);
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token: hashed },
      include: { user: true },
    });

    const now = new Date();

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < now) {
      return NextResponse.json(
        { error: "This password reset link is invalid or has expired" },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // Atomic conditional redemption & password update
    try {
      await prisma.$transaction(async (tx) => {
        // 1. Atomic conditional update: strictly consume only if usedAt is currently null and not expired
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

        // 2. Atomically update user's password in the exact same transaction
        await tx.user.update({
          where: { id: resetToken.userId },
          data: { password: hashedPassword },
        });
      });
    } catch (txErr: unknown) {
      const err = txErr as Error;
      if (err?.message === "TOKEN_ALREADY_USED_OR_EXPIRED") {
        return NextResponse.json(
          { error: "This password reset link is invalid or has expired" },
          { status: 400 }
        );
      }
      throw txErr;
    }

    return NextResponse.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      { error: "Failed to reset password" },
      { status: 500 }
    );
  }
}
