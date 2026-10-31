import { z } from "zod";
import { BillingPeriod, PaymentTerms } from "@prisma/client";

export const BILLING_PERIODS = [
  BillingPeriod.DAILY,
  BillingPeriod.WEEKLY,
  BillingPeriod.MONTHLY,
  BillingPeriod.YEARLY,
] as const;

export const PAYMENT_TERMS_LIST = [
  PaymentTerms.DUE_ON_RECEIPT,
  PaymentTerms.NET_15,
  PaymentTerms.NET_30,
] as const;

export const planSchema = z
  .object({
    id: z.string().optional(),
    productId: z
      .string()
      .trim()
      .min(1, "Please select an associated product"),
    name: z
      .string()
      .trim()
      .min(2, "Plan name must be at least 2 characters")
      .max(100, "Plan name cannot exceed 100 characters"),
    description: z
      .string()
      .trim()
      .max(500, "Description cannot exceed 500 characters")
      .optional()
      .nullable(),
    pricePaise: z
      .number({ invalid_type_error: "Plan price must be a valid number" })
      .int("Plan price must be an integer (in paise)")
      .min(0, "Plan price cannot be negative"),
    billingPeriod: z.nativeEnum(BillingPeriod, {
      errorMap: () => ({
        message: "Billing period must be one of: DAILY, WEEKLY, MONTHLY, YEARLY",
      }),
    }),
    paymentTerms: z
      .nativeEnum(PaymentTerms, {
        errorMap: () => ({
          message: "Payment terms must be one of: DUE_ON_RECEIPT, NET_15, NET_30",
        }),
      })
      .default(PaymentTerms.DUE_ON_RECEIPT),
    minQuantity: z
      .number({ invalid_type_error: "Minimum quantity must be a valid number" })
      .int("Minimum quantity must be an integer")
      .min(1, "Minimum quantity must be at least 1"),
    availableFrom: z.string().nullable().optional(),
    availableTo: z.string().nullable().optional(),
    isActive: z.boolean().default(true),
    autoClose: z.boolean().default(false),
    isClosableEarly: z.boolean().default(true),
    isPausable: z.boolean().default(false),
    isRenewable: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    // Validate availability date range if both are set
    if (data.availableFrom && data.availableTo) {
      const from = new Date(data.availableFrom).getTime();
      const to = new Date(data.availableTo).getTime();
      if (!isNaN(from) && !isNaN(to) && to < from) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Available To date cannot be earlier than Available From date",
          path: ["availableTo"],
        });
      }
    }
  });

export type PlanFormValues = z.infer<typeof planSchema>;

/**
 * Determines whether a plan is currently available for subscription creation
 * based on its active status and availability dates.
 */
export function isPlanAvailable(
  plan: {
    availableFrom?: Date | string | null;
    availableTo?: Date | string | null;
    isActive?: boolean;
  },
  now: Date = new Date()
): boolean {
  if (plan.isActive === false) return false;

  const current = now.getTime();

  if (plan.availableFrom) {
    const fromTime = new Date(plan.availableFrom).getTime();
    if (!isNaN(fromTime) && current < fromTime) {
      return false;
    }
  }

  if (plan.availableTo) {
    // Set to end of the day if date string or check exact time
    const toDate = new Date(plan.availableTo);
    const toTime = toDate.getTime();
    if (!isNaN(toTime) && current > toTime) {
      return false;
    }
  }

  return true;
}

export type PlanAvailabilityStatus = "ACTIVE" | "SCHEDULED" | "EXPIRED" | "ARCHIVED";

export function getPlanAvailabilityStatus(
  plan: {
    availableFrom?: Date | string | null;
    availableTo?: Date | string | null;
    isActive?: boolean;
  },
  now: Date = new Date()
): PlanAvailabilityStatus {
  if (plan.isActive === false) return "ARCHIVED";

  const current = now.getTime();

  if (plan.availableFrom) {
    const fromTime = new Date(plan.availableFrom).getTime();
    if (!isNaN(fromTime) && current < fromTime) {
      return "SCHEDULED";
    }
  }

  if (plan.availableTo) {
    const toTime = new Date(plan.availableTo).getTime();
    if (!isNaN(toTime) && current > toTime) {
      return "EXPIRED";
    }
  }

  return "ACTIVE";
}
