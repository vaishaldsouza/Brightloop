import { z } from "zod";

export const passwordComplexitySchema = z
  .string()
  .min(9, "Password must be longer than 8 characters (at least 9 characters)")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

export const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: passwordComplexitySchema,
  companyName: z.string().min(2, "Company name must be at least 2 characters"),
  phone: z.string().optional(),
  gstin: z
    .string()
    .regex(
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
      "Invalid GSTIN format (e.g. 27AADCT1234A1Z5)"
    )
    .optional()
    .or(z.literal("")),
  gstState: z.string().optional(),
  gstStateCode: z.string().optional(),
  billingAddress: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: passwordComplexitySchema,
});
