/// <reference path="../../types/next-auth.d.ts" />
"use server";

import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { Role } from "@prisma/client";
import { productSchema, ProductFormValues } from "@/lib/validations/product";
import { revalidatePath } from "next/cache";

export interface ProductActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  productId?: string;
}

export async function createProductAction(
  data: ProductFormValues
): Promise<ProductActionResult> {
  const session = await auth();

  // Strict RBAC: Only Admin can create products (PRD §4.2, Staff is read-only)
  if (!session?.user || session.user.role !== Role.ADMIN) {
    return {
      success: false,
      error: "Unauthorized: Only Administrators have permission to create products.",
    };
  }

  const validation = productSchema.safeParse(data);
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

  const { name, type, description, notes, salesPricePaise, costPricePaise, variants } =
    validation.data;

  try {
    const newProduct = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          name,
          type,
          description: description || null,
          notes: notes || null,
          salesPricePaise,
          costPricePaise: costPricePaise ?? null,
        },
      });

      if (variants && variants.length > 0) {
        await tx.productVariant.createMany({
          data: variants.map((v) => ({
            productId: product.id,
            name: v.name || `${v.attributeName}: ${v.attributeValue}`,
            attributeName: v.attributeName,
            attributeValue: v.attributeValue,
            description: v.description || null,
            priceExtraPaise: v.priceExtraPaise,
          })),
        });
      }

      return product;
    });

    revalidatePath("/products");
    revalidatePath("/dashboard");

    return {
      success: true,
      productId: newProduct.id,
    };
  } catch (err: unknown) {
    console.error("Error creating product:", err);
    return {
      success: false,
      error: "Database error occurred while creating product. Please try again.",
    };
  }
}

export async function updateProductAction(
  id: string,
  data: ProductFormValues
): Promise<ProductActionResult> {
  const session = await auth();

  // Strict RBAC: Only Admin can edit products
  if (!session?.user || session.user.role !== Role.ADMIN) {
    return {
      success: false,
      error: "Unauthorized: Only Administrators have permission to modify products.",
    };
  }

  const validation = productSchema.safeParse(data);
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

  const { name, type, description, notes, salesPricePaise, costPricePaise, variants } =
    validation.data;

  const existingProduct = await prisma.product.findUnique({
    where: { id },
    include: {
      variants: {
        include: {
          subscriptionLines: { select: { id: true } },
          invoiceLines: { select: { id: true } },
          quotationTemplateLines: { select: { id: true } },
        },
      },
    },
  });

  if (!existingProduct) {
    return {
      success: false,
      error: "Product not found.",
    };
  }

  // Check if any existing variant being removed has historical references
  const submittedVariantIds = new Set(variants.map((v) => v.id).filter(Boolean));
  for (const existingVar of existingProduct.variants) {
    if (!submittedVariantIds.has(existingVar.id)) {
      const totalRefs =
        existingVar.subscriptionLines.length +
        existingVar.invoiceLines.length +
        existingVar.quotationTemplateLines.length;

      if (totalRefs > 0) {
        return {
          success: false,
          error: `Cannot remove variant '${existingVar.name}': It is referenced by ${totalRefs} contract or invoice line(s). Referenced variants cannot be deleted.`,
        };
      }
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Update primary product data
      await tx.product.update({
        where: { id },
        data: {
          name,
          type,
          description: description || null,
          notes: notes || null,
          salesPricePaise,
          costPricePaise: costPricePaise ?? null,
        },
      });

      // 2. Delete unreferenced variants that were removed
      const removedVariantIds = existingProduct.variants
        .filter((v) => !submittedVariantIds.has(v.id))
        .map((v) => v.id);

      if (removedVariantIds.length > 0) {
        await tx.productVariant.deleteMany({
          where: { id: { in: removedVariantIds } },
        });
      }

      // 3. Upsert variants
      for (const v of variants) {
        const variantName = v.name || `${v.attributeName}: ${v.attributeValue}`;
        if (v.id) {
          await tx.productVariant.update({
            where: { id: v.id },
            data: {
              name: variantName,
              attributeName: v.attributeName,
              attributeValue: v.attributeValue,
              description: v.description || null,
              priceExtraPaise: v.priceExtraPaise,
            },
          });
        } else {
          await tx.productVariant.create({
            data: {
              productId: id,
              name: variantName,
              attributeName: v.attributeName,
              attributeValue: v.attributeValue,
              description: v.description || null,
              priceExtraPaise: v.priceExtraPaise,
            },
          });
        }
      }
    });

    revalidatePath("/products");
    revalidatePath(`/products/${id}`);
    revalidatePath("/dashboard");

    return {
      success: true,
      productId: id,
    };
  } catch (err: unknown) {
    console.error("Error updating product:", err);
    return {
      success: false,
      error: "Database error occurred while updating product. Please try again.",
    };
  }
}

export async function deleteProductAction(id: string): Promise<ProductActionResult> {
  const session = await auth();

  // Strict RBAC: Only Admin can delete products
  if (!session?.user || session.user.role !== Role.ADMIN) {
    return {
      success: false,
      error: "Unauthorized: Only Administrators have permission to delete products.",
    };
  }

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      plans: { select: { id: true, name: true } },
      variants: {
        include: {
          subscriptionLines: { select: { id: true } },
          invoiceLines: { select: { id: true } },
          quotationTemplateLines: { select: { id: true } },
        },
      },
    },
  });

  if (!product) {
    return {
      success: false,
      error: "Product not found.",
    };
  }

  // Check relationship constraints
  const totalPlans = product.plans.length;
  const totalSubLines = product.variants.flatMap((v) => v.subscriptionLines).length;
  const totalInvoiceLines = product.variants.flatMap((v) => v.invoiceLines).length;
  const totalQuoteLines = product.variants.flatMap((v) => v.quotationTemplateLines).length;

  if (totalPlans > 0 || totalSubLines > 0 || totalInvoiceLines > 0 || totalQuoteLines > 0) {
    return {
      success: false,
      error: `Cannot delete product '${product.name}': It is referenced by ${totalPlans} plan(s), ${totalSubLines} subscription line(s), and ${totalInvoiceLines} invoice line(s). Products with business or financial history cannot be deleted.`,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.productVariant.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });
    });

    revalidatePath("/products");
    revalidatePath("/dashboard");

    return { success: true };
  } catch (err: unknown) {
    console.error("Error deleting product:", err);
    return {
      success: false,
      error: "Database error occurred while deleting product.",
    };
  }
}
