import { z } from "zod";

export const customerSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(2, "Company name must be at least 2 characters")
    .max(100, "Company name cannot exceed 100 characters"),
  contactName: z
    .string()
    .trim()
    .min(2, "Contact person name is required")
    .max(80, "Contact person name cannot exceed 80 characters"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please provide a valid email address"),
  phone: z
    .string()
    .max(20, "Phone number is too long")
    .optional()
    .nullable()
    .transform((val) => (val && val.trim() ? val.trim() : null)),
  gstState: z
    .string()
    .trim()
    .min(2, "Please select a state"),
  gstStateCode: z
    .string()
    .trim()
    .length(2, "State code must be 2 digits"),
  gstin: z
    .string()
    .optional()
    .nullable()
    .transform((val) => (val && val.trim() ? val.trim().toUpperCase() : null))
    .refine(
      (val) =>
        !val ||
        /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(val),
      {
        message:
          "GSTIN must be a valid 15-character Indian GST format (e.g. 27AADCT1234A1Z5)",
      }
    ),
  billingAddress: z
    .string()
    .max(300, "Billing address cannot exceed 300 characters")
    .optional()
    .nullable()
    .transform((val) => (val && val.trim() ? val.trim() : null)),
});

export type CustomerFormValues = z.infer<typeof customerSchema>;
