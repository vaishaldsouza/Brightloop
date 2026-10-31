/**
 * Currency utilities for Brightloop
 * Invariant: All financial numbers are stored in integer paise.
 * 1 INR = 100 paise.
 */

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/**
 * Format paise into Indian Rupee representation (e.g., ₹ 14,50,000.00)
 */
export function formatPaise(
  paise: number,
  options?: { showDecimals?: boolean }
): string {
  const rupees = paiseToRupees(paise);
  const showDecimals = options?.showDecimals ?? true;

  const formatter = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  });

  return formatter.format(rupees).replace("INR", "₹").trim();
}
