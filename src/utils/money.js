export function eurosToCents(value) {
  const num = parseFloat(value);
  if (isNaN(num) || value === "") return 0;
  return Math.round(num * 100);
}

export function formatEuro(cents) {
  if (cents == null) return "—";
  if (cents < 0) return `-€${(Math.abs(cents) / 100).toFixed(2)}`;
  return `€${(cents / 100).toFixed(2)}`;
}

export function formatEuroPerHour(profitCents, hours) {
  if (!hours || hours <= 0) return "—";
  return `€${(profitCents / 100 / hours).toFixed(2)}`;
}

export function formatMargin(profitCents, saleCents) {
  if (!saleCents || saleCents <= 0) return "—";
  return `${((profitCents / saleCents) * 100).toFixed(1)}%`;
}
