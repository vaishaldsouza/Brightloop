import { z } from "zod";
import { DiscountType, DiscountScope } from "@prisma/client";

export const discountSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Code must be at least 2 characters")
    .max(50, "Code cannot exceed 50 characters")
    .toUpperCase(),
  description: z
    .string()
    .trim()
    .min(1, "Name/description is required")
    .max(255, "Description cannot exceed 255 characters"),
  discountType: z.nativeEnum(DiscountType),
  scope: z.nativeEnum(DiscountScope),
  // For PERCENTAGE: value in percentage points entered by user (e.g. 10 for 10%), converted to basis points (1000)
  // For FIXED: value in rupees entered by user, converted to paise
  value: z
    .number()
    .positive("Discount value must be greater than zero"),
  minQuantity: z
    .number()
    .int("Minimum quantity must be an integer")
    .min(1, "Minimum quantity must be at least 1")
    .default(1),
  minPurchaseRupees: z
    .number()
    .min(0, "Minimum purchase cannot be negative")
    .optional()
    .nullable(),
  productId: z.string().optional().nullable(),
  maxUses: z
    .number()
    .int("Max uses must be an integer")
    .positive("Max uses must be positive")
    .optional()
    .nullable(),
  startDate: z.coerce.date().optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
  isActive: z.boolean().default(true),
}).refine(
  (data) => {
    if (data.startDate && data.expiresAt) {
      return data.expiresAt >= data.startDate;
    }
    return true;
  },
  {
    message: "Expiry date cannot be earlier than start date",
    path: ["expiresAt"],
  }
).refine(
  (data) => {
    if (data.discountType === DiscountType.PERCENTAGE) {
      return data.value > 0 && data.value <= 100;
    }
    return true;
  },
  {
    message: "Percentage discount must be between 1% and 100%",
    path: ["value"],
  }
);

export type DiscountFormInput = z.infer<typeof discountSchema>;
