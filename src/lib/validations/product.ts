import { z } from "zod";

export const PRODUCT_TYPES = [
  "Recurring Service",
  "Digital License",
  "Consumable",
  "Hardware",
  "Software",
] as const;

export type ProductType = (typeof PRODUCT_TYPES)[number];

export const productVariantSchema = z.object({
  id: z.string().optional(),
  attributeName: z
    .string()
    .trim()
    .min(1, "Attribute name is required (e.g. 'Brand', 'Storage Tier')")
    .max(50, "Attribute name is too long"),
  attributeValue: z
    .string()
    .trim()
    .min(1, "Attribute value is required (e.g. 'Odoo', '500 GB NVMe')")
    .max(100, "Attribute value is too long"),
  name: z.string().optional(),
  description: z.string().optional().nullable(),
  priceExtraPaise: z
    .number({ invalid_type_error: "Price extra must be a valid number" })
    .int("Price extra must be an integer (in paise)")
    .min(0, "Price extra cannot be negative"),
});

export const productSchema = z
  .object({
    id: z.string().optional(),
    name: z
      .string()
      .trim()
      .min(2, "Product name must be at least 2 characters")
      .max(100, "Product name cannot exceed 100 characters"),
    type: z.enum(PRODUCT_TYPES, {
      errorMap: () => ({
        message: `Product type must be one of: ${PRODUCT_TYPES.join(", ")}`,
      }),
    }),
    description: z.string().trim().max(500, "Description is too long").optional().nullable(),
    notes: z.string().trim().max(1000, "Notes cannot exceed 1000 characters").optional().nullable(),
    salesPricePaise: z
      .number({ invalid_type_error: "Sales price must be a valid number" })
      .int("Sales price must be an integer (in paise)")
      .min(0, "Sales price cannot be negative"),
    costPricePaise: z
      .number({ invalid_type_error: "Cost price must be a valid number" })
      .int("Cost price must be an integer (in paise)")
      .min(0, "Cost price cannot be negative")
      .optional()
      .nullable(),
    variants: z.array(productVariantSchema).default([]),
  })
  .superRefine((data, ctx) => {
    // Check for duplicate variant attribute combinations (same attributeName + attributeValue)
    const seen = new Set<string>();
    data.variants.forEach((v, index) => {
      const key = `${v.attributeName.toLowerCase()}:::${v.attributeValue.toLowerCase()}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate variant: '${v.attributeName}: ${v.attributeValue}' is defined more than once.`,
          path: ["variants", index, "attributeValue"],
        });
      }
      seen.add(key);
    });
  });

export type ProductFormValues = z.infer<typeof productSchema>;
export type ProductVariantFormValues = z.infer<typeof productVariantSchema>;
