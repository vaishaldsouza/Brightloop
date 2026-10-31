/// <reference path="../../types/next-auth.d.ts" />
"use server";

import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Role, Prisma } from "@prisma/client";
import {
  quotationTemplateSchema,
  QuotationTemplateFormValues,
} from "@/lib/validations/quotationTemplate";
import { revalidatePath } from "next/cache";

export interface QuotationTemplateActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  templateId?: string;
}

/**
 * Creates a new Quotation Template with itemized product lines.
 * Permitted for ADMIN and STAFF roles (PRD §3: Staff manages day-to-day quotations & proposals).
 */
export async function createQuotationTemplateAction(
  data: QuotationTemplateFormValues
): Promise<QuotationTemplateActionResult> {
  const session = await auth();

  if (
    !session?.user ||
    (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)
  ) {
    return {
      success: false,
      error: "Unauthorized: Only Staff and Administrators can configure quotation templates.",
    };
  }

  const validation = quotationTemplateSchema.safeParse(data);
  if (!validation.success) {
    const fieldErrors: Record<string, string> = {};
    validation.error.errors.forEach((err) => {
      const field = err.path.join(".");
      fieldErrors[field] = err.message;
    });
    return {
      success: false,
      error: "Please correct the errors in the quotation template form.",
      fieldErrors,
    };
  }

  const { name, planId, description, validityDays, isActive, lines } = validation.data;

  try {
    // 1. Verify associated plan exists
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
      select: { id: true, name: true, isActive: true },
    });

    if (!plan) {
      return {
        success: false,
        error: "The selected plan does not exist in the database.",
        fieldErrors: { planId: "Selected plan does not exist" },
      };
    }

    // 2. Verify all product variant IDs exist in the database
    const variantIds = lines.map((l) => l.productVariantId);
    const existingVariants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, name: true },
    });

    if (existingVariants.length !== variantIds.length) {
      const foundIds = new Set(existingVariants.map((v) => v.id));
      const missingId = variantIds.find((id) => !foundIds.has(id));
      return {
        success: false,
        error: `Product variant "${missingId}" does not exist in the catalog.`,
        fieldErrors: { lines: "One or more selected variants do not exist" },
      };
    }

    // 3. Atomically create template and lines
    const newTemplate = await prisma.$transaction(async (tx) => {
      return tx.quotationTemplate.create({
        data: {
          name,
          planId,
          description: description || null,
          validityDays,
          isActive,
          lines: {
            create: lines.map((line, index) => ({
              productVariantId: line.productVariantId,
              description: line.description || null,
              quantity: line.quantity,
              unitPricePaise: line.unitPricePaise,
              sortOrder: line.sortOrder ?? index + 1,
            })),
          },
        },
        include: {
          lines: true,
        },
      });
    });

    revalidatePath("/quotation-templates");
    revalidatePath("/dashboard");

    return {
      success: true,
      templateId: newTemplate.id,
    };
  } catch (error) {
    console.error("Failed to create quotation template:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while saving the quotation template.",
    };
  }
}

/**
 * Updates an existing Quotation Template and replaces its line items.
 * Permitted for ADMIN and STAFF roles.
 */
export async function updateQuotationTemplateAction(
  id: string,
  data: QuotationTemplateFormValues
): Promise<QuotationTemplateActionResult> {
  const session = await auth();

  if (
    !session?.user ||
    (session.user.role !== Role.ADMIN && session.user.role !== Role.STAFF)
  ) {
    return {
      success: false,
      error: "Unauthorized: Only Staff and Administrators can edit quotation templates.",
    };
  }

  const existing = await prisma.quotationTemplate.findUnique({
    where: { id },
  });

  if (!existing) {
    return {
      success: false,
      error: "Quotation template not found.",
    };
  }

  const validation = quotationTemplateSchema.safeParse(data);
  if (!validation.success) {
    const fieldErrors: Record<string, string> = {};
    validation.error.errors.forEach((err) => {
      const field = err.path.join(".");
      fieldErrors[field] = err.message;
    });
    return {
      success: false,
      error: "Please correct the errors in the quotation template form.",
      fieldErrors,
    };
  }

  const { name, planId, description, validityDays, isActive, lines } = validation.data;

  try {
    // 1. Verify associated plan exists
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
      select: { id: true },
    });

    if (!plan) {
      return {
        success: false,
        error: "The selected plan does not exist in the database.",
        fieldErrors: { planId: "Selected plan does not exist" },
      };
    }

    // 2. Verify all product variant IDs exist
    const variantIds = lines.map((l) => l.productVariantId);
    const existingVariants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true },
    });

    if (existingVariants.length !== variantIds.length) {
      return {
        success: false,
        error: "One or more selected product variants do not exist in the catalog.",
        fieldErrors: { lines: "One or more selected variants do not exist" },
      };
    }

    // 3. Atomically update template and replace lines
    await prisma.$transaction(async (tx) => {
      // Update template attributes
      await tx.quotationTemplate.update({
        where: { id },
        data: {
          name,
          planId,
          description: description || null,
          validityDays,
          isActive,
        },
      });

      // Remove existing template lines
      await tx.quotationTemplateLine.deleteMany({
        where: { quotationTemplateId: id },
      });

      // Insert updated lines
      await tx.quotationTemplateLine.createMany({
        data: lines.map((line, index) => ({
          quotationTemplateId: id,
          productVariantId: line.productVariantId,
          description: line.description || null,
          quantity: line.quantity,
          unitPricePaise: line.unitPricePaise,
          sortOrder: line.sortOrder ?? index + 1,
        })),
      });
    });

    revalidatePath("/quotation-templates");
    revalidatePath(`/quotation-templates/${id}`);
    revalidatePath("/dashboard");

    return {
      success: true,
      templateId: id,
    };
  } catch (error) {
    console.error("Failed to update quotation template:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while updating the quotation template.",
    };
  }
}

/**
 * Deletes a Quotation Template and its lines.
 * Strictly restricted to ADMIN role. Staff cannot delete templates.
 */
export async function deleteQuotationTemplateAction(
  id: string
): Promise<QuotationTemplateActionResult> {
  const session = await auth();

  // Strict RBAC: Only Admin can delete quotation templates
  if (!session?.user || session.user.role !== Role.ADMIN) {
    return {
      success: false,
      error: "Unauthorized: Only Administrators have permission to delete quotation templates.",
    };
  }

  const existing = await prisma.quotationTemplate.findUnique({
    where: { id },
    include: {
      lines: true,
    },
  });

  if (!existing) {
    return {
      success: false,
      error: "Quotation template not found.",
    };
  }

  try {
    // Delete the template (Prisma cascade deletes QuotationTemplateLine)
    await prisma.quotationTemplate.delete({
      where: { id },
    });

    revalidatePath("/quotation-templates");
    revalidatePath("/dashboard");

    return {
      success: true,
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return {
        success: false,
        error: "Quotation template not found or already deleted.",
      };
    }

    console.error("Failed to delete quotation template:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to delete quotation template due to a database constraint.",
    };
  }
}
