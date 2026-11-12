import { ADMIN_HTML } from "./admin-html.js";
import { handleAdmin, timesheet } from "./admin.js";
import { askAboutOpenDays, clock, runTick } from "./alerts.js";
import { getIdentity, isAdmin } from "./auth.js";
import { BOARD_HTML } from "./board-html.js";
import { auditStmt, boardEmployees, findEmployeeByName, getEmployee, getSettings, recordTick, setStatus, signIn, startPto } from "./db.js";
import { MY_TIME_HTML } from "./my-time-html.js";
import { REQUEST_WINDOW_DAYS, announceRequest, createRequest, decideRequest, employeeForEmail, employeeForSlack, listRequests, slackIdentity, withdrawRequest } from "./requests.js";
import { slackPost } from "./slack-api.js";
import { addDays, hhmmToMinutes, isValidDay, localDate, localParts, prettyDate, teamClock, teamWeekday } from "./time.js";

function returnPresets(settings, now = /* @__PURE__ */ new Date()) {
  const shifted = (hours2) => new Date(now.getTime() + hours2 * 60 * 60 * 1e3);
  const inOne = teamClock(shifted(1));
  const inTwo = teamClock(shifted(2));
  const nextDay = `${teamWeekday(shifted(24))} 9:00 AM`;
  const presets = [
    { label: `+1 hour (${inOne})`, value: inOne },
    { label: `+2 hours (${inTwo})`, value: inTwo },
    { label: nextDay, value: nextDay }
  ];
  const mins2 = localParts(now).minutes;
  if (mins2 >= hhmmToMinutes(settings.lunch_window_start) - 30 && mins2 <= hhmmToMinutes(settings.lunch_window_end)) {
    const back = teamClock(shifted(0.5));
    presets.unshift({ label: `Lunch (back ${back})`, value: `Lunch, back ${back}` });
  }
  return presets;
}
async function verifySlackSignature(body, headers, signingSecret) {
  const timestamp = headers.get("x-slack-request-timestamp");
  const signature = headers.get("x-slack-signature");
  if (!timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1e3 - Number(timestamp)) > 300) return false;
  const baseString = `v0:${timestamp}:${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(baseString));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return signature === `v0=${hex}`;
}
function parseFormData(body) {
  const params = new URLSearchParams(body);
  return params;
}
function buildBoardTable(employees) {
  if (employees.length === 0) {
    return "No employees on the board yet.";
  }
  const nameWidth = Math.max(12, ...employees.map((e) => e.name.length)) + 2;
  const returnWidth = Math.max(11, ...employees.map((e) => e.status !== "in" && e.returnTime ? e.returnTime.length : 0)) + 2;
  const pad = (s, w) => s + " ".repeat(Math.max(0, w - s.length));
  const hr = `+${"-".repeat(nameWidth + 2)}+----------+${"-".repeat(returnWidth + 2)}+`;
  let table = "```\n";
  table += hr + "\n";
  table += `| ${pad("Name", nameWidth)} | Status   | ${pad("Return", returnWidth)} |
`;
  table += hr + "\n";
  for (const e of employees) {
    const status = e.status === "in" ? "IN     " : e.status === "pto" ? "PTO    " : "OUT    ";
    const ret = e.status !== "in" && e.returnTime ? e.returnTime : "";
    table += `| ${pad(e.name, nameWidth)} | ${status}  | ${pad(ret, returnWidth)} |
`;
  }
  table += hr + "\n";
  table += "```";
  return table;
}
function buildBoardBlocks(employees, showButtons) {
  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: "In / Out Board", emoji: true }
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: buildBoardTable(employees) }
    }
  ];
  if (showButtons && employees.length > 0) {
    const buttons = [];
    for (const e of employees) {
      if (e.status === "pto") {
        buttons.push({
          type: "button",
          text: { type: "plain_text", text: `${e.name} - PTO` },
          action_id: `pto_end_${e.id}`,
          value: e.id
        });
      } else if (e.status === "in") {
        buttons.push({
          type: "button",
          text: { type: "plain_text", text: `${e.name} - IN` },
          style: "primary",
          action_id: `sign_out_${e.id}`,
          value: e.id
        });
      } else {
        buttons.push({
          type: "button",
          text: { type: "plain_text", text: `${e.name} - OUT` },
          style: "danger",
          action_id: `sign_in_${e.id}`,
          value: e.id
        });
      }
    }
    for (let i = 0; i < buttons.length; i += 5) {
      blocks.push({
        type: "actions",
        elements: buttons.slice(i, i + 5)
      });
    }
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: ":palm_tree: Going on PTO", emoji: true },
          action_id: "pto_open",
          value: "pto"
        }
      ]
    });
  }
  return blocks;
}
function buildPtoModal(employees, preselectId, responseUrl, clickedLine) {
  const choices = employees.filter((e) => e.status !== "pto");
  const options = choices.slice(0, 100).map((e) => ({ text: { type: "plain_text", text: e.name }, value: e.id }));
  const initial = options.find((o) => o.value === preselectId);
  return {
    type: "modal",
    callback_id: "pto_modal",
    title: { type: "plain_text", text: "Going on PTO" },
    submit: { type: "plain_text", text: "Start PTO" },
    close: { type: "plain_text", text: "Cancel" },
    private_metadata: JSON.stringify({ responseUrl, clickedLine }),
    blocks: [
      {
        type: "input",
        block_id: "pto_person",
        label: { type: "plain_text", text: "Who" },
        element: {
          type: "static_select",
          action_id: "person",
          placeholder: { type: "plain_text", text: "Pick a person" },
          options,
          ...initial ? { initial_option: initial } : {}
        }
      },
      {
        type: "input",
        block_id: "pto_return",
        label: { type: "plain_text", text: "First day back" },
        hint: { type: "plain_text", text: "PTO starts today and covers every work day before this date." },
        element: {
          type: "datepicker",
          action_id: "return_day",
          initial_date: addDays(localDate(Date.now()), 1),
          placeholder: { type: "plain_text", text: "Pick a date" }
        }
      },
      {
        type: "input",
        block_id: "pto_note",
        optional: true,
        label: { type: "plain_text", text: "Note" },
        element: {
          type: "plain_text_input",
          action_id: "note",
          max_length: 150,
          placeholder: { type: "plain_text", text: "e.g. vacation, sick, family" }
        }
      }
    ]
  };
}
var mrkdwnSection = (text) => ({ type: "section", text: { type: "mrkdwn", text } });
var changeBlocks = (changeMsg, employees) => [mrkdwnSection(changeMsg), ...buildBoardBlocks(employees, true)];
function changeLineOf(message) {
  const first = message?.blocks?.[0];
  const line = first?.type === "section" ? first.text?.text || "" : "";
  return line.length <= 1e3 ? line : "";
}
async function postToResponseUrl(responseUrl, body) {
  try {
    const res = await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) console.error(`response_url ${body.replace_original ? "replace" : "post"} failed: ${res.status} ${await res.text()}`);
  } catch (err) {
    console.error(`response_url ${body.replace_original ? "replace" : "post"} failed`, err);
  }
}
function postBoardChange(ctx, responseUrl, changeMsg, employees, clickedLine) {
  if (!responseUrl) return;
  const retired = clickedLine ? { text: clickedLine, blocks: [mrkdwnSection(clickedLine)] } : { blocks: buildBoardBlocks(employees, false) };
  ctx.waitUntil((async () => {
    await postToResponseUrl(responseUrl, { response_type: "in_channel", replace_original: true, ...retired });
    await postToResponseUrl(responseUrl, {
      response_type: "in_channel",
      replace_original: false,
      text: changeMsg,
      blocks: changeBlocks(changeMsg, employees)
    });
  })());
}
var slackActor = (id, name) => `slack:${id || "?"}${name ? ` (${name})` : ""}`;
async function signInAndAsk(env, emp, source, actor, { self, ctx }) {
  const res = await signIn(env, emp, source, actor);
  const ask = res.clockedIn ? await askAboutOpenDays(env, emp, { self, ctx }) : null;
  return { ...res, ask };
}
var isMe = (emp, identity) => !!emp.email && emp.email.toLowerCase() === identity.email;
async function handleSlackCommand(formData, env, ctx) {
  const text = (formData.get("text") || "").trim();
  const actor = slackActor(formData.get("user_id"), formData.get("user_name"));
  if (!text) {
    return Response.json({
      response_type: "in_channel",
      blocks: buildBoardBlocks(await boardEmployees(env), true)
    });
  }
  if (/^fix\b/i.test(text)) {
    if (!await employeeForSlack(env, formData.get("user_id"))) {
      return Response.json({ response_type: "ephemeral", text: "Your Slack account isn't linked to anyone on the board. Use `/inout link Your Name` first." });
    }
    await openSlackView(env, formData.get("trigger_id"), buildRequestModal({}));
    return new Response("", { status: 200 });
  }
  const linkMatch = text.match(/^link\s+(.+)/i);
  if (linkMatch) {
    const userId = formData.get("user_id");
    const emp = await findEmployeeByName(env, linkMatch[1]);
    if (!emp) return Response.json({ response_type: "ephemeral", text: `"${linkMatch[1].trim()}" not found on the board.` });
    if (emp.slack_user_id === userId) return Response.json({ response_type: "ephemeral", text: `You're already linked to *${emp.name}*.` });
    if (emp.slack_user_id) {
      return Response.json({ response_type: "ephemeral", text: `*${emp.name}* is already linked to another Slack account. Ask an admin to change it.` });
    }
    const other = await env.DB.prepare("SELECT name FROM employees WHERE slack_user_id = ?").bind(userId).first();
    if (other) return Response.json({ response_type: "ephemeral", text: `Your Slack account is already linked to *${other.name}*. Ask an admin to change it.` });
    await env.DB.batch([
      env.DB.prepare("UPDATE employees SET slack_user_id = ? WHERE id = ? AND slack_user_id IS NULL").bind(userId, emp.id),
      auditStmt(env, { actor, action: "slack_link", entity: "employee", entityId: emp.id, after: { employee: emp.name, slack_user_id: userId } })
    ]);
    return Response.json({ response_type: "ephemeral", text: `Linked. Time-clock reminders for *${emp.name}* will come to you here.` });
  }
  const inMatch = text.match(/^in\s+(.+)/i);
  if (inMatch) {
    const name = inMatch[1].trim();
    const emp = await findEmployeeByName(env, name);
    if (!emp) {
      return Response.json({ response_type: "ephemeral", text: `"${name}" not found on the board.` });
    }
    const self = !!emp.slack_user_id && emp.slack_user_id === formData.get("user_id");
    const { endedPto, ask } = await signInAndAsk(env, emp, "slack", actor, { self, ctx });
    if (ask) ctx.waitUntil(openSlackView(env, formData.get("trigger_id"), buildRequestModal({ day: ask.day, punchKind: "out", ask })));
    const changeMsg = endedPto ? `*${emp.name}* is back from PTO and signed *in*.` : `*${emp.name}* is now signed *in*.`;
    return Response.json({ response_type: "in_channel", text: changeMsg, blocks: changeBlocks(changeMsg, await boardEmployees(env)) });
  }
  const outMatch = text.match(/^out\s+(.+)/i);
  if (outMatch) {
    const parts = outMatch[1];
    const backMatch = parts.match(/^(.+?)\s+(?:back|return|eta)\s+(.+)$/i);
    let name, returnTime;
    if (backMatch) {
      name = backMatch[1].trim();
      returnTime = backMatch[2].trim();
    } else {
      name = parts.trim();
      returnTime = "";
    }
    const emp = await findEmployeeByName(env, name);
    if (!emp) {
      return Response.json({ response_type: "ephemeral", text: `"${name}" not found on the board.` });
    }
    await setStatus(env, emp, "out", returnTime, "slack", actor);
    const retMsg = returnTime ? ` (back ${returnTime})` : "";
    const changeMsg = `*${emp.name}* is now signed *out*${retMsg}.`;
    return Response.json({ response_type: "in_channel", text: changeMsg, blocks: changeBlocks(changeMsg, await boardEmployees(env)) });
  }
  return Response.json({
    response_type: "ephemeral",
    text: [
      "*Usage:*",
      "`/inout` \u2014 Show the board",
      "`/inout in Sarah` \u2014 Sign Sarah in",
      "`/inout out Mike back 2:30 PM` \u2014 Sign Mike out, returning at 2:30 PM",
      "`/inout out Lisa back lunch 1 PM` \u2014 Mention lunch so the time clock records the break",
      "`/inout out Lisa` \u2014 Sign Lisa out (no return time)",
      "`/inout link Lisa` \u2014 Link your Slack account to Lisa for time-clock reminders",
      "`/inout fix` \u2014 Add a punch you missed (sent to an admin for approval)",
      "Going on PTO? Use the :palm_tree: *Going on PTO* button under the board."
    ].join("\n")
  });
}
function buildSignOutModal(empId, empName, responseUrl, clickedLine, settings) {
  return {
    type: "modal",
    callback_id: "sign_out_modal",
    title: { type: "plain_text", text: "Sign Out" },
    submit: { type: "plain_text", text: "Sign Out" },
    close: { type: "plain_text", text: "Cancel" },
    private_metadata: JSON.stringify({ empId, responseUrl, clickedLine }),
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `Signing out *${empName}*` }
      },
      {
        type: "input",
        block_id: "preset_block",
        optional: true,
        label: { type: "plain_text", text: "When will you return?" },
        element: {
          type: "static_select",
          action_id: "preset_input",
          placeholder: { type: "plain_text", text: "Pick a time" },
          options: returnPresets(settings).map((p) => ({
            text: { type: "plain_text", text: p.label },
            value: p.value
          }))
        }
      },
      {
        type: "input",
        block_id: "return_time_block",
        optional: true,
        label: { type: "plain_text", text: "Or type your own" },
        element: {
          type: "plain_text_input",
          action_id: "return_time_input",
          placeholder: { type: "plain_text", text: "e.g. 2:30 PM, lunch back 1 PM, Friday" }
        }
      }
    ]
  };
}
async function handleSlackInteract(formData, env, ctx) {
  const payload = JSON.parse(formData.get("payload"));
  const actor = slackActor(payload.user?.id, payload.user?.username || payload.user?.name);
  if (payload.type === "view_submission" && payload.view.callback_id === "pto_modal") {
    return handlePtoSubmission(payload, env, ctx, actor);
  }
  if (payload.type === "view_submission" && payload.view.callback_id === "req_modal") {
    return handleRequestSubmission(payload, env, ctx, actor);
  }
  if (payload.type === "view_submission" && payload.view.callback_id === "req_reject_modal") {
    const { id } = JSON.parse(payload.view.private_metadata || "{}");
    const { emp: me, admin } = await slackIdentity(env, payload.user?.id);
    if (!admin) return Response.json({ response_action: "errors", errors: { rej_note: "Only admins can reject requests." } });
    const res = await decideRequest(env, id, {
      approve: false,
      actor: me.email.toLowerCase(),
      actorEmpId: me.id,
      note: payload.view.state.values?.rej_note?.v?.value || "",
      ctx
    });
    if (res.error) return Response.json({ response_action: "errors", errors: { rej_note: res.error } });
    return Response.json({});
  }
  if (payload.type === "view_submission") {
    const meta = JSON.parse(payload.view.private_metadata);
    const submitted = payload.view.state.values || {};
    const typedTime = (submitted.return_time_block?.return_time_input?.value || "").trim();
    const pickedTime = submitted.preset_block?.preset_input?.selected_option?.value || "";
    const returnTime = typedTime || pickedTime;
    const emp2 = await getEmployee(env, meta.empId);
    if (!emp2 || !emp2.active) {
      return Response.json({ response_action: "errors", errors: { return_time_block: "Employee not found." } });
    }
    await setStatus(env, emp2, "out", returnTime, "slack", actor);
    const retMsg = returnTime ? ` (back ${returnTime})` : "";
    postBoardChange(ctx, meta.responseUrl, `*${emp2.name}* signed *out*${retMsg}.`, await boardEmployees(env), meta.clickedLine);
    return Response.json({});
  }
  const action = payload.actions[0];
  const actionId = action.action_id;
  const empId = action.value;
  const responseUrl = payload.response_url;
  const triggerId = payload.trigger_id;
  if (actionId === "req_open") {
    if (!await employeeForSlack(env, payload.user?.id)) {
      await ephemeral(responseUrl, "Your Slack account isn't linked to anyone on the board. Use `/inout link Your Name` first.");
      return new Response("", { status: 200 });
    }
    let prefill = {};
    try {
      prefill = JSON.parse(action.value || "{}");
    } catch (err) {
    }
    await openSlackView(env, triggerId, buildRequestModal({ day: prefill.d, punchKind: prefill.k }));
    return new Response("", { status: 200 });
  }
  if (actionId === "req_approve" || actionId === "req_reject") {
    const { emp: me, admin } = await slackIdentity(env, payload.user?.id);
    if (!admin) {
      await ephemeral(responseUrl, "Only admins can approve or reject time corrections. (Admins need their Slack account linked and their email set on the Employees tab.)");
      return new Response("", { status: 200 });
    }
    const id = Number(action.value);
    if (actionId === "req_reject") {
      await openSlackView(env, triggerId, buildRejectModal(id));
      return new Response("", { status: 200 });
    }
    const res = await decideRequest(env, id, { approve: true, actor: me.email.toLowerCase(), actorEmpId: me.id, ctx });
    if (res.error) await ephemeral(responseUrl, res.error);
    return new Response("", { status: 200 });
  }
  if (actionId === "pto_open") {
    const me = await env.DB.prepare("SELECT id FROM employees WHERE slack_user_id = ? AND active = 1").bind(payload.user?.id || "").first();
    await openSlackView(env, triggerId, buildPtoModal(await boardEmployees(env), me?.id, responseUrl, changeLineOf(payload.message)));
    return new Response("", { status: 200 });
  }
  const emp = await getEmployee(env, empId);
  if (!emp || !emp.active) {
    return Response.json({ replace_original: true, text: "Employee not found." });
  }
  if (actionId.startsWith("sign_in_") || actionId.startsWith("pto_end_")) {
    const self = !!emp.slack_user_id && emp.slack_user_id === payload.user?.id;
    const { endedPto, ask } = await signInAndAsk(env, emp, "slack", actor, { self, ctx });
    if (ask) ctx.waitUntil(openSlackView(env, triggerId, buildRequestModal({ day: ask.day, punchKind: "out", ask })));
    const changeMsg = endedPto ? `*${emp.name}* is back from PTO and signed *in*.` : `*${emp.name}* signed *in*.`;
    postBoardChange(ctx, responseUrl, changeMsg, await boardEmployees(env), changeLineOf(payload.message));
    return new Response("", { status: 200 });
  }
  if (actionId.startsWith("sign_out_")) {
    await openSlackView(env, triggerId, buildSignOutModal(empId, emp.name, responseUrl, changeLineOf(payload.message), await getSettings(env)));
    return new Response("", { status: 200 });
  }
  return Response.json({ replace_original: true, text: "Unknown action." });
}
async function openSlackView(env, triggerId, view) {
  if (!env.SLACK_BOT_TOKEN) {
    console.log(`[slack disabled] views.open ${view.callback_id}`);
    return;
  }
  const res = await fetch("https://slack.com/api/views.open", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.SLACK_BOT_TOKEN}` },
    body: JSON.stringify({ trigger_id: triggerId, view })
  });
  const body = await res.json().catch(() => ({}));
  if (!body.ok) console.error(`views.open ${view.callback_id} failed: ${body.error || res.status}`, JSON.stringify(body.response_metadata || {}));
}
function buildRequestModal({ day, punchKind, ask }) {
  const kinds = [
    { text: { type: "plain_text", text: "Clock-in (start)" }, value: "in" },
    { text: { type: "plain_text", text: "Clock-out (finish or break)" }, value: "out" }
  ];
  const today = localDate(Date.now());
  const others = ask && ask.otherDays ? ` You have ${ask.otherDays} more day${ask.otherDays > 1 ? "s" : ""} without a clock-out; use \`/inout fix\` again or *My time* on the web board.` : "";
  return {
    type: "modal",
    callback_id: "req_modal",
    title: { type: "plain_text", text: ask ? "Missing clock-out" : "Fix my time" },
    submit: { type: "plain_text", text: "Send for approval" },
    close: { type: "plain_text", text: ask ? "Later" : "Cancel" },
    blocks: [
      ...ask ? [{
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Your record for ${ask.dayText} has no clock-out* after your ${ask.clockedInText} clock-in. What time did you clock out?${others}`
        }
      }] : [],
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `Add a punch you missed in the last ${REQUEST_WINDOW_DAYS} days. An admin approves it before it goes on your record. To change or remove an existing punch, use *My time* on the web board.` }]
      },
      {
        type: "input",
        block_id: "req_day",
        label: { type: "plain_text", text: "Date" },
        element: { type: "datepicker", action_id: "v", initial_date: isValidDay(day) ? day : today }
      },
      {
        type: "input",
        block_id: "req_kind",
        label: { type: "plain_text", text: "Missing" },
        element: {
          type: "static_select",
          action_id: "v",
          options: kinds,
          ...punchKind ? { initial_option: kinds.find((k) => k.value === punchKind) } : {}
        }
      },
      {
        type: "input",
        block_id: "req_time",
        label: { type: "plain_text", text: "Time" },
        element: { type: "timepicker", action_id: "v", placeholder: { type: "plain_text", text: "e.g. 5:15 PM" } }
      },
      {
        type: "input",
        block_id: "req_note",
        optional: true,
        label: { type: "plain_text", text: "Note" },
        element: { type: "plain_text_input", action_id: "v", max_length: 100, placeholder: { type: "plain_text", text: 'Write "lunch" if this was a lunch break' } }
      },
      {
        type: "input",
        block_id: "req_reason",
        label: { type: "plain_text", text: "Why" },
        element: {
          type: "plain_text_input",
          action_id: "v",
          multiline: true,
          max_length: 500,
          placeholder: { type: "plain_text", text: "e.g. forgot to clock out, left at 5:15" },
          ...ask ? { initial_value: "Forgot to clock out" } : {}
        }
      }
    ]
  };
}
function buildRejectModal(requestId) {
  return {
    type: "modal",
    callback_id: "req_reject_modal",
    title: { type: "plain_text", text: "Reject correction" },
    submit: { type: "plain_text", text: "Reject" },
    close: { type: "plain_text", text: "Cancel" },
    private_metadata: JSON.stringify({ id: requestId }),
    blocks: [
      {
        type: "input",
        block_id: "rej_note",
        optional: true,
        label: { type: "plain_text", text: `Why not? (sent to the employee)` },
        element: { type: "plain_text_input", action_id: "v", multiline: true, max_length: 300 }
      }
    ]
  };
}
var ephemeral = (responseUrl, text) => responseUrl && fetch(responseUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ response_type: "ephemeral", replace_original: false, text })
}).catch((err) => console.error("Ephemeral reply failed", err));
async function handleRequestSubmission(payload, env, ctx, actor) {
  const v = payload.view.state.values || {};
  const emp = await employeeForSlack(env, payload.user?.id);
  if (!emp) return Response.json({ response_action: "errors", errors: { req_reason: "Your Slack account isn't linked to anyone on the board. Use /inout link Your Name first." } });
  const res = await createRequest(
    env,
    emp,
    {
      kind: "add",
      day: v.req_day?.v?.selected_date,
      punch_kind: v.req_kind?.v?.selected_option?.value,
      time: v.req_time?.v?.selected_time,
      note: v.req_note?.v?.value || "",
      reason: v.req_reason?.v?.value || ""
    },
    { by: actor, via: "slack" }
  );
  if (res.error) {
    const field = /date|future|days/i.test(res.error) ? "req_day" : /time/i.test(res.error) ? "req_time" : /clock-in or/i.test(res.error) ? "req_kind" : "req_reason";
    return Response.json({ response_action: "errors", errors: { [field]: res.error } });
  }
  ctx.waitUntil((async () => {
    await announceRequest(env, res.id);
    await slackPost(env, emp.slack_user_id, `Sent for approval (request #${res.id}). You'll get a message here when an admin decides.`);
  })());
  return Response.json({});
}
async function handlePtoSubmission(payload, env, ctx, actor) {
  const meta = JSON.parse(payload.view.private_metadata || "{}");
  const values = payload.view.state.values || {};
  const empId = values.pto_person?.person?.selected_option?.value;
  const returnDay = values.pto_return?.return_day?.selected_date;
  const note = (values.pto_note?.note?.value || "").trim();
  const emp = empId ? await getEmployee(env, empId) : null;
  if (!emp || !emp.active) {
    return Response.json({ response_action: "errors", errors: { pto_person: "Pick someone on the board." } });
  }
  const today = localDate(Date.now());
  if (!returnDay || returnDay <= today) {
    return Response.json({ response_action: "errors", errors: { pto_return: "Pick a day after today." } });
  }
  const res = await startPto(env, emp, { startDay: today, returnDay, note, source: "slack", actor });
  if (res.error) return Response.json({ response_action: "errors", errors: { pto_return: res.error } });
  const employees = await boardEmployees(env);
  const changeMsg = `:palm_tree: *${emp.name}* is on PTO, back *${prettyDate(returnDay)}*.`;
  postBoardChange(ctx, meta.responseUrl, changeMsg, employees, meta.clickedLine);
  return Response.json({});
}
async function runScheduled(env, now) {
  try {
    const result = await runTick(env, now);
    await recordTick(env, {
      at: now,
      ok: true,
      ms: Date.now() - now,
      raised: result.raised.length,
      dms: result.dms,
      summary: result.summaryPosted
    });
    return result;
  } catch (err) {
    console.error("Scheduled tick failed", err);
    await recordTick(env, { at: now, ok: false, error: String(err?.message || err).slice(0, 300) }).catch(() => {
    });
    throw err;
  }
}
var noStore = { "Cache-Control": "no-store" };
var json = (data, status = 200) => Response.json(data, { status, headers: noStore });
function page(html, status = 200) {
  return new Response(html, { status, headers: { "Content-Type": "text/html;charset=UTF-8", ...noStore } });
}
export default {
  // Every 15 minutes. runTick() decides what, if anything, is due: the
  // midnight board reset in the 00:xx tick, and alerts only inside business
  // hours. Working from the real Denver clock keeps it right across DST.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduled(env, Date.now()));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    if ((path === "/slack/command" || path === "/slack/interact") && method === "POST") {
      const body = await request.text();
      if (env.SLACK_SIGNING_SECRET) {
        const valid = await verifySlackSignature(body, request.headers, env.SLACK_SIGNING_SECRET);
        if (!valid) return new Response("Invalid signature", { status: 401 });
      } else if (env.DEV_MODE !== "1") {
        return new Response("Slack signing secret not configured", { status: 503 });
      }
      const formData = parseFormData(body);
      if (path === "/slack/command") {
        return handleSlackCommand(formData, env, ctx);
      }
      return handleSlackInteract(formData, env, ctx);
    }
    if (path === "/__dev/tick" && env.DEV_MODE === "1") {
      const at = url.searchParams.get("at");
      return json(await runScheduled(env, at ? Date.parse(at) : Date.now()));
    }
    if (path === "/" || path === "/index.html") return page(BOARD_HTML);
    if (path === "/me") return page(MY_TIME_HTML);
    const identity = await getIdentity(request, env);
    const admin = isAdmin(identity, env);
    if (path === "/admin") {
      if (!identity) return page("<h1>Sign-in required</h1>", 401);
      if (!admin) return page(`<h1>Admins only</h1><p>${identity.email} is not an admin. <a href="/">Back to the board</a></p>`, 403);
      return page(ADMIN_HTML);
    }
    if (!path.startsWith("/api/")) return new Response("Not found", { status: 404 });
    if (!identity) return json({ error: "Sign-in required" }, 401);
    if (path.startsWith("/api/admin/")) {
      if (!admin) return json({ error: "Admins only" }, 403);
      const res = await handleAdmin(request, env, url, identity.email);
      res.headers.set("Cache-Control", "no-store");
      return res;
    }
    if (path === "/api/me" && method === "GET") {
      const me = await employeeForEmail(env, identity.email);
      return json({ email: identity.email, isAdmin: admin, employee: me ? { id: me.id, name: me.name } : null });
    }
    if (path.startsWith("/api/me/")) {
      const me = await employeeForEmail(env, identity.email);
      if (!me) {
        return json({ error: `${identity.email} isn't set as anyone's email on the board. Ask an admin to add it on the Employees tab.` }, 404);
      }
      if (path === "/api/me/time" && method === "GET") {
        const today = localDate(Date.now());
        const from = addDays(today, -REQUEST_WINDOW_DAYS);
        const { rows, punches } = await timesheet(env, { from, to: today, employeeIds: [me.id] });
        return json({
          employee: { id: me.id, name: me.name },
          from,
          to: today,
          windowDays: REQUEST_WINDOW_DAYS,
          rows,
          punches: punches.map(({ id, ts, kind, note, source, voided, replaces_id, request_id }) => ({ id, ts, kind, note, source, voided, replaces_id, request_id })),
          requests: await listRequests(env, { employeeId: me.id, sinceDays: 60 })
        });
      }
      if (path === "/api/me/requests" && method === "POST") {
        const body = await request.json().catch(() => ({}));
        const res = await createRequest(env, me, body, { by: identity.email, via: "web" });
        if (res.error) return json({ error: res.error }, 400);
        ctx.waitUntil(announceRequest(env, res.id));
        return json(res);
      }
      const wd = path.match(/^\/api\/me\/requests\/(\d+)\/withdraw$/);
      if (wd && method === "POST") {
        const res = await withdrawRequest(env, Number(wd[1]), me, identity.email, ctx);
        return res.error ? json({ error: res.error }, 400) : json(res);
      }
      return json({ error: "Not found" }, 404);
    }
    if (path === "/api/return-presets" && method === "GET") {
      return json(returnPresets(await getSettings(env)));
    }
    if (path === "/api/employees" && method === "GET") {
      return json(await boardEmployees(env));
    }
    if (path.startsWith("/api/employees/") && method === "PUT") {
      const id = path.split("/")[3];
      const { status, returnTime } = await request.json().catch(() => ({}));
      if (!["in", "out"].includes(status)) {
        return json({ error: "Invalid status" }, 400);
      }
      const emp = await getEmployee(env, id);
      if (!emp || !emp.active) return json({ error: "Not found" }, 404);
      if (status === "in") {
        const { ask } = await signInAndAsk(env, emp, "web", identity.email, { self: isMe(emp, identity), ctx });
        return json({ ok: true, ask });
      }
      await setStatus(env, emp, status, typeof returnTime === "string" ? returnTime : "", "web", identity.email);
      return json({ ok: true });
    }
    const ptoMatch = path.match(/^\/api\/employees\/([\w-]+)\/(pto|pto-end)$/);
    if (ptoMatch && method === "POST") {
      const emp = await getEmployee(env, ptoMatch[1]);
      if (!emp || !emp.active) return json({ error: "Not found" }, 404);
      if (ptoMatch[2] === "pto-end") {
        const { ask } = await signInAndAsk(env, emp, "web", identity.email, { self: isMe(emp, identity), ctx });
        return json({ ok: true, ask });
      }
      const { returnDay, note } = await request.json().catch(() => ({}));
      const today = localDate(Date.now());
      if (!isValidDay(returnDay) || returnDay <= today) return json({ error: "Pick a return day after today" }, 400);
      const res = await startPto(env, emp, { startDay: today, returnDay, note, source: "web", actor: identity.email });
      return res.error ? json({ error: res.error }, 400) : json(res);
    }
    return json({ error: "Not found" }, 404);
  }
};
