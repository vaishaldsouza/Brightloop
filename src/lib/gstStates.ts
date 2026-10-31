export interface GSTState {
  code: string;
  name: string;
  isIntraState: boolean; // Company state is Maharashtra (27) per PRD §4.7
}

export const COMPANY_GST_STATE_CODE = "27";
export const COMPANY_GST_STATE_NAME = "Maharashtra";

export const INDIAN_GST_STATES: { code: string; name: string }[] = [
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "07", name: "Delhi" },
  { code: "24", name: "Gujarat" },
  { code: "33", name: "Tamil Nadu" },
  { code: "36", name: "Telangana" },
  { code: "19", name: "West Bengal" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "06", name: "Haryana" },
  { code: "32", name: "Kerala" },
  { code: "08", name: "Rajasthan" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "21", name: "Odisha" },
  { code: "03", name: "Punjab" },
  { code: "10", name: "Bihar" },
  { code: "20", name: "Jharkhand" },
  { code: "22", name: "Chhattisgarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "04", name: "Chandigarh" },
  { code: "30", name: "Goa" },
  { code: "18", name: "Assam" },
  { code: "01", name: "Jammu and Kashmir" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "31", name: "Lakshadweep" },
  { code: "38", name: "Ladakh" },
];

export function isIntraState(stateCode?: string | null): boolean {
  if (!stateCode) return true; // Default fallback
  return stateCode.trim() === COMPANY_GST_STATE_CODE;
}

export function getStateByCode(code?: string | null) {
  if (!code) return null;
  return INDIAN_GST_STATES.find((s) => s.code === code.trim()) || null;
}

export function getStateByName(name?: string | null) {
  if (!name) return null;
  const lower = name.trim().toLowerCase();
  return INDIAN_GST_STATES.find((s) => s.name.toLowerCase() === lower) || null;
}
