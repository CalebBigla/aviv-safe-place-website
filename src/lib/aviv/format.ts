// Prices are stored in kobo (minor units). Whole-naira prices show no decimals.
const naira = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export const formatNaira = (minor: number | null | undefined) =>
  minor === null || minor === undefined ? "" : naira.format(minor / 100);
