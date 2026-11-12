import { addDays, isValidDay, localDate, prettyDate, weekdayOf } from "./time.js";
import { normalizeSettings, onPto, workDaysFor } from "./timesheet.js";

export async function getSettings(env) {
  const rows = (await env.DB.prepare("SELECT key, value FROM settings WHERE key NOT LIKE '\\_%' ESCAPE '\\'").all()).results;
  const raw = {};
  for (const r of rows) raw[r.key] = JSON.parse(r.value);
  return normalizeSettings(raw);
}
export var HEARTBEAT_KEY = "_last_tick";
export async function recordTick(env, tick) {
  await env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).bind(HEARTBEAT_KEY, JSON.stringify(tick)).run();
}
export async function lastTick(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(HEARTBEAT_KEY).first();
  return row ? JSON.parse(row.value) : null;
}
export function auditStmt(env, { actor, action, entity, entityId, before, after, reason }) {
  return env.DB.prepare(
    `INSERT INTO audit_log (at, actor, action, entity, entity_id, before, after, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    Date.now(),
    actor,
    action,
    entity ?? null,
    entityId === null || entityId === void 0 ? null : String(entityId),
    before === void 0 ? null : JSON.stringify(before),
    after === void 0 ? null : JSON.stringify(after),
    reason ?? null
  );
}
export async function saveSettings(env, settings, actor, before) {
  const stmts = Object.entries(settings).map(
    ([k, v]) => env.DB.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).bind(k, JSON.stringify(v))
  );
  stmts.push(auditStmt(env, { actor, action: "settings_update", entity: "settings", before, after: settings }));
  await env.DB.batch(stmts);
}
export async function boardEmployees(env) {
  const today = localDate(Date.now());
  const rows = (await env.DB.prepare(
    "SELECT id, name, status, return_time, pto_start, pto_return FROM employees WHERE active = 1 ORDER BY sort_order, created_at"
  ).all()).results;
  return rows.map(
    (r) => onPto(r, today) ? { id: r.id, name: r.name, status: "pto", returnTime: `Back ${prettyDate(r.pto_return)}`, ptoReturn: r.pto_return } : { id: r.id, name: r.name, status: r.status, returnTime: r.return_time }
  );
}
export var PTO_NOTE_PREFIX = "PTO";
export var MAX_PTO_DAYS = 366;
export async function startPto(env, emp, { startDay, returnDay, note, source, actor, reason }) {
  const today = localDate(Date.now());
  if (!isValidDay(startDay) || !isValidDay(returnDay)) return { error: "Pick a valid return date" };
  if (returnDay <= startDay) return { error: "The return date must be after the PTO starts" };
  if (returnDay > addDays(startDay, MAX_PTO_DAYS)) return { error: "PTO is limited to a year at a time" };
  const settings = await getSettings(env);
  const cleanNote = String(note || "").trim().slice(0, 150);
  const dayNote = cleanNote ? `${PTO_NOTE_PREFIX}: ${cleanNote}` : PTO_NOTE_PREFIX;
  const now = Date.now();
  const stmts = [
    env.DB.prepare("UPDATE employees SET pto_start = ?, pto_return = ?, pto_note = ? WHERE id = ?").bind(startDay, returnDay, cleanNote || null, emp.id),
    env.DB.prepare(`DELETE FROM day_notes WHERE employee_id = ? AND kind = 'off' AND day >= ? AND note LIKE '${PTO_NOTE_PREFIX}%'`).bind(emp.id, startDay < today ? startDay : today)
  ];
  const ptoDays = workDaysFor(emp, settings);
  let daysOff = 0;
  for (let d = startDay; d < returnDay; d = addDays(d, 1)) {
    if (!ptoDays.includes(weekdayOf(d))) continue;
    daysOff++;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO day_notes (employee_id, day, kind, note, created_by, created_at) VALUES (?, ?, 'off', ?, ?, ?)
         ON CONFLICT(employee_id, day, kind) DO UPDATE SET note = excluded.note, created_by = excluded.created_by, created_at = excluded.created_at`
      ).bind(emp.id, d, dayNote, actor, now)
    );
  }
  if (startDay <= today && emp.status === "in") {
    stmts.push(
      env.DB.prepare("UPDATE employees SET status = 'out', return_time = '' WHERE id = ?").bind(emp.id),
      env.DB.prepare(
        `INSERT INTO punches (employee_id, ts, kind, note, source, actor, recorded_at) VALUES (?, ?, 'out', ?, ?, ?, ?)`
      ).bind(emp.id, now, `PTO, back ${prettyDate(returnDay)}`.slice(0, 100), source, actor, now)
    );
  }
  stmts.push(
    auditStmt(env, {
      actor,
      action: "pto_start",
      entity: "employee",
      entityId: emp.id,
      before: emp.pto_start ? { pto_start: emp.pto_start, pto_return: emp.pto_return } : void 0,
      after: { employee: emp.name, pto_start: startDay, pto_return: returnDay, note: cleanNote, work_days_off: daysOff },
      reason: reason || null
    })
  );
  await env.DB.batch(stmts);
  return { ok: true, daysOff };
}
export async function endPto(env, emp, { source, actor, clockIn, reason }) {
  const today = localDate(Date.now());
  const now = Date.now();
  const stmts = [
    env.DB.prepare("UPDATE employees SET pto_start = NULL, pto_return = NULL, pto_note = NULL WHERE id = ?").bind(emp.id),
    env.DB.prepare(`DELETE FROM day_notes WHERE employee_id = ? AND kind = 'off' AND day >= ? AND note LIKE '${PTO_NOTE_PREFIX}%'`).bind(emp.id, today)
  ];
  if (clockIn) {
    stmts.push(env.DB.prepare("UPDATE employees SET status = 'in', return_time = '' WHERE id = ?").bind(emp.id));
    if (emp.status !== "in") {
      stmts.push(
        env.DB.prepare(
          `INSERT INTO punches (employee_id, ts, kind, note, source, actor, recorded_at) VALUES (?, ?, 'in', '', ?, ?, ?)`
        ).bind(emp.id, now, source, actor, now)
      );
    }
  }
  stmts.push(
    auditStmt(env, {
      actor,
      action: "pto_end",
      entity: "employee",
      entityId: emp.id,
      before: { pto_start: emp.pto_start, pto_return: emp.pto_return },
      after: { employee: emp.name, ended: today, clocked_in: !!clockIn },
      reason: reason || null
    })
  );
  await env.DB.batch(stmts);
  return { ok: true };
}
export async function signIn(env, emp, source, actor) {
  if (onPto(emp, localDate(Date.now()))) {
    await endPto(env, emp, { source, actor, clockIn: true });
    return { endedPto: true, clockedIn: emp.status !== "in" };
  }
  const clockedIn = await setStatus(env, emp, "in", "", source, actor);
  return { endedPto: false, clockedIn };
}
export async function allEmployees(env) {
  return (await env.DB.prepare("SELECT * FROM employees ORDER BY active DESC, sort_order, created_at").all()).results;
}
export async function getEmployee(env, id) {
  return env.DB.prepare("SELECT * FROM employees WHERE id = ?").bind(id).first();
}
export async function findEmployeeByName(env, name) {
  return env.DB.prepare("SELECT * FROM employees WHERE active = 1 AND lower(name) = lower(?)").bind(name.trim()).first();
}
export async function setStatus(env, emp, status, returnTime, source, actor) {
  const note = (returnTime || "").slice(0, 100);
  const stmts = [
    env.DB.prepare("UPDATE employees SET status = ?, return_time = ? WHERE id = ?").bind(
      status,
      status === "in" ? "" : note,
      emp.id
    )
  ];
  const changed = emp.status !== status;
  if (changed) {
    const now = Date.now();
    stmts.push(
      env.DB.prepare(
        `INSERT INTO punches (employee_id, ts, kind, note, source, actor, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(emp.id, now, status, status === "out" ? note : "", source, actor, now)
    );
  }
  await env.DB.batch(stmts);
  return changed;
}
export async function punchesBetween(env, fromTs, toTs, employeeId) {
  const sql = employeeId ? "SELECT * FROM punches WHERE ts >= ? AND ts < ? AND employee_id = ? ORDER BY ts, id" : "SELECT * FROM punches WHERE ts >= ? AND ts < ? ORDER BY ts, id";
  const stmt = env.DB.prepare(sql);
  return (await (employeeId ? stmt.bind(fromTs, toTs, employeeId) : stmt.bind(fromTs, toTs)).all()).results;
}
export async function dayNotesBetween(env, fromDay, toDay) {
  return (await env.DB.prepare("SELECT * FROM day_notes WHERE day >= ? AND day <= ?").bind(fromDay, toDay).all()).results;
}
