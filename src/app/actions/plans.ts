/// <reference path="../../types/next-auth.d.ts" />
"use server";

import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Role } from "@prisma/client";
import { planSchema, PlanFormValues } from "@/lib/validations/plan";
import { revalidatePath } from "next/cache";

export interface PlanActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  planId?: string;
}

export async function createPlanAction(
  data: PlanFormValues
): Promise<PlanActionResult> {
  const session = await auth();

  // Strict RBAC: Only Admin can create plans (PRD §3 & §4.3, Staff is read-only)
  if (!session?.user || session.user.role !== Role.ADMIN) {
    return {
      success: false,
      error: "Unauthorized: Only Administrators have permission to create subscription plans.",
    };
  }

  const validation = planSchema.safeParse(data);
  if (!validation.success) {
    const fieldErrors: Record<string, string> = {};
    validation.error.errors.forEach((err) => {
      const field = err.path.join(".");
      fieldErrors[field] = err.message;
    });
    return {
      success: false,
      error: "Please correct the errors in the form.",
      fieldErrors,
    };
  }

  const {
    productId,
    name,
    description,
    pricePaise,
    billingPeriod,
    paymentTerms,
    minQuantity,
    availableFrom,
    availableTo,
    isActive,
    autoClose,
    isClosableEarly,
    isPausable,
    isRenewable,
  } = validation.data;

  try {
    // Verify referenced product exists
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true },
    });

    if (!product) {
      return {
        success: false,
        error: "The selected product does not exist in the product catalog.",
        fieldErrors: { productId: "Selected product does not exist" },
      };
    }

    const newPlan = await prisma.plan.create({
      data: {
        productId,
        name,
        description: description || null,
        pricePaise,
        billingPeriod,
        paymentTerms,
        minQuantity,
        availableFrom: availableFrom ? new Date(availableFrom) : null,
        availableTo: availableTo ? new Date(availableTo) : null,
        isActive,
        autoClose,
        isClosableEarly,
        isPausable,
        isRenewable,
      },
    });

    revalidatePath("/plans");
    revalidatePath("/dashboard");

    return {
      success: true,
      planId: newPlan.id,
    };
  } catch (err: unknown) {
    console.error("Error creating plan:", err);
    return {
      success: false,
      error: "Database error occurred while creating plan. Please try again.",
    };
  }
}

export async function updatePlanAction(
  id: string,
  data: PlanFormValues
): Promise<PlanActionResult> {
  const session = await auth();

  // Strict RBAC: Only Admin can edit plans
  if (!session?.user || session.user.role !== Role.ADMIN) {
    return {
      success: false,
      error: "Unauthorized: Only Administrators have permission to modify subscription plans.",
    };
  }

  const validation = planSchema.safeParse(data);
  if (!validation.success) {
    const fieldErrors: Record<string, string> = {};
    validation.error.errors.forEach((err) => {
      const field = err.path.join(".");
      fieldErrors[field] = err.message;
    });
    return {
      success: false,
      error: "Please correct the errors in the form.",
      fieldErrors,
    };
  }

  const existingPlan = await prisma.plan.findUnique({
    where: { id },
    include: {
      subscriptions: { select: { id: true } },
    },
  });

  if (!existingPlan) {
    return {
      success: false,
      error: "Plan not found.",
    };
  }

  const {
    productId,
    name,
    description,
    pricePaise,
    billingPeriod,
    paymentTerms,
    minQuantity,
    availableFrom,
    availableTo,
    isActive,
    autoClose,
    isClosableEarly,
    isPausable,
    isRenewable,
  } = validation.data;

  try {
    // Verify referenced product exists
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!product) {
      return {
        success: false,
        error: "The selected product does not exist in the product catalog.",
        fieldErrors: { productId: "Selected product does not exist" },
      };
    }

    await prisma.plan.update({
      where: { id },
      data: {
        productId,
        name,
        description: description || null,
        pricePaise,
        billingPeriod,
        paymentTerms,
        minQuantity,
        availableFrom: availableFrom ? new Date(availableFrom) : null,
        availableTo: availableTo ? new Date(availableTo) : null,
        isActive,
        autoClose,
        isClosableEarly,
        isPausable,
        isRenewable,
      },
    });

    revalidatePath("/plans");
    revalidatePath(`/plans/${id}`);
    revalidatePath("/dashboard");

    return {
      success: true,
      planId: id,
    };
  } catch (err: unknown) {
    console.error("Error updating plan:", err);
    return {
      success: false,
      error: "Database error occurred while updating plan. Please try again.",
    };
  }
}

export async function deletePlanAction(id: string): Promise<PlanActionResult> {
  const session = await auth();

  // Strict RBAC: Only Admin can delete plans
  if (!session?.user || session.user.role !== Role.ADMIN) {
    return {
      success: false,
      error: "Unauthorized: Only Administrators have permission to delete subscription plans.",
    };
  }

  const plan = await prisma.plan.findUnique({
    where: { id },
    include: {
      subscriptions: { select: { id: true, number: true } },
      quotationTemplates: { select: { id: true, name: true } },
    },
  });

  if (!plan) {
    return {
      success: false,
      error: "Plan not found.",
    };
  }

  // Referential Integrity: A plan referenced by subscriptions or quotation templates must not be deleted
  const totalSubs = plan.subscriptions.length;
  const totalTemplates = plan.quotationTemplates.length;

  if (totalSubs > 0 || totalTemplates > 0) {
    return {
      success: false,
      error: `Cannot delete plan '${plan.name}': It is referenced by ${totalSubs} subscription(s) and ${totalTemplates} quotation template(s). Plans with business history or contract references cannot be deleted.`,
    };
  }

  try {
    await prisma.plan.delete({
      where: { id },
    });

    revalidatePath("/plans");
    revalidatePath("/dashboard");

    return { success: true };
  } catch (err: unknown) {
    console.error("Error deleting plan:", err);
    return {
      success: false,
      error: "Database error occurred while deleting plan.",
    };
  }
}
