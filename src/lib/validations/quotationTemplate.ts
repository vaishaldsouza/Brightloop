import { z } from "zod";

export const DEFAULT_QUOTATION_VALIDITY_DAYS = 30;

export const quotationTemplateLineSchema = z.object({
  id: z.string().optional(),
  productVariantId: z
    .string()
    .trim()
    .min(1, "Please select a product variant for this line"),
  description: z
    .string()
    .trim()
    .max(255, "Line description cannot exceed 255 characters")
    .optional()
    .nullable(),
  quantity: z
    .number({ invalid_type_error: "Quantity must be a valid number" })
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1"),
  unitPricePaise: z
    .number({ invalid_type_error: "Unit price must be a valid number" })
    .int("Unit price must be in paise (integer)")
    .min(0, "Unit price cannot be negative"),
  sortOrder: z.number().int().default(0),
});

export const quotationTemplateSchema = z
  .object({
    id: z.string().optional(),
    name: z
      .string()
      .trim()
      .min(2, "Template name must be at least 2 characters")
      .max(100, "Template name cannot exceed 100 characters"),
    planId: z
      .string()
      .trim()
      .min(1, "Please select an associated plan"),
    description: z
      .string()
      .trim()
      .max(500, "Description cannot exceed 500 characters")
      .optional()
      .nullable(),
    validityDays: z
      .number({ invalid_type_error: "Validity days must be a valid number" })
      .int("Validity days must be a whole number")
      .min(1, "Validity days must be at least 1 day")
      .max(365, "Validity days cannot exceed 365 days")
      .default(30),
    isActive: z.boolean().default(true),
    lines: z
      .array(quotationTemplateLineSchema)
      .min(1, "At least one product line is required in a quotation template"),
  })
  .refine(
    (data) => {
      // Disallow duplicate product variants within the same quotation template
      const variantIds = data.lines
        .map((l) => l.productVariantId?.trim())
        .filter(Boolean);
      return new Set(variantIds).size === variantIds.length;
    },
    {
      message:
        "Duplicate product variants are not permitted in template lines. Please combine quantities or select distinct variants.",
      path: ["lines"],
    }
  );

export type QuotationTemplateLineFormValues = z.infer<
  typeof quotationTemplateLineSchema
>;
export type QuotationTemplateFormValues = z.infer<typeof quotationTemplateSchema>;

/**
 * Calculates estimated subtotal in paise for quotation template lines
 */
export function calculateTemplateTotalPaise(
  lines: Array<{ quantity: number; unitPricePaise: number }>
): number {
  return lines.reduce((acc, line) => {
    const qty = Number.isInteger(line.quantity) && line.quantity > 0 ? line.quantity : 0;
    const price =
      Number.isInteger(line.unitPricePaise) && line.unitPricePaise >= 0
        ? line.unitPricePaise
        : 0;
    return acc + qty * price;
  }, 0);
}

/**
 * Calculates the exact expiration date for a quotation generated from a template.
 * Offsets calendar days cleanly using UTC timestamps to prevent timezone drift and off-by-one errors.
 */
export function calculateQuotationExpiryDate(
  validityDays: number,
  startDate: Date = new Date()
): Date {
  const safeDays =
    Number.isInteger(validityDays) && validityDays >= 1
      ? validityDays
      : DEFAULT_QUOTATION_VALIDITY_DAYS;

  const expiry = new Date(startDate.getTime());
  expiry.setUTCDate(expiry.getUTCDate() + safeDays);
  return expiry;
}

/**
 * Evaluates whether a quotation template is selectable for generating new quotations.
 * Inactive/archived templates cannot be selected for new proposals (PRD §4.4).
 */
export function isTemplateSelectable(template: { isActive: boolean }): boolean {
  return Boolean(template.isActive);
}
