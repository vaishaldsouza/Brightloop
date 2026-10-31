import React from "react";
import { formatPaise } from "@/lib/currency";

interface MoneyTextProps {
  amountPaise?: number;
  paise?: number;
  className?: string;
  showDecimals?: boolean;
}

export function MoneyText({
  amountPaise,
  paise,
  className = "",
  showDecimals = true,
}: MoneyTextProps) {
  const value = amountPaise ?? paise ?? 0;
  const formatted = formatPaise(value, { showDecimals });

  return (
    <span className={`tabular-nums font-currency-table ${className}`}>
      {formatted}
    </span>
  );
}

export default MoneyText;
