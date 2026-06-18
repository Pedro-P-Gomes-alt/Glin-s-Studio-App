export function toIso(date) {
  return date.toISOString().slice(0, 10);
}

// Use local date components — toISOString() returns UTC which shifts the date in non-UTC timezones
function localIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function today() {
  return localIso(new Date());
}

export function addDays(isoDate, n) {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + n);
  return localIso(d);
}

export function formatLong(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function isWeekend(isoDate) {
  const day = new Date(isoDate + "T00:00:00").getDay();
  return day === 0 || day === 6;
}
