import { COMPANY_GST_STATE_CODE, isIntraState } from "@/lib/gstStates";

export interface LineTaxDetail {
  rateBps: number; // e.g. 1800
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
 * Calculates line-level GST for an item line given customer state code.
 * Per PRD §4.7: Intra-state (MH 27) = CGST 9% + SGST 9%, Inter-state = IGST 18%.
 * Uses pure integer arithmetic with Math.round on paise.
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

  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;

  if (intra) {
    cgstPaise = Math.round((subtotalPaise * 900) / 10000);
    sgstPaise = Math.round((subtotalPaise * 900) / 10000);
  } else {
    igstPaise = Math.round((subtotalPaise * 1800) / 10000);
  }

  const taxAmountPaise = cgstPaise + sgstPaise + igstPaise;
  const totalPaise = subtotalPaise + taxAmountPaise;

  return {
    rateBps: 1800,
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
          rateBps: 900,
          ratePercent: "9%",
          amountPaise: cgstPaise,
        },
        {
          taxName: "SGST",
          rateBps: 900,
          ratePercent: "9%",
          amountPaise: sgstPaise,
        },
      ]
    : [
        {
          taxName: "IGST",
          rateBps: 1800,
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
