import { isAdmin } from "./auth.js";
import { auditStmt, getSettings } from "./db.js";
import { slackCall, slackPost } from "./slack-api.js";
import { addDays, hhmmToMinutes, isValidDay, localDate, localHHMM, prettyDate, zonedToEpoch } from "./time.js";

export var REQUEST_WINDOW_DAYS = 14;
export var clean = (v, max) => typeof v === "string" ? v.trim().slice(0, max) : "";
export function fmt12(hhmm) {
  const m = hhmmToMinutes(hhmm);
  if (m === null) return hhmm || "";
  return `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, "0")} ${m < 720 ? "AM" : "PM"}`;
}
export var punchWord = (k) => k === "in" ? "clock-in" : "clock-out";
export function describeRequest(r, punch) {
  const day = prettyDate(r.day);
  if (r.kind === "add") return `Add ${punchWord(r.punch_kind)} at ${fmt12(r.time)} on ${day}`;
  const was = punch ? `${punchWord(punch.kind)} at ${fmt12(localHHMM(punch.ts))}` : `punch #${r.punch_id}`;
  if (r.kind === "remove") return `Remove ${was} on ${day}`;
  const kindChange = punch && r.punch_kind && r.punch_kind !== punch.kind ? ` (as a ${punchWord(r.punch_kind)})` : "";
  return `Change ${was} to ${fmt12(r.time)}${kindChange} on ${day}`;
}
export async function employeeForEmail(env, email) {
  if (!email) return null;
  return env.DB.prepare("SELECT * FROM employees WHERE active = 1 AND lower(email) = lower(?)").bind(email).first();
}
export async function employeeForSlack(env, slackUserId) {
  if (!slackUserId) return null;
  return env.DB.prepare("SELECT * FROM employees WHERE active = 1 AND slack_user_id = ?").bind(slackUserId).first();
}
export async function getRequest(env, id) {
  return env.DB.prepare(
    `SELECT r.*, e.name, e.email, e.slack_user_id FROM correction_requests r JOIN employees e ON e.id = r.employee_id WHERE r.id = ?`
  ).bind(id).first();
}
export async function getPunch(env, id) {
  return id ? env.DB.prepare("SELECT * FROM punches WHERE id = ?").bind(id).first() : null;
}
export async function createRequest(env, emp, input, { by, via }) {
  const now = Date.now();
  const today = localDate(now);
  const earliest = addDays(today, -REQUEST_WINDOW_DAYS);
  const kind = input.kind;
  if (!["add", "change", "remove"].includes(kind)) return { error: "Unknown request type" };
  const reason = clean(input.reason, 500);
  if (!reason) return { error: "Please say why (e.g. forgot to clock out, left at 5:15)" };
  const note = clean(input.note, 100);
  let day = input.day;
  let punch = null;
  if (kind !== "add") {
    punch = await getPunch(env, Number(input.punch_id));
    if (!punch || punch.employee_id !== emp.id) return { error: "That punch isn't on your record" };
    if (punch.voided) return { error: "That punch was already corrected" };
    day = day || localDate(punch.ts);
  }
  if (!isValidDay(day)) return { error: "Pick a date" };
  if (day > today) return { error: "That date is in the future" };
  if (day < earliest || punch && localDate(punch.ts) < earliest) {
    return { error: `Only the last ${REQUEST_WINDOW_DAYS} days can be corrected here. Ask an admin for older changes.` };
  }
  let time = null;
  let punchKind = null;
  if (kind !== "remove") {
    if (hhmmToMinutes(input.time) === null) return { error: "Pick a time" };
    time = input.time;
    if (zonedToEpoch(day, time) > now + 5 * 6e4) return { error: "That time hasn't happened yet" };
    punchKind = kind === "add" ? input.punch_kind : input.punch_kind || punch.kind;
    if (!["in", "out"].includes(punchKind)) return { error: "Pick clock-in or clock-out" };
  }
  const res = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO correction_requests (employee_id, kind, punch_id, day, time, punch_kind, note, reason, requested_by, requested_via, requested_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(emp.id, kind, punch ? punch.id : null, day, time, punchKind, note, reason, by, via, now),
    env.DB.prepare(
      `INSERT INTO audit_log (at, actor, action, entity, entity_id, after, reason)
       VALUES (?, ?, 'request_create', 'request', CAST(last_insert_rowid() AS TEXT), ?, ?)`
    ).bind(now, by, JSON.stringify({ employee: emp.name, kind, day, time, punch_kind: punchKind, punch_id: punch ? punch.id : null, note }), reason)
  ]);
  return { id: res[0].meta.last_row_id };
}
export function requestBlocks(r, punch, { decided } = {}) {
  const lines = [
    `:memo: *Time correction #${r.id}* from *${r.name}*`,
    `*${describeRequest(r, punch)}*${r.note ? `  _(note: ${r.note})_` : ""}`,
    `> ${r.reason.replace(/\n/g, "\n> ")}`
  ];
  const blocks = [
    { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
    { type: "context", elements: [{ type: "mrkdwn", text: `Requested via ${r.requested_via} by ${r.requested_by}` }] }
  ];
  if (decided) {
    const icon = r.status === "approved" ? ":white_check_mark: Approved" : r.status === "rejected" ? ":x: Rejected" : ":leftwards_arrow_with_hook: Withdrawn";
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `${icon}${r.decided_by && r.status !== "withdrawn" ? ` by ${r.decided_by}` : ""}${r.decision_note ? `: ${r.decision_note}` : ""}` }]
    });
  } else {
    blocks.push({
      type: "actions",
      elements: [
        { type: "button", text: { type: "plain_text", text: "Approve" }, style: "primary", action_id: "req_approve", value: String(r.id) },
        { type: "button", text: { type: "plain_text", text: "Reject" }, style: "danger", action_id: "req_reject", value: String(r.id) }
      ]
    });
  }
  return blocks;
}
export async function announceRequest(env, id) {
  const settings = await getSettings(env);
  if (!settings.admin_channel) return;
  const r = await getRequest(env, id);
  const punch = await getPunch(env, r.punch_id);
  const text = `Time correction #${r.id} from ${r.name}: ${describeRequest(r, punch)}`;
  const res = await slackCall(env, "chat.postMessage", { channel: settings.admin_channel, text, blocks: requestBlocks(r, punch) });
  if (res.ok) {
    await env.DB.prepare("UPDATE correction_requests SET slack_channel = ?, slack_ts = ? WHERE id = ?").bind(res.channel || settings.admin_channel, res.ts, id).run();
  }
}
export async function announceDecision(env, id) {
  const r = await getRequest(env, id);
  const punch = await getPunch(env, r.punch_id);
  if (r.slack_channel && r.slack_ts) {
    await slackCall(env, "chat.update", {
      channel: r.slack_channel,
      ts: r.slack_ts,
      text: `Time correction #${r.id} from ${r.name}: ${r.status}`,
      blocks: requestBlocks(r, punch, { decided: true })
    });
  }
  if (r.slack_user_id && r.status !== "withdrawn") {
    const verdict = r.status === "approved" ? "approved :white_check_mark:" : "not approved :x:";
    await slackPost(
      env,
      r.slack_user_id,
      `Your time correction (${describeRequest(r, punch)}) was ${verdict}${r.decision_note ? `: ${r.decision_note}` : "."}`
    );
  }
}
export function isSelf(r, { actor, actorEmpId }) {
  return actorEmpId && actorEmpId === r.employee_id || actor === r.requested_by;
}
export async function decideRequest(env, id, { approve, actor, actorEmpId, note, ctx }) {
  const r = await getRequest(env, id);
  if (!r) return { error: "Request not found" };
  if (r.status !== "pending") return { error: `Request #${id} was already ${r.status}` };
  if (isSelf(r, { actor, actorEmpId })) return { error: "You can't decide your own request. Another admin needs to." };
  const now = Date.now();
  const decisionNote = clean(note, 300) || null;
  const markDecided = (status) => env.DB.prepare(
    "UPDATE correction_requests SET status = ?, decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ? AND status = 'pending'"
  ).bind(status, actor, now, decisionNote, id);
  if (!approve) {
    await env.DB.batch([
      markDecided("rejected"),
      auditStmt(env, { actor, action: "request_reject", entity: "request", entityId: id, after: { employee: r.name, kind: r.kind, day: r.day }, reason: decisionNote })
    ]);
    await later(ctx, announceDecision(env, id));
    return { ok: true };
  }
  const reason = `Correction request #${id} (${r.requested_by}): ${r.reason}`.slice(0, 500);
  const stmts = [markDecided("approved")];
  let punch = null;
  if (r.kind !== "add") {
    punch = await getPunch(env, r.punch_id);
    if (!punch || punch.voided) return { error: "That punch has already been changed since the request. Reject this one and check the timesheet." };
    stmts.push(
      env.DB.prepare("UPDATE punches SET voided = 1, voided_at = ?, voided_by = ?, void_reason = ? WHERE id = ? AND voided = 0").bind(now, actor, reason, punch.id)
    );
  }
  if (r.kind !== "remove") {
    const ts = zonedToEpoch(r.day, r.time);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO punches (employee_id, ts, kind, note, source, actor, recorded_at, replaces_id, request_id)
         VALUES (?, ?, ?, ?, 'admin', ?, ?, ?, ?)`
      ).bind(r.employee_id, ts, r.punch_kind, r.note || (punch ? punch.note : ""), actor, now, punch ? punch.id : null, id),
      env.DB.prepare("UPDATE correction_requests SET result_punch_id = last_insert_rowid() WHERE id = ?").bind(id)
    );
  }
  stmts.push(
    auditStmt(env, {
      actor,
      action: "request_approve",
      entity: "request",
      entityId: id,
      before: punch ? { day: localDate(punch.ts), time: localHHMM(punch.ts), kind: punch.kind, note: punch.note } : void 0,
      after: { employee: r.name, kind: r.kind, day: r.day, time: r.time, punch_kind: r.punch_kind, requested_by: r.requested_by },
      reason: decisionNote || r.reason
    })
  );
  await env.DB.batch(stmts);
  await later(ctx, announceDecision(env, id));
  return { ok: true };
}
export async function withdrawRequest(env, id, emp, by, ctx) {
  const r = await getRequest(env, id);
  if (!r || r.employee_id !== emp.id) return { error: "Request not found" };
  if (r.status !== "pending") return { error: `Request #${id} was already ${r.status}` };
  await env.DB.batch([
    env.DB.prepare("UPDATE correction_requests SET status = 'withdrawn', decided_at = ? WHERE id = ? AND status = 'pending'").bind(Date.now(), id),
    auditStmt(env, { actor: by, action: "request_withdraw", entity: "request", entityId: id, after: { employee: r.name } })
  ]);
  await later(ctx, announceDecision(env, id));
  return { ok: true };
}
export async function listRequests(env, { status, employeeId, sinceDays = 60 } = {}) {
  const conds = ["r.requested_at >= ?"];
  const binds = [Date.now() - sinceDays * 864e5];
  if (status) {
    conds.push("r.status = ?");
    binds.push(status);
  }
  if (employeeId) {
    conds.push("r.employee_id = ?");
    binds.push(employeeId);
  }
  const rows = (await env.DB.prepare(
    `SELECT r.*, e.name, p.ts AS punch_ts, p.kind AS punch_old_kind
       FROM correction_requests r JOIN employees e ON e.id = r.employee_id
       LEFT JOIN punches p ON p.id = r.punch_id
       WHERE ${conds.join(" AND ")} ORDER BY r.status = 'pending' DESC, r.requested_at DESC LIMIT 500`
  ).bind(...binds).all()).results;
  return rows.map((r) => ({
    ...r,
    summary: describeRequest(r, r.punch_ts ? { ts: r.punch_ts, kind: r.punch_old_kind } : null)
  }));
}
export async function slackIdentity(env, slackUserId) {
  const emp = await employeeForSlack(env, slackUserId);
  return { emp, admin: !!(emp && emp.email && isAdmin({ email: emp.email.toLowerCase() }, env)) };
}
export function later(ctx, promise) {
  if (ctx) {
    ctx.waitUntil(promise);
    return void 0;
  }
  return promise;
}
