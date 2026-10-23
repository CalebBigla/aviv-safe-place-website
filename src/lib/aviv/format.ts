// Prices are stored in kobo (minor units). Whole-naira prices show no decimals; others show two.
const naira = (digits: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
const whole = naira(0);
const exact = naira(2);

export const formatNaira = (minor: number | null | undefined) =>
  minor === null || minor === undefined ? "" : (minor % 100 ? exact : whole).format(minor / 100);

// "25000" or "25,000.50" naira -> kobo, using integer arithmetic only. null when invalid.
export function nairaToKobo(input: string): number | null {
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(input.replaceAll(",", "").trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

// kobo -> plain naira text for editing, e.g. 2500050 -> "25000.50".
export const koboToNairaText = (minor: number | null | undefined) =>
  minor === null || minor === undefined
    ? ""
    : `${Math.floor(minor / 100)}${minor % 100 ? `.${String(minor % 100).padStart(2, "0")}` : ""}`;
