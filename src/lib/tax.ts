import { COMPANY_GST_STATE_CODE, isIntraState } from "@/lib/gstStates";

export const CGST_BPS = 900; // 9%
export const SGST_BPS = 900; // 9%
export const IGST_BPS = 1800; // 18%
export const BPS_DIVISOR = 10000;
export const HALF_BPS_DIVISOR = 5000;
export const ROUNDING_POLICY = "HALF_UP_INTEGER_PAISE" as const;

export interface LineTaxDetail {
  rateBps: number; // e.g. 1800
  cgstBps: number;
  sgstBps: number;
  igstBps: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxAmountPaise: number;
  subtotalPaise: number;
  totalPaise: number;
}

export interface TaxBreakdownEntry {
  taxName: string;
  rateBps: number;
  ratePercent: string;
  amountPaise: number;
}

export interface OrderTaxCalculation {
  isIntraState: boolean;
  regimeName: string; // "Intra-State GST (CGST 9% + SGST 9%)" or "Inter-State GST (IGST 18%)"
  subtotalPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  taxPaise: number;
  totalPaise: number;
  breakdown: TaxBreakdownEntry[];
}

/**
 * Computes integer half-up rounded basis-points calculation:
 * result = round(subtotalPaise * rateBps / 10,000)
 *
 * Integer-Safe Rounding Formula:
 * For non-negative integers: Math.floor((subtotalPaise * rateBps + 5000) / 10000)
 * - Remainder >= 5000 (0.5 paise) rounds up by adding 1 paise.
 * - Remainder < 5000 rounds down.
 * - Uses pure integer arithmetic; eliminates floating-point representation anomalies.
 */
export function calculateTaxPaiseInteger(subtotalPaise: number, rateBps: number): number {
  if (subtotalPaise <= 0 || rateBps <= 0) return 0;
  const safeSubtotal = Number.isInteger(subtotalPaise) ? subtotalPaise : Math.floor(subtotalPaise);
  const safeRate = Number.isInteger(rateBps) ? rateBps : Math.floor(rateBps);
  const numerator = safeSubtotal * safeRate;
  return Math.floor((numerator + HALF_BPS_DIVISOR) / BPS_DIVISOR);
}

/**
 * Calculates line-level GST for an item line given customer state code.
 * Per PRD §4.7: Intra-state (MH 27) = CGST 9% + SGST 9%, Inter-state = IGST 18%.
 * Pure integer arithmetic with half-up paise rounding.
 */
export function calculateLineTax(
  quantity: number,
  unitPricePaise: number,
  customerGstStateCode?: string | null
): LineTaxDetail {
  const safeQty = Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
  const safePrice = Number.isInteger(unitPricePaise) && unitPricePaise >= 0 ? unitPricePaise : 0;
  const subtotalPaise = safeQty * safePrice;

  const intra = isIntraState(customerGstStateCode);

  let cgstBps = 0;
  let sgstBps = 0;
  let igstBps = 0;
  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;

  if (intra) {
    cgstBps = CGST_BPS;
    sgstBps = SGST_BPS;
    cgstPaise = calculateTaxPaiseInteger(subtotalPaise, CGST_BPS);
    sgstPaise = calculateTaxPaiseInteger(subtotalPaise, SGST_BPS);
  } else {
    igstBps = IGST_BPS;
    igstPaise = calculateTaxPaiseInteger(subtotalPaise, IGST_BPS);
  }

  const taxAmountPaise = cgstPaise + sgstPaise + igstPaise;
  const totalPaise = subtotalPaise + taxAmountPaise;

  return {
    rateBps: cgstBps + sgstBps + igstBps,
    cgstBps,
    sgstBps,
    igstBps,
    cgstPaise,
    sgstPaise,
    igstPaise,
    taxAmountPaise,
    subtotalPaise,
    totalPaise,
  };
}

/**
 * Computes complete GST order calculation for a subscription or quotation given customer state code.
 * Line taxes reconcile identically with order total tax.
 */
export function calculateOrderTax(
  lines: Array<{ quantity: number; unitPricePaise: number }>,
  customerGstStateCode?: string | null
): OrderTaxCalculation {
  const intra = isIntraState(customerGstStateCode);

  let subtotalPaise = 0;
  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;

  for (const line of lines) {
    const lineRes = calculateLineTax(line.quantity, line.unitPricePaise, customerGstStateCode);
    subtotalPaise += lineRes.subtotalPaise;
    cgstPaise += lineRes.cgstPaise;
    sgstPaise += lineRes.sgstPaise;
    igstPaise += lineRes.igstPaise;
  }

  const taxPaise = cgstPaise + sgstPaise + igstPaise;
  const totalPaise = subtotalPaise + taxPaise;

  const breakdown: TaxBreakdownEntry[] = intra
    ? [
        {
          taxName: "CGST",
          rateBps: CGST_BPS,
          ratePercent: "9%",
          amountPaise: cgstPaise,
        },
        {
          taxName: "SGST",
          rateBps: SGST_BPS,
          ratePercent: "9%",
          amountPaise: sgstPaise,
        },
      ]
    : [
        {
          taxName: "IGST",
          rateBps: IGST_BPS,
          ratePercent: "18%",
          amountPaise: igstPaise,
        },
      ];

  return {
    isIntraState: intra,
    regimeName: intra
      ? "Intra-State GST (CGST 9% + SGST 9%)"
      : "Inter-State GST (IGST 18%)",
    subtotalPaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    taxPaise,
    totalPaise,
    breakdown,
  };
}
