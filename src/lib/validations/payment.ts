import { z } from "zod";
import { PaymentMethod } from "@prisma/client";

export const recordPaymentSchema = z.object({
  invoiceId: z.string().min(1, "Invoice ID is required"),
  amountPaise: z
    .number()
    .int("Amount must be a whole number of paise")
    .positive("Payment amount must be greater than zero"),
  paymentMethod: z.nativeEnum(PaymentMethod, {
    errorMap: () => ({ message: "Please select a valid payment method" }),
  }),
  paidAt: z.coerce.date().default(() => new Date()),
  reference: z
    .string()
    .trim()
    .max(100, "Reference must not exceed 100 characters")
    .optional()
    .nullable(),
  notes: z
    .string()
    .trim()
    .max(500, "Notes must not exceed 500 characters")
    .optional()
    .nullable(),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
