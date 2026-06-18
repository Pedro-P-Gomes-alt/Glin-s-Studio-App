export function toIso(date) {
  return date.toISOString().slice(0, 10);
}

export function today() {
  return toIso(new Date());
}

export function addDays(isoDate, n) {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toIso(d);
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
