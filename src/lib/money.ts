const MONEY_INPUT = /^\d{1,9}([.,]\d{1,2})?$/;

export function parseMoneyToCents(input: string): number | null {
  const trimmed = input.trim();
  if (!MONEY_INPUT.test(trimmed)) return null;

  const [whole, fraction = ""] = trimmed.replace(",", ".").split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function centsToMoneyInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function formatCents(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-IE").format(value);
}
