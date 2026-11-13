import { hhmmToMinutes, localDate, localParts, weekdayOf } from "./time.js";

export var DEFAULT_SETTINGS = {
  business_days: [1, 2, 3, 4, 5],
  business_start: "09:00",
  // company hours: default shift, and when admin summaries may post
  business_end: "17:00",
  clock_in_grace_min: 30,
  // "not clocked in" fires this long after the person's shift start
  clock_out_reminder: true,
  // DM people still clocked in around the end of their shift
  clock_out_reminder_offset_min: -15,
  // when, from shift end: -15 = 15 min before, 30 = 30 min after
  lunch_window_start: "10:30",
  // an out-period overlapping this window can be read as lunch
  lunch_window_end: "14:30",
  lunch_min_minutes: 15,
  lunch_max_minutes: 120,
  lunch_expected_after_min: 300,
  // flag "no lunch recorded" on days spanning at least this long
  alerts_enabled: true,
  dm_enabled: true,
  admin_channel: "",
  holidays: []
};
export function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...raw || {} };
  if (!Array.isArray(s.business_days)) s.business_days = DEFAULT_SETTINGS.business_days;
  if (!Array.isArray(s.holidays)) s.holidays = [];
  return s;
}
export function validateSettings(input) {
  const s = normalizeSettings(input);
  for (const k of ["business_start", "business_end", "lunch_window_start", "lunch_window_end"]) {
    if (hhmmToMinutes(s[k]) === null) return { error: `${k} must be HH:MM` };
  }
  if (hhmmToMinutes(s.business_end) <= hhmmToMinutes(s.business_start)) return { error: "Business hours end must be after start" };
  if (hhmmToMinutes(s.lunch_window_end) <= hhmmToMinutes(s.lunch_window_start)) return { error: "Lunch window end must be after start" };
  s.business_days = [...new Set(s.business_days.map(Number))].filter((d) => d >= 0 && d <= 6).sort();
  for (const k of ["clock_in_grace_min", "lunch_min_minutes", "lunch_max_minutes", "lunch_expected_after_min"]) {
    const n = Number(s[k]);
    if (!Number.isFinite(n) || n < 0 || n > 1440) return { error: `${k} must be a number of minutes` };
    s[k] = Math.round(n);
  }
  if (s.lunch_max_minutes < s.lunch_min_minutes) return { error: "Lunch max must be at least lunch min" };
  const offset = Number(s.clock_out_reminder_offset_min);
  if (!Number.isFinite(offset) || Math.abs(offset) > 720) {
    return { error: "Clock-out reminder must be within 720 minutes of shift end" };
  }
  s.clock_out_reminder_offset_min = Math.round(offset);
  s.holidays = s.holidays.map((d) => String(d).trim()).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  s.admin_channel = String(s.admin_channel || "").trim();
  for (const k of ["alerts_enabled", "dm_enabled", "clock_out_reminder"]) s[k] = !!s[k];
  const known = Object.keys(DEFAULT_SETTINGS);
  return { settings: Object.fromEntries(known.map((k) => [k, s[k]])) };
}
export function isWorkday(day, settings) {
  return settings.business_days.includes(weekdayOf(day)) && !settings.holidays.includes(day);
}
export function workDaysFor(emp, settings) {
  if (emp && emp.work_days) {
    try {
      const days = JSON.parse(emp.work_days);
      if (Array.isArray(days) && days.length) return days;
    } catch (err) {
    }
  }
  return settings.business_days;
}
export function isWorkdayFor(emp, day, settings) {
  return workDaysFor(emp, settings).includes(weekdayOf(day)) && !settings.holidays.includes(day);
}
export function onPto(emp, day) {
  return !!(emp && emp.pto_start && emp.pto_return && emp.pto_start <= day && day < emp.pto_return);
}
export function shiftFor(emp, settings) {
  const start = hhmmToMinutes(emp.shift_start) ?? hhmmToMinutes(settings.business_start);
  const end = hhmmToMinutes(emp.shift_end) ?? hhmmToMinutes(settings.business_end);
  return end > start ? { start, end } : { start: hhmmToMinutes(settings.business_start), end: hhmmToMinutes(settings.business_end) };
}
export function clockOutReminderAt(shift, settings) {
  return Math.max(shift.start, shift.end + settings.clock_out_reminder_offset_min);
}
export var LUNCH_WORD = /\blunch\b/i;
export function inferLunch(gaps, settings) {
  const noted = gaps.filter((g) => LUNCH_WORD.test(g.note) && g.minutes <= 180);
  if (noted.length) return { ...noted[0], basis: "noted" };
  const ws = hhmmToMinutes(settings.lunch_window_start);
  const we = hhmmToMinutes(settings.lunch_window_end);
  const midday = (ws + we) / 2;
  let best = null;
  for (const g of gaps) {
    if (g.minutes < settings.lunch_min_minutes || g.minutes > settings.lunch_max_minutes) continue;
    const gs = localParts(new Date(g.start)).minutes;
    const ge = gs + g.minutes;
    const overlap = Math.min(ge, we) - Math.max(gs, ws);
    if (overlap <= 0) continue;
    const dist = Math.abs((gs + ge) / 2 - midday);
    if (!best || overlap > best.overlap || overlap === best.overlap && dist < best.dist) {
      best = { gap: g, overlap, dist };
    }
  }
  return best ? { ...best.gap, basis: "inferred" } : null;
}
export var mins = (a, b) => Math.round((b - a) / 6e4);
export var addedLater = (p) => p.source === "admin" && !p.replaces_id;
export function summarizeDay(day, punches, settings, now) {
  const live = punches.filter((p) => !p.voided).sort((a, b) => a.ts - b.ts || a.id - b.id);
  const flags = /* @__PURE__ */ new Set();
  if (punches.some((p) => p.voided || p.source === "admin")) flags.add("edited");
  const intervals = [];
  const broken = [];
  let open = null;
  for (const p of live) {
    if (p.kind === "in") {
      if (open && (p.source === "import" || addedLater(open))) continue;
      if (open) {
        flags.add("missing_clock_out");
        broken.push({ start: open.ts, end: null, issue: "no clock-out" });
      }
      open = p;
    } else if (open) {
      intervals.push({ start: open.ts, end: p.ts, outNote: p.note || "" });
      open = null;
    } else {
      flags.add("missing_clock_in");
      broken.push({ start: null, end: p.ts, issue: "no clock-in", outNote: p.note || "" });
    }
  }
  const isToday = day === localDate(now);
  let ongoing = false;
  if (open) {
    if (isToday) {
      intervals.push({ start: open.ts, end: Math.max(now, open.ts), outNote: "" });
      ongoing = true;
      flags.add("open");
    } else {
      flags.add("missing_clock_out");
      broken.push({ start: open.ts, end: null, issue: "no clock-out" });
    }
  }
  const pieces = [...intervals, ...broken].sort((a, b) => (a.start ?? a.end) - (b.start ?? b.end));
  const gaps = [];
  for (let i = 0; i + 1 < pieces.length; i++) {
    const a = pieces[i];
    const b = pieces[i + 1];
    if (a.end === null || b.start === null || b.start <= a.end) continue;
    gaps.push({ start: a.end, end: b.start, minutes: mins(a.end, b.start), note: a.outNote || "" });
  }
  const lunch = inferLunch(gaps, settings);
  const onClock = intervals.reduce((t, iv) => t + mins(iv.start, iv.end), 0);
  const firstIn = live.find((p) => p.kind === "in")?.ts ?? null;
  const lastOut = [...live].reverse().find((p) => p.kind === "out")?.ts ?? null;
  const spanEnd = ongoing ? now : lastOut;
  const span = firstIn && spanEnd && spanEnd > firstIn ? mins(firstIn, spanEnd) : null;
  const awayTotal = gaps.reduce((t, g) => t + g.minutes, 0);
  const complete = !ongoing && !flags.has("missing_clock_out") && !flags.has("missing_clock_in");
  if (!lunch && complete && span !== null && span >= settings.lunch_expected_after_min) {
    flags.add("no_lunch");
  }
  const segments = [
    ...intervals.map((iv, i) => {
      const inProgress = ongoing && i === intervals.length - 1;
      return {
        type: "work",
        start: iv.start,
        end: inProgress ? null : iv.end,
        minutes: inProgress ? null : mins(iv.start, iv.end),
        note: "",
        issue: inProgress ? "in progress" : ""
      };
    }),
    ...gaps.map((g) => ({
      type: lunch && g.start === lunch.start ? "lunch" : "out",
      start: g.start,
      end: g.end,
      minutes: g.minutes,
      note: g.note,
      issue: ""
    })),
    ...broken.map((b) => ({ type: "work", start: b.start, end: b.end, minutes: null, note: "", issue: b.issue }))
  ].sort((a, b) => (a.start ?? a.end) - (b.start ?? b.end));
  return {
    day,
    segments,
    first_in: firstIn,
    last_out: ongoing ? null : lastOut,
    span_min: span,
    on_clock_min: onClock,
    total_min: onClock + (lunch ? Math.min(lunch.minutes, 60) : 0),
    lunch: lunch ? { start: lunch.start, end: lunch.end, minutes: lunch.minutes, basis: lunch.basis } : null,
    away_min: awayTotal - (lunch ? lunch.minutes : 0),
    punch_count: live.length,
    flags: [...flags]
  };
}
export function groupByDay(punches) {
  const byDay = /* @__PURE__ */ new Map();
  for (const p of punches) {
    const d = localDate(p.ts);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(p);
  }
  return byDay;
}
export function openDays(punches, settings, now, skip = /* @__PURE__ */ new Set()) {
  const today = localDate(now);
  const out = [];
  for (const [day, dayPunches] of groupByDay(punches)) {
    if (day >= today || skip.has(day)) continue;
    const s = summarizeDay(day, dayPunches, settings, now);
    if (!s.flags.includes("missing_clock_out")) continue;
    const unclosed = s.segments.find((g) => g.issue === "no clock-out");
    out.push({ day, clockedIn: unclosed ? unclosed.start : s.first_in });
  }
  return out.sort((a, b) => a.day < b.day ? 1 : -1);
}
export function fmtDuration(min) {
  if (min === null || min === void 0) return "";
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}
