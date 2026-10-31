"use server";

import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Role, DiscountType, DiscountScope } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { discountSchema, DiscountFormInput } from "@/lib/validations/discount";

export interface DiscountActionResult {
  success: boolean;
  discountId?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Creates a new discount rule (PRD §4.8).
 * Allowed for ADMIN only (Internal staff and customers strictly blocked).
 */
export async function createDiscountAction(
  input: DiscountFormInput
): Promise<DiscountActionResult> {
  const session = await auth();

  if (!session?.user || session.user.role !== Role.ADMIN) {
    return {
      success: false,
      error: "Unauthorized: Only Administrators can configure discounts.",
    };
  }

  const parsed = discountSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.errors.forEach((err) => {
      const field = err.path.join(".");
      fieldErrors[field] = err.message;
    });
    return {
      success: false,
      error: "Validation failed. Please review the form inputs.",
      fieldErrors,
    };
  }

  const {
    code,
    description,
    discountType,
    scope,
    value,
    minQuantity,
    minPurchaseRupees,
    productId,
    maxUses,
    startDate,
    expiresAt,
    isActive,
  } = parsed.data;

  // Convert value:
  // If PERCENTAGE: convert percentage (e.g. 10%) to basis points (1000)
  // If FIXED: convert rupees to paise
  const storedValue =
    discountType === DiscountType.PERCENTAGE
      ? Math.round(value * 100)
      : Math.round(value * 100);

  const minPurchasePaise = minPurchaseRupees
    ? Math.round(minPurchaseRupees * 100)
    : null;

  try {
    const existing = await prisma.discount.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (existing) {
      return {
        success: false,
        error: `Discount code "${code}" already exists. Please choose a unique code.`,
      };
    }

    const discount = await prisma.$transaction(async (tx) => {
      const created = await tx.discount.create({
        data: {
          code: code.toUpperCase(),
          description,
          discountType,
          scope,
          value: storedValue,
          minQuantity,
          minPurchasePaise,
          productId: scope === DiscountScope.LINE_ITEM ? productId : null,
          maxUses: maxUses || null,
          usedCount: 0,
          startDate: startDate || null,
          expiresAt: expiresAt || null,
          isActive,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "discount.created",
          entityType: "Discount",
          entityId: created.id,
          meta: {
            code: created.code,
            discountType,
            value: storedValue,
            scope,
          },
        },
      });

      return created;
    });

    revalidatePath("/discounts");
    return { success: true, discountId: discount.id };
  } catch (error) {
    console.error("Failed to create discount:", error);
    return {
      success: false,
      error: "An internal error occurred while creating the discount.",
    };
  }
}

/**
 * Updates an existing discount rule.
 * Allowed for ADMIN only.
 */
export async function updateDiscountAction(
  id: string,
  input: DiscountFormInput
): Promise<DiscountActionResult> {
  const session = await auth();

  if (!session?.user || session.user.role !== Role.ADMIN) {
    return {
      success: false,
      error: "Unauthorized: Only Administrators can edit discounts.",
    };
  }

  const parsed = discountSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    parsed.error.errors.forEach((err) => {
      const field = err.path.join(".");
      fieldErrors[field] = err.message;
    });
    return {
      success: false,
      error: "Validation failed. Please review the form inputs.",
      fieldErrors,
    };
  }

  const {
    code,
    description,
    discountType,
    scope,
    value,
    minQuantity,
    minPurchaseRupees,
    productId,
    maxUses,
    startDate,
    expiresAt,
    isActive,
  } = parsed.data;

  const storedValue =
    discountType === DiscountType.PERCENTAGE
      ? Math.round(value * 100)
      : Math.round(value * 100);

  const minPurchasePaise = minPurchaseRupees
    ? Math.round(minPurchaseRupees * 100)
    : null;

  try {
    const existing = await prisma.discount.findUnique({ where: { id } });
    if (!existing) {
      return { success: false, error: "Discount not found." };
    }

    if (existing.code !== code.toUpperCase()) {
      const collision = await prisma.discount.findUnique({
        where: { code: code.toUpperCase() },
      });
      if (collision) {
        return {
          success: false,
          error: `Discount code "${code}" already exists.`,
        };
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.discount.update({
        where: { id },
        data: {
          code: code.toUpperCase(),
          description,
          discountType,
          scope,
          value: storedValue,
          minQuantity,
          minPurchasePaise,
          productId: scope === DiscountScope.LINE_ITEM ? productId : null,
          maxUses: maxUses || null,
          startDate: startDate || null,
          expiresAt: expiresAt || null,
          isActive,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "discount.updated",
          entityType: "Discount",
          entityId: id,
          meta: {
            code,
            discountType,
            value: storedValue,
          },
        },
      });
    });

    revalidatePath("/discounts");
    return { success: true, discountId: id };
  } catch (error) {
    console.error("Failed to update discount:", error);
    return {
      success: false,
      error: "An internal error occurred while updating the discount.",
    };
  }
}

/**
 * Toggles a discount rule active/inactive state.
 * Allowed for ADMIN only.
 */
export async function toggleDiscountActiveAction(
  id: string
): Promise<DiscountActionResult> {
  const session = await auth();

  if (!session?.user || session.user.role !== Role.ADMIN) {
    return {
      success: false,
      error: "Unauthorized: Only Administrators can toggle discounts.",
    };
  }

  try {
    const discount = await prisma.discount.findUnique({ where: { id } });
    if (!discount) {
      return { success: false, error: "Discount not found." };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.discount.update({
        where: { id },
        data: { isActive: !discount.isActive },
      });

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: res.isActive ? "discount.activated" : "discount.deactivated",
          entityType: "Discount",
          entityId: id,
          meta: { code: res.code, isActive: res.isActive },
        },
      });

      return res;
    });

    revalidatePath("/discounts");
    return { success: true, discountId: id };
  } catch (error) {
    console.error("Failed to toggle discount state:", error);
    return {
      success: false,
      error: "An internal error occurred while updating discount status.",
    };
  }
}

/**
 * Deletes a discount rule.
 * If historical usage exists, prevents deletion to preserve referential integrity.
 * Allowed for ADMIN only.
 */
export async function deleteDiscountAction(
  id: string
): Promise<DiscountActionResult> {
  const session = await auth();

  if (!session?.user || session.user.role !== Role.ADMIN) {
    return {
      success: false,
      error: "Unauthorized: Only Administrators can delete discounts.",
    };
  }

  try {
    const usagesCount = await prisma.discountUsage.count({
      where: { discountId: id },
    });

    if (usagesCount > 0) {
      return {
        success: false,
        error: `Cannot delete discount with ${usagesCount} recorded usage history. You can deactivate it instead to prevent new usages while preserving historical financial records.`,
      };
    }

    const invoiceCount = await prisma.invoice.count({
      where: { discountId: id },
    });

    if (invoiceCount > 0) {
      return {
        success: false,
        error: `Cannot delete discount referenced by existing invoices. Deactivate the discount instead.`,
      };
    }

    await prisma.$transaction(async (tx) => {
      const deleted = await tx.discount.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: "discount.deleted",
          entityType: "Discount",
          entityId: id,
          meta: { code: deleted.code },
        },
      });
    });

    revalidatePath("/discounts");
    return { success: true };
  } catch (error) {
    console.error("Failed to delete discount:", error);
    return {
      success: false,
      error: "An internal error occurred while deleting the discount.",
    };
  }
}
