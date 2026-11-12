import { auditStmt, dayNotesBetween, getSettings, punchesBetween } from "./db.js";
import { slackPost } from "./slack-api.js";
import { addDays, hhmmToMinutes, localDate, localParts, prettyDate, teamClock, zonedToEpoch } from "./time.js";
import { clockOutReminderAt, groupByDay, isWorkday, isWorkdayFor, openDays, shiftFor, summarizeDay } from "./timesheet.js";

export var NO_SIGN_OUT_NOTE = "Did not log out";
export var LOOKBACK_DAYS = 7;
export var ASK_GRACE_MS = 30 * 6e4;
export var clock = (ts) => teamClock(new Date(ts));
export var clockMin = (m) => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, "0")} ${m < 720 ? "AM" : "PM"}`;
export function dmText(kind, emp, day, detail, shift, nowMin) {
  switch (kind) {
    case "no_clock_in":
      return `You haven't clocked in yet today (your shift starts ${clockMin(shift.start)}). Clock in with \`/inout\` or on the board. If you're off today, let an admin know.`;
    case "missing_clock_out":
      return `Your time record for *${prettyDate(day)}* has no clock-out${detail ? ` (${detail})` : ""}. Use the button below to enter the time you finished; an admin will approve it.`;
    case "missing_clock_in":
      return `Your time record for *${prettyDate(day)}* has a clock-out with no clock-in${detail ? ` (${detail})` : ""}. Use the button below to enter the time you started; an admin will approve it.`;
    case "clock_out_reminder":
      return nowMin < shift.end ? `Your shift ends at ${clockMin(shift.end)} and you're still clocked in. Remember to clock out with \`/inout\` or on the board when you finish for the day.` : `Your shift ended at ${clockMin(shift.end)} and you're still clocked in. If you're done for the day, clock out with \`/inout\` or on the board.`;
    default:
      return null;
  }
}
export var FIX_BUTTON = {
  missing_clock_out: { label: "Enter my clock-out time", k: "out" },
  missing_clock_in: { label: "Enter my clock-in time", k: "in" },
  no_clock_in: { label: "Started earlier? Enter my clock-in time", k: "in" }
};
export function dmBlocks(kind, day, text) {
  const fix = FIX_BUTTON[kind];
  if (!fix) return void 0;
  return [
    { type: "section", text: { type: "mrkdwn", text } },
    {
      type: "actions",
      elements: [
        { type: "button", text: { type: "plain_text", text: fix.label }, action_id: "req_open", value: JSON.stringify({ d: day, k: fix.k }) }
      ]
    }
  ];
}
export var SUMMARY_LABEL = {
  no_clock_in: "Not clocked in today",
  missing_clock_out: "Missing clock-out",
  missing_clock_in: "Missing clock-in",
  no_lunch: "No lunch recorded"
};
export async function midnightSweep(env, today, result) {
  const claim = await env.DB.prepare(
    "INSERT OR IGNORE INTO alerts (employee_id, day, kind, created_at, admin_notified_at) VALUES ('*', ?, 'sweep', ?, ?)"
  ).bind(today, Date.now(), Date.now()).run();
  if (!claim.meta.changes) return;
  const stillIn = (await env.DB.prepare("SELECT id, name FROM employees WHERE active = 1 AND status = 'in'").all()).results;
  if (!stillIn.length) return;
  await env.DB.batch([
    env.DB.prepare("UPDATE employees SET status = 'out', return_time = ? WHERE active = 1 AND status = 'in'").bind(NO_SIGN_OUT_NOTE),
    auditStmt(env, {
      actor: "system",
      action: "midnight_sweep",
      entity: "board",
      after: stillIn.map((e) => e.name),
      reason: "Still signed in at midnight; board reset, no clock-out punch written"
    })
  ]);
  result.sweep = stillIn.map((e) => e.name);
}
export async function endFinishedPto(env, today, result) {
  const done = (await env.DB.prepare("SELECT id, name, pto_start, pto_return FROM employees WHERE pto_return IS NOT NULL AND pto_return <= ?").bind(today).all()).results;
  if (!done.length) return;
  await env.DB.batch([
    env.DB.prepare("UPDATE employees SET pto_start = NULL, pto_return = NULL, pto_note = NULL WHERE pto_return IS NOT NULL AND pto_return <= ?").bind(today),
    ...done.map(
      (e) => auditStmt(env, {
        actor: "system",
        action: "pto_end",
        entity: "employee",
        entityId: e.id,
        before: { pto_start: e.pto_start, pto_return: e.pto_return },
        after: { employee: e.name, ended: today, clocked_in: false },
        reason: "Return date reached"
      })
    )
  ]);
  result.ptoEnded = done.map((e) => e.name);
}
export async function raiseAlert(env, settings, emp, day, kind, detail, text, now, { dm = true, admin = true } = {}) {
  const ins = await env.DB.prepare(
    `INSERT OR IGNORE INTO alerts (employee_id, day, kind, detail, created_at, admin_notified_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(emp.id, day, kind, detail, now, admin ? null : now).run();
  if (!ins.meta.changes) return { raised: false, dmSent: false };
  if (dm && text && settings.dm_enabled && emp.slack_user_id) {
    if (await slackPost(env, emp.slack_user_id, text, dmBlocks(kind, day, text))) {
      await env.DB.prepare("UPDATE alerts SET dm_sent_at = ? WHERE employee_id = ? AND day = ? AND kind = ?").bind(now, emp.id, day, kind).run();
      return { raised: true, dmSent: true };
    }
  }
  return { raised: true, dmSent: false };
}
export async function answeredDays(env, firstDay, employeeId) {
  const rows = (await env.DB.prepare(
    `SELECT employee_id, day FROM correction_requests
       WHERE day >= ? AND status IN ('pending', 'rejected')${employeeId ? " AND employee_id = ?" : ""}`
  ).bind(...employeeId ? [firstDay, employeeId] : [firstDay]).all()).results;
  return new Set(rows.map((r) => `${r.employee_id}|${r.day}`));
}
export async function askAboutOpenDays(env, emp, { self, ctx, now = Date.now() }) {
  try {
    const settings = await getSettings(env);
    if (!settings.alerts_enabled || !emp.track) return null;
    const today = localDate(now);
    const startOfToday = zonedToEpoch(today);
    const ins = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM punches WHERE employee_id = ? AND kind = 'in' AND voided = 0 AND ts >= ?"
    ).bind(emp.id, startOfToday).first();
    if (ins.n !== 1) return null;
    const firstDay = addDays(today, -LOOKBACK_DAYS);
    const punches = await punchesBetween(env, zonedToEpoch(firstDay), startOfToday, emp.id);
    const skip = new Set([...await answeredDays(env, firstDay, emp.id)].map((k) => k.split("|")[1]));
    const open = openDays(punches, settings, now, skip);
    if (!open.length) return null;
    if (self) {
      const o = open[0];
      return { day: o.day, dayText: prettyDate(o.day), clockedInText: clock(o.clockedIn), otherDays: open.length - 1 };
    }
    ctx.waitUntil((async () => {
      for (const o of open) {
        const detail = `clocked in ${clock(o.clockedIn)}`;
        await raiseAlert(env, settings, emp, o.day, "missing_clock_out", detail, dmText("missing_clock_out", emp, o.day, detail), now);
      }
    })().catch((err) => console.error("Open-day DM failed", err)));
  } catch (err) {
    console.error("Open-day check after sign-in failed", err);
  }
  return null;
}
export async function runTick(env, now = Date.now()) {
  const result = { sweep: [], raised: [], dms: 0, summaryPosted: false };
  const settings = await getSettings(env);
  const lp = localParts(new Date(now));
  const today = lp.date;
  if (lp.hour === 0) {
    await midnightSweep(env, today, result);
    await endFinishedPto(env, today, result);
  }
  if (!settings.alerts_enabled) return result;
  const employees = (await env.DB.prepare("SELECT * FROM employees WHERE active = 1 AND track = 1").all()).results;
  const firstDay = addDays(today, -LOOKBACK_DAYS);
  const punches = await punchesBetween(env, zonedToEpoch(firstDay), now + 1);
  const notes = await dayNotesBetween(env, firstDay, today);
  const isOff = (empId, day) => notes.some((n) => n.employee_id === empId && n.day === day && n.kind === "off");
  const answered = await answeredDays(env, firstDay);
  const raise = async (emp, day, kind, detail, shift, opts = {}) => {
    const text = dmText(kind, emp, day, detail, shift, lp.minutes);
    const r = await raiseAlert(env, settings, emp, day, kind, detail, text, now, opts);
    if (r.raised) result.raised.push({ name: emp.name, day, kind });
    if (r.dmSent) result.dms++;
  };
  for (const emp of employees) {
    if (!isWorkdayFor(emp, today, settings)) continue;
    if (isOff(emp.id, today)) continue;
    const shift = shiftFor(emp, settings);
    if (settings.clock_out_reminder && emp.status === "in" && lp.minutes >= clockOutReminderAt(shift, settings)) {
      await raise(emp, today, "clock_out_reminder", "", shift, { admin: false });
    }
    if (lp.minutes < shift.start || lp.minutes > shift.end) continue;
    const mine = groupByDay(punches.filter((p) => p.employee_id === emp.id));
    const todays = mine.get(today) || [];
    const live = todays.filter((p) => !p.voided);
    const firstIn = live.find((p) => p.kind === "in");
    const justArrived = !!firstIn && now - firstIn.ts < ASK_GRACE_MS;
    for (let i = LOOKBACK_DAYS; i >= 1; i--) {
      const day = addDays(today, -i);
      const dayPunches = mine.get(day);
      if (!dayPunches) continue;
      const s = summarizeDay(day, dayPunches, settings, now);
      const asked = answered.has(`${emp.id}|${day}`);
      if (s.flags.includes("missing_clock_out") && !asked && !justArrived) {
        await raise(emp, day, "missing_clock_out", s.first_in ? `clocked in ${clock(s.first_in)}` : "", shift);
      }
      if (s.flags.includes("missing_clock_in") && !asked) {
        await raise(emp, day, "missing_clock_in", s.last_out ? `clocked out ${clock(s.last_out)}` : "", shift);
      }
      if (s.flags.includes("no_lunch")) {
        await raise(emp, day, "no_lunch", `${clock(s.first_in)} - ${clock(s.last_out)}`, shift, { dm: false });
      }
    }
    if (!live.length && lp.minutes >= shift.start + settings.clock_in_grace_min) {
      await raise(emp, today, "no_clock_in", "", shift);
    }
  }
  await postAdminSummary(env, settings, lp, now, employees, result);
  return result;
}
export var DAY_FLAGS = ["missing_clock_out", "missing_clock_in", "no_lunch"];
export async function stillOpen(env, settings, alerts, now) {
  const past = alerts.filter((a) => DAY_FLAGS.includes(a.kind));
  if (!past.length) return alerts;
  const firstDay = past.reduce((min, a) => a.day < min ? a.day : min, past[0].day);
  const byEmpDay = /* @__PURE__ */ new Map();
  for (const p of await punchesBetween(env, zonedToEpoch(firstDay), now + 1)) {
    const key = `${p.employee_id}|${localDate(p.ts)}`;
    if (!byEmpDay.has(key)) byEmpDay.set(key, []);
    byEmpDay.get(key).push(p);
  }
  return alerts.filter((a) => {
    if (!DAY_FLAGS.includes(a.kind)) return true;
    const dayPunches = byEmpDay.get(`${a.employee_id}|${a.day}`) || [];
    return summarizeDay(a.day, dayPunches, settings, now).flags.includes(a.kind);
  });
}
export async function postAdminSummary(env, settings, lp, now, employees, result) {
  const start = hhmmToMinutes(settings.business_start);
  const end = hhmmToMinutes(settings.business_end);
  if (!settings.admin_channel || !isWorkday(lp.date, settings) || lp.minutes < start || lp.minutes > end) return;
  const raised = (await env.DB.prepare(
    `SELECT a.*, e.name FROM alerts a JOIN employees e ON e.id = a.employee_id
       WHERE a.admin_notified_at IS NULL AND a.created_at >= ? ORDER BY a.kind, a.day, e.name`
  ).bind(now - LOOKBACK_DAYS * 864e5).all()).results;
  const pending = await stillOpen(env, settings, raised, now);
  if (!pending.length) return;
  const lines = [];
  for (const kind of Object.keys(SUMMARY_LABEL)) {
    const rows = pending.filter((a) => a.kind === kind);
    if (!rows.length) continue;
    lines.push(`*${SUMMARY_LABEL[kind]}*`);
    for (const a of rows) {
      const when = kind === "no_clock_in" ? "" : ` - ${prettyDate(a.day)}`;
      const extra = a.detail ? ` (${a.detail})` : "";
      const dm = kind === "no_lunch" ? "" : a.dm_sent_at ? "" : " _(no Slack DM - not linked)_";
      lines.push(`\u2022 ${a.name}${when}${extra}${dm}`);
    }
  }
  const text = `:alarm_clock: *Time clock exceptions*
${lines.join("\n")}
Fix in the admin portal: timesheets \u2192 Details.`;
  if (await slackPost(env, settings.admin_channel, text)) {
    result.summaryPosted = true;
    await env.DB.batch(
      pending.map(
        (a) => env.DB.prepare("UPDATE alerts SET admin_notified_at = ? WHERE employee_id = ? AND day = ? AND kind = ?").bind(now, a.employee_id, a.day, a.kind)
      )
    );
  }
}
