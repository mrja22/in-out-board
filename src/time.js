export var TEAM_TZ = "America/Denver";
export var WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export var partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TEAM_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  weekday: "short"
});
export function localParts(date) {
  const p = {};
  for (const { type, value } of partsFormat.formatToParts(date)) p[type] = value;
  const hour = Number(p.hour) % 24;
  const minute = Number(p.minute);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour,
    minute,
    second: Number(p.second),
    minutes: hour * 60 + minute,
    weekday: WEEKDAYS.indexOf(p.weekday)
    // 0 = Sunday
  };
}
export function localDate(ts) {
  return localParts(new Date(ts)).date;
}
export function teamClock(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TEAM_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}
export function teamWeekday(date) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TEAM_TZ, weekday: "long" }).format(date);
}
export function prettyDate(day) {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
export function hhmmToMinutes(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
export function minutesToHHMM(n) {
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}
export function weekdayOf(day) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export function offsetAt(ts) {
  const p = localParts(new Date(ts));
  const [y, m, d] = p.date.split("-").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ts / 1e3) * 1e3;
}
export function zonedToEpoch(day, hhmm = "00:00") {
  const [y, m, d] = day.split("-").map(Number);
  const mins2 = hhmmToMinutes(hhmm);
  if (mins2 === null) throw new Error(`Bad time: ${hhmm}`);
  const naive = Date.UTC(y, m - 1, d, Math.floor(mins2 / 60), mins2 % 60);
  const first = naive - offsetAt(naive);
  return naive - offsetAt(first);
}
export function localHHMM(ts) {
  return minutesToHHMM(localParts(new Date(ts)).minutes);
}
export function isValidDay(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
}
