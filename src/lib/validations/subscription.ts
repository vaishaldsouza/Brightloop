import { z } from "zod";
import { SubscriptionStatus, PaymentTerms, BillingPeriod } from "@prisma/client";

export const PERMITTED_SUBSCRIPTION_STATUSES = [
  SubscriptionStatus.DRAFT,
  SubscriptionStatus.QUOTATION,
  SubscriptionStatus.CONFIRMED,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.CLOSED,
] as const;

export const subscriptionLineSchema = z.object({
  id: z.string().optional(),
  productVariantId: z
    .string()
    .trim()
    .min(1, "Product variant is required for order lines"),
  description: z.string().trim().max(255).optional().nullable(),
  quantity: z
    .number({ invalid_type_error: "Quantity must be a valid number" })
    .int("Quantity must be an integer")
    .min(1, "Quantity must be at least 1"),
  unitPricePaise: z
    .number({ invalid_type_error: "Unit price must be a valid number" })
    .int("Unit price must be an integer in paise")
    .min(0, "Unit price cannot be negative"),
  sortOrder: z.number().int().default(0),
});

export const createSubscriptionFromTemplateSchema = z.object({
  templateId: z
    .string()
    .trim()
    .min(1, "Quotation template selection is required"),
  customerId: z
    .string()
    .trim()
    .min(1, "Customer selection is required"),
  startDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "Please provide a valid start date",
    }),
  paymentTerms: z.nativeEnum(PaymentTerms, {
    errorMap: () => ({
      message: "Payment terms must be DUE_ON_RECEIPT, NET_15, or NET_30",
    }),
  }),
  notes: z.string().trim().max(1000).optional().nullable(),
  lines: z
    .array(subscriptionLineSchema)
    .min(1, "At least one order line is required in a subscription"),
});

export type SubscriptionLineInput = z.infer<typeof subscriptionLineSchema>;
export type CreateSubscriptionFromTemplateInput = z.infer<
  typeof createSubscriptionFromTemplateSchema
>;

/**
 * Validates whether a quotation has passed its expiration date.
 */
export function isQuotationExpired(
  status: SubscriptionStatus,
  quotationExpiryDate?: Date | string | null,
  now: Date = new Date()
): boolean {
  if (status !== SubscriptionStatus.QUOTATION || !quotationExpiryDate) {
    return false;
  }
  const expiryTime = new Date(quotationExpiryDate).getTime();
  return expiryTime < now.getTime();
}

/**
 * Computes derived operational tags (e.g. PAUSED, EXPIRED) without altering database status.
 */
export function getSubscriptionDerivedTags(
  status: SubscriptionStatus,
  isPaused: boolean,
  quotationExpiryDate?: Date | string | null,
  now: Date = new Date()
): string[] {
  const tags: string[] = [];

  if (isPaused) {
    tags.push("PAUSED");
  }

  if (isQuotationExpired(status, quotationExpiryDate, now)) {
    tags.push("EXPIRED");
  }

  return tags;
}
