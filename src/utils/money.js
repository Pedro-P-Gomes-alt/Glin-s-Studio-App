export function eurosToCents(value) {
  const num = parseFloat(value);
  if (isNaN(num) || value === "") return 0;
  return Math.round(num * 100);
}

// Group the integer part in threes with a non-breaking space → "208 595.00"
function groupAmount(value) {
  const [intPart, decPart] = value.toFixed(2).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${grouped}.${decPart}`;
}

export function formatEuro(cents) {
  if (cents == null) return "—";
  if (cents < 0) return `-€${groupAmount(Math.abs(cents) / 100)}`;
  return `€${groupAmount(cents / 100)}`;
}

export function formatEuroPerHour(profitCents, hours) {
  if (!hours || hours <= 0) return "—";
  return `€${groupAmount(profitCents / 100 / hours)}`;
}

export function formatMargin(profitCents, saleCents) {
  if (!saleCents || saleCents <= 0) return "—";
  return `${((profitCents / saleCents) * 100).toFixed(1)}%`;
}
