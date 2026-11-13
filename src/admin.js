import { allEmployees, auditStmt, dayNotesBetween, endPto, getEmployee, getSettings, lastTick, punchesBetween, saveSettings, startPto } from "./db.js";
import { decideRequest, employeeForEmail, listRequests } from "./requests.js";
import { addDays, hhmmToMinutes, isValidDay, localDate, localHHMM, zonedToEpoch } from "./time.js";
import { fmtDuration, groupByDay, isWorkdayFor, summarizeDay, validateSettings } from "./timesheet.js";

export var MAX_RANGE_DAYS = 370;
export var bad = (error, status = 400) => Response.json({ error }, { status });
export function parseRange(url) {
  const today = localDate(Date.now());
  const from = url.searchParams.get("from") || addDays(today, -6);
  const to = url.searchParams.get("to") || today;
  if (!isValidDay(from) || !isValidDay(to)) return { error: "from/to must be YYYY-MM-DD" };
  if (from > to) return { error: "from must be on or before to" };
  if (from < addDays(to, -MAX_RANGE_DAYS)) return { error: `Range is limited to ${MAX_RANGE_DAYS} days` };
  const ids = [url.searchParams.get("employee"), ...(url.searchParams.get("employees") || "").split(",")].map((s) => (s || "").trim()).filter(Boolean);
  return { from, to, employeeIds: ids.length ? [...new Set(ids)] : null };
}
export function cleanText(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
export function validHHMMOrEmpty(v) {
  return v === "" || v === null || v === void 0 || hhmmToMinutes(v) !== null;
}
export async function timesheet(env, { from, to, employeeIds }) {
  const now = Date.now();
  const today = localDate(now);
  const settings = await getSettings(env);
  const wanted = employeeIds ? new Set(employeeIds) : null;
  const emps = (await allEmployees(env)).filter((e) => !wanted || wanted.has(e.id));
  const single = employeeIds && employeeIds.length === 1 ? employeeIds[0] : null;
  const punches = (await punchesBetween(env, zonedToEpoch(from), zonedToEpoch(addDays(to, 1)), single)).filter((p) => !wanted || wanted.has(p.employee_id));
  const notes = await dayNotesBetween(env, from, to);
  const rows = [];
  for (const emp of emps) {
    const byDay = groupByDay(punches.filter((p) => p.employee_id === emp.id));
    const startedOn = localDate(emp.created_at);
    for (let day = from; day <= to; day = addDays(day, 1)) {
      const off = notes.find((n) => n.employee_id === emp.id && n.day === day && n.kind === "off");
      const dp = byDay.get(day);
      const base = { employee_id: emp.id, name: emp.name, email: emp.email || "", off: off ? off.note || "Off" : null };
      if (dp) {
        rows.push({ ...base, ...summarizeDay(day, dp, settings, now) });
      } else if (off || emp.track && isWorkdayFor(emp, day, settings) && day >= startedOn && day <= today) {
        rows.push({
          ...base,
          day,
          segments: [],
          first_in: null,
          last_out: null,
          span_min: null,
          on_clock_min: 0,
          total_min: 0,
          lunch: null,
          away_min: 0,
          punch_count: 0,
          flags: off || day === today || !emp.active ? [] : ["no_punches"]
        });
      }
    }
  }
  rows.sort((a, b) => a.day === b.day ? a.name.localeCompare(b.name) : a.day < b.day ? 1 : -1);
  const names = Object.fromEntries(emps.map((e) => [e.id, e.name]));
  return { rows, punches: punches.map((p) => ({ ...p, name: names[p.employee_id] || "?" })) };
}
export function csvCell(v) {
  let s = v === null || v === void 0 ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}
export function csv(header, rows) {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
export var SEGMENT_LABEL = { work: "Work", lunch: "Lunch", out: "Out" };
export var hours = (min) => min === null || min === void 0 ? "" : (min / 60).toFixed(2);
export var localStamp = (ts) => ts ? `${localDate(ts)} ${localHHMM(ts)}` : "";
export var isoStamp = (ts) => ts ? new Date(ts).toISOString() : "";
export async function exportCsv(env, kind, range, actor) {
  let body;
  if (kind === "daily") {
    const { rows } = await timesheet(env, range);
    body = csv(
      [
        "Date",
        "Employee",
        "Email",
        "First In",
        "Last Out",
        "Hours Worked (h)",
        "Hours Worked (h:mm)",
        "Total Hours (h)",
        "Total Hours (h:mm)",
        "Lunch Start",
        "Lunch End",
        "Lunch (min)",
        "Lunch Basis",
        "Other Time Out (min)",
        "Punches",
        "Day Off",
        "Flags"
      ],
      rows.map((r) => [
        r.day,
        r.name,
        r.email,
        r.first_in ? localHHMM(r.first_in) : "",
        r.last_out ? localHHMM(r.last_out) : "",
        hours(r.on_clock_min),
        fmtDuration(r.on_clock_min),
        hours(r.total_min),
        fmtDuration(r.total_min),
        r.lunch ? localHHMM(r.lunch.start) : "",
        r.lunch ? localHHMM(r.lunch.end) : "",
        r.lunch ? r.lunch.minutes : "",
        r.lunch ? r.lunch.basis : "",
        r.away_min,
        r.punch_count,
        r.off || "",
        r.flags.join(" ")
      ])
    );
  } else if (kind === "shifts") {
    const { rows } = await timesheet(env, range);
    const ordered = [...rows].sort((a, b) => a.name.localeCompare(b.name) || (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
    const out = [];
    for (const r of ordered) {
      if (r.off) out.push([r.name, r.email, r.day, "", "", "Day off", "", "", r.off, ""]);
      for (const s of r.segments) {
        out.push([
          r.name,
          r.email,
          r.day,
          s.start ? localHHMM(s.start) : "",
          s.end ? localHHMM(s.end) : "",
          SEGMENT_LABEL[s.type],
          fmtDuration(s.minutes),
          hours(s.minutes),
          s.note,
          s.issue
        ]);
      }
    }
    body = csv(["Employee", "Email", "Date", "Start", "End", "Type", "Duration (h:mm)", "Hours", "Note", "Issue"], out);
  } else if (kind === "punches") {
    const { punches } = await timesheet(env, range);
    body = csv(
      [
        "Punch ID",
        "Employee",
        "Date",
        "Time (Denver)",
        "Timestamp (UTC)",
        "Type",
        "Note",
        "Source",
        "Recorded By",
        "Recorded At (UTC)",
        "Voided",
        "Voided By",
        "Voided At (UTC)",
        "Void Reason",
        "Replaces Punch ID",
        "Employee Request ID"
      ],
      punches.map((p) => [
        p.id,
        p.name,
        localDate(p.ts),
        localHHMM(p.ts),
        isoStamp(p.ts),
        p.kind,
        p.note,
        p.source,
        p.actor,
        isoStamp(p.recorded_at),
        p.voided ? "yes" : "no",
        p.voided_by || "",
        isoStamp(p.voided_at),
        p.void_reason || "",
        p.replaces_id || "",
        p.request_id || ""
      ])
    );
  } else if (kind === "audit") {
    const rows = await auditRows(env, range);
    body = csv(
      ["ID", "At (Denver)", "At (UTC)", "Actor", "Action", "Entity", "Entity ID", "Before", "After", "Reason"],
      rows.map((a) => [a.id, localStamp(a.at), isoStamp(a.at), a.actor, a.action, a.entity, a.entity_id, a.before, a.after, a.reason])
    );
  } else {
    return bad("Unknown export", 404);
  }
  await auditStmt(env, {
    actor,
    action: "export",
    entity: kind,
    after: { from: range.from, to: range.to, employees: range.employeeIds || "all" }
  }).run();
  const n = range.employeeIds ? range.employeeIds.length : 0;
  const suffix = n === 1 ? `-${range.employeeIds[0].slice(0, 8)}` : n > 1 ? `-${n}-people` : "";
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="timeclock-${kind}-${range.from}_to_${range.to}${suffix}.csv"`,
      "Cache-Control": "no-store"
    }
  });
}
export async function auditRows(env, { from, to }) {
  return (await env.DB.prepare("SELECT * FROM audit_log WHERE at >= ? AND at < ? ORDER BY at DESC, id DESC LIMIT 5000").bind(zonedToEpoch(from), zonedToEpoch(addDays(to, 1))).all()).results;
}
export function employeeFields(body, { partial }) {
  const out = {};
  if (!partial || "name" in body) {
    const name = cleanText(body.name, 100);
    if (!name) return { error: "Name is required" };
    out.name = name;
  }
  if ("email" in body) {
    const email = cleanText(body.email, 200).toLowerCase();
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Invalid email" };
    out.email = email || null;
  }
  if ("slack_user_id" in body) {
    const sid = cleanText(body.slack_user_id, 30).toUpperCase();
    if (sid && !/^[UW][A-Z0-9]{6,}$/.test(sid)) return { error: "Slack member ID looks like U0123ABCD" };
    out.slack_user_id = sid || null;
  }
  for (const k of ["shift_start", "shift_end"]) {
    if (k in body) {
      if (!validHHMMOrEmpty(body[k])) return { error: `${k} must be HH:MM or blank` };
      out[k] = body[k] || null;
    }
  }
  if (out.shift_start && out.shift_end && hhmmToMinutes(out.shift_end) <= hhmmToMinutes(out.shift_start)) {
    return { error: "Shift end must be after shift start" };
  }
  if ("work_days" in body) {
    if (body.work_days === null || Array.isArray(body.work_days) && !body.work_days.length) {
      out.work_days = null;
    } else if (Array.isArray(body.work_days) && body.work_days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
      out.work_days = JSON.stringify([...new Set(body.work_days)].sort());
    } else {
      return { error: "Work days must be weekday numbers 0-6" };
    }
  }
  if ("track" in body) out.track = body.track ? 1 : 0;
  if (partial && "active" in body) out.active = body.active ? 1 : 0;
  if (partial && "sort_order" in body) out.sort_order = Number(body.sort_order) || 0;
  return { fields: out };
}
export async function handleAdmin(request, env, url, actor) {
  const path = url.pathname.replace(/^\/api\/admin/, "");
  const method = request.method;
  const body = method === "GET" ? {} : await request.json().catch(() => ({}));
  if (path === "/timesheet" && method === "GET") {
    const range = parseRange(url);
    if (range.error) return bad(range.error);
    return Response.json(await timesheet(env, range));
  }
  const exportMatch = path.match(/^\/export\/(shifts|daily|punches|audit)\.csv$/);
  if (exportMatch && method === "GET") {
    const range = parseRange(url);
    if (range.error) return bad(range.error);
    return exportCsv(env, exportMatch[1], range, actor);
  }
  if (path === "/audit" && method === "GET") {
    const range = parseRange(url);
    if (range.error) return bad(range.error);
    return Response.json(await auditRows(env, range));
  }
  if (path === "/employees" && method === "GET") {
    return Response.json(await allEmployees(env));
  }
  if (path === "/employees" && method === "POST") {
    const { fields, error } = employeeFields(body, { partial: false });
    if (error) return bad(error);
    const emp = {
      id: crypto.randomUUID(),
      email: null,
      slack_user_id: null,
      shift_start: null,
      shift_end: null,
      track: 1,
      ...fields,
      created_at: Date.now()
    };
    const maxSort = await env.DB.prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM employees").first();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO employees (id, name, email, slack_user_id, shift_start, shift_end, track, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(emp.id, emp.name, emp.email, emp.slack_user_id, emp.shift_start, emp.shift_end, emp.track, maxSort.n, emp.created_at),
      auditStmt(env, { actor, action: "employee_create", entity: "employee", entityId: emp.id, after: emp })
    ]);
    return Response.json({ ok: true, id: emp.id });
  }
  const empMatch = path.match(/^\/employees\/([\w-]+)$/);
  if (empMatch && method === "PATCH") {
    const before = await getEmployee(env, empMatch[1]);
    if (!before) return bad("Not found", 404);
    const { fields, error } = employeeFields(body, { partial: true });
    if (error) return bad(error);
    const changed = Object.keys(fields).filter((k) => fields[k] !== before[k]);
    if (!changed.length) return Response.json({ ok: true, changed: [] });
    const sets = changed.map((k) => `${k} = ?`).join(", ");
    await env.DB.batch([
      env.DB.prepare(`UPDATE employees SET ${sets} WHERE id = ?`).bind(...changed.map((k) => fields[k]), before.id),
      auditStmt(env, {
        actor,
        action: "active" in fields && fields.active === 0 && before.active === 1 ? "employee_deactivate" : "employee_update",
        entity: "employee",
        entityId: before.id,
        before: Object.fromEntries(changed.map((k) => [k, before[k]])),
        after: Object.fromEntries(changed.map((k) => [k, fields[k]])),
        reason: cleanText(body.reason, 500) || null
      })
    ]);
    return Response.json({ ok: true, changed });
  }
  const ptoMatch = path.match(/^\/employees\/([\w-]+)\/(pto|pto-end)$/);
  if (ptoMatch && method === "POST") {
    const emp = await getEmployee(env, ptoMatch[1]);
    if (!emp) return bad("Not found", 404);
    const reason = cleanText(body.reason, 500) || null;
    if (ptoMatch[2] === "pto-end") {
      if (!emp.pto_return) return bad(`${emp.name} has no PTO set`);
      await endPto(env, emp, { source: "admin", actor, clockIn: false, reason });
      return Response.json({ ok: true });
    }
    const res = await startPto(env, emp, {
      startDay: body.start_day || localDate(Date.now()),
      returnDay: body.return_day,
      note: body.note,
      source: "admin",
      actor,
      reason
    });
    return res.error ? bad(res.error) : Response.json(res);
  }
  if (path === "/punches" && method === "POST") {
    const emp = await getEmployee(env, body.employee_id);
    if (!emp) return bad("Unknown employee");
    const reason = cleanText(body.reason, 500);
    if (!reason) return bad("A reason is required for manual entries");
    if (!isValidDay(body.day) || hhmmToMinutes(body.time) === null) return bad("Date and time are required");
    if (!["in", "out"].includes(body.kind)) return bad("Type must be in or out");
    const ts = zonedToEpoch(body.day, body.time);
    if (ts > Date.now() + 5 * 6e4) return bad("Can't add a punch in the future");
    const note = cleanText(body.note, 100);
    const now = Date.now();
    const res = await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO punches (employee_id, ts, kind, note, source, actor, recorded_at)
         VALUES (?, ?, ?, ?, 'admin', ?, ?)`
      ).bind(emp.id, ts, body.kind, note, actor, now),
      env.DB.prepare(
        `INSERT INTO audit_log (at, actor, action, entity, entity_id, after, reason)
         VALUES (?, ?, 'punch_add', 'punch', CAST(last_insert_rowid() AS TEXT), ?, ?)`
      ).bind(now, actor, JSON.stringify({ employee: emp.name, day: body.day, time: body.time, kind: body.kind, note }), reason)
    ]);
    return Response.json({ ok: true, id: res[0].meta.last_row_id });
  }
  const punchMatch = path.match(/^\/punches\/(\d+)(\/void)?$/);
  if (punchMatch && (method === "PATCH" || method === "POST" && punchMatch[2])) {
    const old = await env.DB.prepare("SELECT * FROM punches WHERE id = ?").bind(Number(punchMatch[1])).first();
    if (!old) return bad("Not found", 404);
    if (old.voided) return bad("That punch was already voided or replaced");
    const reason = cleanText(body.reason, 500);
    if (!reason) return bad("A reason is required");
    const now = Date.now();
    const beforeView = { day: localDate(old.ts), time: localHHMM(old.ts), kind: old.kind, note: old.note };
    const voidStmt = env.DB.prepare(
      "UPDATE punches SET voided = 1, voided_at = ?, voided_by = ?, void_reason = ? WHERE id = ? AND voided = 0"
    ).bind(now, actor, reason, old.id);
    if (punchMatch[2]) {
      await env.DB.batch([
        voidStmt,
        auditStmt(env, { actor, action: "punch_void", entity: "punch", entityId: old.id, before: beforeView, reason })
      ]);
      return Response.json({ ok: true });
    }
    const day = body.day ?? beforeView.day;
    const time = body.time ?? beforeView.time;
    const kind = body.kind ?? old.kind;
    const note = "note" in body ? cleanText(body.note, 100) : old.note;
    if (!isValidDay(day) || hhmmToMinutes(time) === null) return bad("Date and time are required");
    if (!["in", "out"].includes(kind)) return bad("Type must be in or out");
    const ts = zonedToEpoch(day, time);
    if (ts > now + 5 * 6e4) return bad("Can't move a punch into the future");
    const res = await env.DB.batch([
      voidStmt,
      env.DB.prepare(
        `INSERT INTO punches (employee_id, ts, kind, note, source, actor, recorded_at, replaces_id)
         VALUES (?, ?, ?, ?, 'admin', ?, ?, ?)`
      ).bind(old.employee_id, ts, kind, note, actor, now, old.id),
      auditStmt(env, {
        actor,
        action: "punch_edit",
        entity: "punch",
        entityId: old.id,
        before: beforeView,
        after: { day, time, kind, note },
        reason
      })
    ]);
    return Response.json({ ok: true, id: res[1].meta.last_row_id });
  }
  if (path === "/day-off" && (method === "POST" || method === "DELETE")) {
    const emp = await getEmployee(env, body.employee_id);
    if (!emp) return bad("Unknown employee");
    if (!isValidDay(body.day)) return bad("Invalid date");
    const note = cleanText(body.note, 200);
    const stmt = method === "POST" ? env.DB.prepare(
      `INSERT INTO day_notes (employee_id, day, kind, note, created_by, created_at) VALUES (?, ?, 'off', ?, ?, ?)
             ON CONFLICT(employee_id, day, kind) DO UPDATE SET note = excluded.note, created_by = excluded.created_by, created_at = excluded.created_at`
    ).bind(emp.id, body.day, note, actor, Date.now()) : env.DB.prepare("DELETE FROM day_notes WHERE employee_id = ? AND day = ? AND kind = 'off'").bind(emp.id, body.day);
    await env.DB.batch([
      stmt,
      auditStmt(env, {
        actor,
        action: method === "POST" ? "day_off_set" : "day_off_clear",
        entity: "employee",
        entityId: emp.id,
        after: { employee: emp.name, day: body.day, note }
      })
    ]);
    return Response.json({ ok: true });
  }
  if (path === "/requests" && method === "GET") {
    const status = url.searchParams.get("status") || null;
    return Response.json(await listRequests(env, { status, sinceDays: 90 }));
  }
  const reqMatch = path.match(/^\/requests\/(\d+)\/(approve|reject)$/);
  if (reqMatch && method === "POST") {
    const me = await employeeForEmail(env, actor);
    const res = await decideRequest(env, Number(reqMatch[1]), {
      approve: reqMatch[2] === "approve",
      actor,
      actorEmpId: me ? me.id : null,
      note: body.note
    });
    return res.error ? bad(res.error) : Response.json(res);
  }
  if (path === "/status" && method === "GET") {
    return Response.json({ now: Date.now(), lastTick: await lastTick(env) });
  }
  if (path === "/settings" && method === "GET") {
    return Response.json(await getSettings(env));
  }
  if (path === "/settings" && method === "PUT") {
    const { settings, error } = validateSettings(body);
    if (error) return bad(error);
    await saveSettings(env, settings, actor, await getSettings(env));
    return Response.json({ ok: true, settings });
  }
  return bad("Not found", 404);
}
