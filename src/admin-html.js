export const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Time Clock Admin</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f2f5; color: #1a1a1a; padding: 20px; font-size: 14px; }
  .container { max-width: 1200px; margin: 0 auto; }
  header { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
  h1 { font-size: 1.5rem; }
  .who { color: #666; font-size: 0.85rem; }
  .who a { color: #0b5ed7; text-decoration: none; font-weight: 600; margin-left: 10px; }
  .tabs { display: flex; gap: 4px; margin-bottom: 12px; flex-wrap: wrap; }
  .tab { padding: 8px 16px; border-radius: 8px 8px 0 0; background: #e2e6ea; border: none; cursor: pointer; font-weight: 600; font-size: 0.9rem; }
  .tab.active { background: #1a1a2e; color: #fff; }
  .panel { display: none; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); padding: 16px; }
  .panel.active { display: block; }
  .toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; margin-bottom: 12px; }
  .toolbar label { display: flex; flex-direction: column; font-size: 0.75rem; color: #666; text-transform: uppercase; letter-spacing: 0.4px; gap: 3px; }
  .toolbar .check { flex-direction: row; align-items: center; gap: 6px; text-transform: none; font-size: 0.9rem; color: #1a1a1a; }
  .spacer { flex: 1; }
  input, select, textarea { padding: 6px 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 0.9rem; font-family: inherit; }
  input[type=checkbox] { padding: 0; }
  .btn { padding: 7px 14px; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 600; background: #0b5ed7; color: #fff; white-space: nowrap; }
  .btn:hover { opacity: 0.88; }
  .btn-light { background: #e9ecef; color: #1a1a1a; }
  .btn-danger { background: #dc3545; }
  .btn-sm { padding: 4px 9px; font-size: 0.78rem; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 8px 10px; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.4px; color: #555; border-bottom: 2px solid #ddd; white-space: nowrap; }
  td { padding: 7px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
  tr.detail > td { background: #f8f9fb; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .muted { color: #888; }
  .flag { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.72rem; font-weight: 700; margin: 1px 2px 1px 0; white-space: nowrap; }
  .flag-bad { background: #f8d7da; color: #721c24; }
  .flag-warn { background: #fff3cd; color: #856404; }
  .flag-info { background: #e2e3e5; color: #383d41; }
  .flag-ok { background: #d4edda; color: #155724; }
  .voided td { text-decoration: line-through; color: #999; }
  .voided td.keep { text-decoration: none; }
  .punches { width: auto; min-width: 70%; }
  .punches td, .punches th { padding: 4px 8px; font-size: 0.85rem; }
  .empty { text-align: center; padding: 30px; color: #999; }
  .json { font-family: ui-monospace, Consolas, monospace; font-size: 0.75rem; color: #444; word-break: break-word; max-width: 420px; }
  .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 100; align-items: center; justify-content: center; padding: 16px; }
  .modal-overlay.active { display: flex; }
  .modal { background: #fff; border-radius: 12px; padding: 20px; width: 420px; max-width: 100%; }
  .modal h3 { margin-bottom: 12px; }
  .modal .field { display: flex; flex-direction: column; gap: 3px; margin-bottom: 10px; font-size: 0.8rem; color: #555; }
  .modal .row { display: flex; gap: 10px; }
  .modal .row .field { flex: 1; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
  .err { color: #b02a37; font-size: 0.85rem; min-height: 1.1em; margin-bottom: 6px; }
  .settings { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px 20px; }
  .settings .field { display: flex; flex-direction: column; gap: 4px; font-size: 0.8rem; color: #555; }
  .settings .hint { font-size: 0.75rem; color: #888; }
  .settings input:not([type=checkbox]), .settings textarea { width: 100%; min-width: 0; }
  .settings .pair { display: flex; gap: 6px; }
  .settings .pair input { flex: 1 1 0; }
  .days { display: flex; flex-wrap: wrap; gap: 4px 10px; }
  .days label { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; font-size: 0.85rem; color: #1a1a1a; }
  .emp-table th, .emp-table td { padding: 7px 4px; }
  .emp-table th { font-size: 0.68rem; letter-spacing: 0.2px; }
  .emp-table input[type=text], .emp-table input[type=email] { width: 100%; min-width: 70px; }
  .emp-table input[data-f=email] { min-width: 120px; }
  .emp-table input[data-f=slack_user_id] { min-width: 95px; }
  .emp-table input[type=time] { width: 88px; padding: 6px 4px; }
  .btn-pto { background: #e7f1ff; color: #0b5ed7; }
  .count { display: inline-block; min-width: 18px; padding: 0 6px; border-radius: 9px; background: #dc3545; color: #fff; font-size: 0.72rem; line-height: 18px; margin-left: 4px; }
  .banner { background: #f8d7da; color: #721c24; border: 1px solid #f1aeb5; border-radius: 8px; padding: 10px 14px; margin-bottom: 12px; font-size: 0.9rem; }
  .tick-line { font-size: 0.9rem; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #eee; }
  .tick-ok { color: #155724; font-weight: 600; }
  .tick-bad { color: #b02a37; font-weight: 600; }
  .wd { display: flex; align-items: center; gap: 2px; white-space: nowrap; }
  .wd label { display: flex; flex-direction: column; align-items: center; font-size: 0.7rem; color: #555; }
  .wd-def { font-size: 0.7rem; margin-left: 4px; }
  .people { display: flex; flex-wrap: wrap; gap: 6px 16px; }
  .people label { display: flex; align-items: center; gap: 6px; font-size: 0.9rem; min-width: 140px; }
  .seg-work { color: #155724; font-weight: 600; }
  .seg-lunch { color: #0b5ed7; font-weight: 600; }
  .seg-out { color: #856404; font-weight: 600; }
  .note { background: #f1f5ff; border-left: 3px solid #0b5ed7; padding: 8px 12px; margin-bottom: 12px; font-size: 0.85rem; color: #333; border-radius: 4px; }
  @media (max-width: 640px) { body { padding: 10px; } .panel { padding: 10px; } }
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>Time Clock Admin</h1>
    <div class="who"><span id="who"></span><a href="/">Board</a></div>
  </header>
  <div class="banner" id="tickBanner" hidden></div>
  <div class="tabs">
    <button class="tab active" data-tab="timesheets">Timesheets</button>
    <button class="tab" data-tab="requests">Requests <span class="count" id="reqCount" hidden></span></button>
    <button class="tab" data-tab="export">Export</button>
    <button class="tab" data-tab="employees">Employees</button>
    <button class="tab" data-tab="audit">Audit log</button>
    <button class="tab" data-tab="settings">Settings</button>
  </div>

  <section class="panel active" id="panel-timesheets">
    <div class="toolbar">
      <label>From <input type="date" id="tsFrom"></label>
      <label>To <input type="date" id="tsTo"></label>
      <label>Employee <select id="tsEmp"><option value="">Everyone</option></select></label>
      <label class="check"><input type="checkbox" id="tsExceptions"> Exceptions only</label>
      <button class="btn" id="tsLoad">Load</button>
      <span class="spacer"></span>
      <button class="btn btn-light" id="exDaily">Export daily CSV</button>
      <button class="btn btn-light" id="exPunches">Export punches CSV</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Employee</th><th>In</th><th>Out</th><th>Lunch</th><th class="num">Hours worked</th><th class="num" title="Hours worked plus lunch, lunch counted up to 1 hour">Total hours</th><th>Flags</th><th></th></tr></thead>
        <tbody id="tsBody"><tr><td colspan="9" class="empty">Loading...</td></tr></tbody>
      </table>
    </div>
  </section>

  <section class="panel" id="panel-requests">
    <div class="toolbar" style="align-items:center">
      <label class="check"><input type="radio" name="reqFilter" value="pending" checked> Waiting</label>
      <label class="check"><input type="radio" name="reqFilter" value="" > All (last 90 days)</label>
      <span class="spacer"></span>
      <span class="muted" style="font-size:0.8rem">Employees ask from My time or Slack. You can't decide your own requests.</span>
    </div>
    <div class="err" id="reqErr"></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Asked</th><th>Employee</th><th>Change</th><th>Why</th><th>Status</th><th></th></tr></thead>
        <tbody id="reqBody"><tr><td colspan="6" class="empty">Loading...</td></tr></tbody>
      </table>
    </div>
  </section>

  <section class="panel" id="panel-export">
    <div class="toolbar">
      <label>From <input type="date" id="exFrom"></label>
      <label>To <input type="date" id="exTo"></label>
      <button class="btn btn-light btn-sm" data-range="thisweek">This week</button>
      <button class="btn btn-light btn-sm" data-range="lastweek">Last week</button>
      <button class="btn btn-light btn-sm" data-range="thismonth">This month</button>
      <button class="btn btn-light btn-sm" data-range="lastmonth">Last month</button>
    </div>
    <div class="toolbar" style="align-items:center">
      <strong style="font-size:0.85rem">People</strong>
      <button class="btn btn-light btn-sm" id="exAll">Select all</button>
      <button class="btn btn-light btn-sm" id="exNone">Clear</button>
      <label class="check"><input type="checkbox" id="exInactive"> Show inactive</label>
    </div>
    <div class="people" id="exPeople"></div>
    <div class="toolbar" style="margin-top:12px">
      <button class="btn" id="exShifts">Download shifts CSV</button>
      <button class="btn btn-light" id="exPreview">Preview</button>
      <span class="spacer"></span>
      <button class="btn btn-light btn-sm" id="exDaily2">Daily summary CSV</button>
      <button class="btn btn-light btn-sm" id="exPunches2">Raw punches CSV</button>
    </div>
    <div class="err" id="exErr"></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Employee</th><th>Date</th><th>Start</th><th>End</th><th>Type</th><th class="num">Duration</th><th>Note</th></tr></thead>
        <tbody id="exBody"><tr><td colspan="7" class="empty">Pick people and dates, then Preview or Download.</td></tr></tbody>
      </table>
    </div>
  </section>

  <section class="panel" id="panel-employees">
    <div class="note">Work days and shift times are optional: untouched, they follow the company days and hours in Settings. Alerts for a person only go out on their own work days, during their own shift.
      To find a Slack member ID, open their Slack profile, click the three dots, then "Copy member ID". People can also link themselves by typing <code>/inout link Their Name</code>.</div>
    <div class="toolbar">
      <label>Name <input type="text" id="newName" maxlength="100"></label>
      <label>Email <input type="email" id="newEmail"></label>
      <label>Slack member ID <input type="text" id="newSlack" placeholder="U0123ABCD"></label>
      <label>Shift start <input type="time" id="newStart"></label>
      <label>Shift end <input type="time" id="newEnd"></label>
      <button class="btn" id="addEmp">Add person</button>
    </div>
    <div class="err" id="empErr"></div>
    <div class="table-wrap">
      <table class="emp-table">
        <thead><tr><th>Name</th><th>Email</th><th>Slack ID</th><th>Work days</th><th>Shift start</th><th>Shift end</th><th>Tracked</th><th>Active</th><th>Board</th><th>PTO</th><th></th></tr></thead>
        <tbody id="empBody"></tbody>
      </table>
    </div>
  </section>

  <section class="panel" id="panel-audit">
    <div class="toolbar">
      <label>From <input type="date" id="auFrom"></label>
      <label>To <input type="date" id="auTo"></label>
      <button class="btn" id="auLoad">Load</button>
      <span class="spacer"></span>
      <button class="btn btn-light" id="exAudit">Export audit CSV</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Change</th><th>Reason</th></tr></thead>
        <tbody id="auBody"></tbody>
      </table>
    </div>
  </section>

  <section class="panel" id="panel-settings">
    <div class="tick-line" id="tickLine">Last scheduled check: checking...</div>
    <div class="settings" id="settingsForm"></div>
    <div class="err" id="setErr" style="margin-top:12px"></div>
    <button class="btn" id="saveSettings">Save settings</button>
  </section>
</div>

<div class="modal-overlay" id="modal">
  <div class="modal">
    <h3 id="modalTitle"></h3>
    <div id="modalBody"></div>
    <div class="err" id="modalErr"></div>
    <div class="modal-actions">
      <button class="btn btn-light" id="modalCancel">Cancel</button>
      <button class="btn" id="modalOk">Save</button>
    </div>
  </div>
</div>

<script>
var TZ = 'America/Denver';
var state = { employees: [], rows: [], punches: [], open: {} };

function $(id) { return document.getElementById(id); }
function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
function fmtTime(ts) { return ts ? new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(ts)) : ''; }
function hhmm(ts) { return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts)); }
function localDay(ts) { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts)); }
function prettyDay(d) { var p = d.split('-'); return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]))); }
function stamp(ts) { return localDay(ts) + ' ' + fmtTime(ts); }
function dur(min) { if (min == null) return ''; return Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0'); }
function addDays(d, n) { var p = d.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)).toISOString().slice(0, 10); }

async function api(method, path, body) {
  var res = await fetch('/api/admin' + path, {
    method: method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  var data = await res.json().catch(function () { return {}; });
  if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
  return data;
}

// ---------- tabs ----------
document.querySelectorAll('.tab').forEach(function (t) {
  t.addEventListener('click', function () {
    document.querySelectorAll('.tab').forEach(function (x) { x.classList.toggle('active', x === t); });
    document.querySelectorAll('.panel').forEach(function (p) { p.classList.toggle('active', p.id === 'panel-' + t.dataset.tab); });
    if (t.dataset.tab === 'audit') loadAudit();
    if (t.dataset.tab === 'requests') loadRequests();
    if (t.dataset.tab === 'settings') { loadSettings(); loadStatus(); }
    if (t.dataset.tab === 'employees') renderEmployees();
  });
});

// ---------- modal ----------
var modalOnOk = null;
function openModal(title, html, okLabel, onOk, danger) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = html;
  $('modalErr').textContent = '';
  $('modalOk').textContent = okLabel || 'Save';
  $('modalOk').className = 'btn' + (danger ? ' btn-danger' : '');
  modalOnOk = onOk;
  $('modal').classList.add('active');
  var first = $('modalBody').querySelector('input, select, textarea');
  if (first) first.focus();
}
function closeModal() { $('modal').classList.remove('active'); modalOnOk = null; }
$('modalCancel').addEventListener('click', closeModal);
$('modalOk').addEventListener('click', async function () {
  if (!modalOnOk) return;
  $('modalOk').disabled = true;
  try { await modalOnOk(); closeModal(); }
  catch (e) { $('modalErr').textContent = e.message; }
  finally { $('modalOk').disabled = false; }
});
function val(id) { var el = $(id); return el ? el.value.trim() : ''; }

// ---------- timesheets ----------
var FLAG = {
  missing_clock_out: ['No clock-out', 'flag-bad'],
  missing_clock_in: ['No clock-in', 'flag-bad'],
  no_punches: ['No punches', 'flag-bad'],
  no_lunch: ['No lunch recorded', 'flag-warn'],
  edited: ['Edited', 'flag-info'],
  open: ['Clocked in', 'flag-ok']
};
var EXCEPTIONS = ['missing_clock_out', 'missing_clock_in', 'no_punches', 'no_lunch'];

function rangeQuery(from, to, emp) {
  return '?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to) + (emp ? '&employee=' + encodeURIComponent(emp) : '');
}

async function loadTimesheet() {
  $('tsBody').innerHTML = '<tr><td colspan="9" class="empty">Loading...</td></tr>';
  try {
    var data = await api('GET', '/timesheet' + rangeQuery($('tsFrom').value, $('tsTo').value, $('tsEmp').value));
    state.rows = data.rows;
    state.punches = data.punches;
    renderTimesheet();
  } catch (e) {
    $('tsBody').innerHTML = '<tr><td colspan="9" class="empty">' + esc(e.message) + '</td></tr>';
  }
}

function renderTimesheet() {
  var rows = state.rows;
  if ($('tsExceptions').checked) rows = rows.filter(function (r) { return r.flags.some(function (f) { return EXCEPTIONS.indexOf(f) >= 0; }); });
  if (!rows.length) { $('tsBody').innerHTML = '<tr><td colspan="9" class="empty">Nothing in this range.</td></tr>'; return; }
  $('tsBody').innerHTML = rows.map(function (r) {
    var key = r.employee_id + '|' + r.day;
    var flags = r.flags.map(function (f) { var d = FLAG[f] || [f, 'flag-info']; return '<span class="flag ' + d[1] + '">' + d[0] + '</span>'; }).join('');
    if (r.off) flags = '<span class="flag flag-info">Off: ' + esc(r.off) + '</span>' + flags;
    var lunch = r.lunch
      ? fmtTime(r.lunch.start) + ' - ' + fmtTime(r.lunch.end) + ' <span class="muted">(' + r.lunch.minutes + 'm' + (r.lunch.basis === 'inferred' ? ', inferred' : '') + ')</span>'
      : '<span class="muted">-</span>';
    var html = '<tr>' +
      '<td>' + prettyDay(r.day) + '</td>' +
      '<td><strong>' + esc(r.name) + '</strong></td>' +
      '<td>' + fmtTime(r.first_in) + '</td>' +
      '<td>' + fmtTime(r.last_out) + '</td>' +
      '<td>' + lunch + '</td>' +
      '<td class="num">' + dur(r.on_clock_min) + '</td>' +
      '<td class="num">' + dur(r.total_min) + '</td>' +
      '<td>' + flags + '</td>' +
      '<td><button class="btn btn-light btn-sm" data-toggle="' + esc(key) + '">' + (state.open[key] ? 'Hide' : 'Details') + '</button></td>' +
      '</tr>';
    if (state.open[key]) html += '<tr class="detail"><td colspan="9">' + renderDetail(r) + '</td></tr>';
    return html;
  }).join('');
}

function renderDetail(r) {
  var list = state.punches.filter(function (p) { return p.employee_id === r.employee_id && localDay(p.ts) === r.day; });
  var body = list.length ? list.map(function (p) {
    var who = esc(p.actor) + ' <span class="muted">via ' + esc(p.source) + '</span>';
    var voidInfo = p.voided ? '<div class="muted" style="text-decoration:none">Voided by ' + esc(p.voided_by) + ': ' + esc(p.void_reason) + '</div>' : '';
    var actions = p.voided ? '' :
      '<button class="btn btn-light btn-sm" data-edit="' + p.id + '">Edit</button> ' +
      '<button class="btn btn-light btn-sm" data-void="' + p.id + '">Void</button>';
    return '<tr class="' + (p.voided ? 'voided' : '') + '">' +
      '<td>' + fmtTime(p.ts) + '</td>' +
      '<td>' + (p.kind === 'in' ? 'In' : 'Out') + '</td>' +
      '<td>' + esc(p.note) + '</td>' +
      '<td class="keep">' + who + voidInfo + (p.replaces_id ? '<div class="muted">Replaces #' + p.replaces_id + '</div>' : '') + (p.request_id ? '<div class="muted">Employee request #' + p.request_id + '</div>' : '') + '</td>' +
      '<td class="keep muted">#' + p.id + (p.source === 'admin' ? ' - entered ' + stamp(p.recorded_at) : '') + '</td>' +
      '<td class="keep">' + actions + '</td></tr>';
  }).join('') : '<tr><td colspan="6" class="muted">No punches.</td></tr>';
  var ctx = ' data-emp="' + esc(r.employee_id) + '" data-day="' + r.day + '"';
  return '<table class="punches"><thead><tr><th>Time</th><th>Type</th><th>Note</th><th>Recorded by</th><th>ID</th><th></th></tr></thead><tbody>' + body + '</tbody></table>' +
    '<div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap">' +
    '<button class="btn btn-sm" data-add="1"' + ctx + '>+ Add punch</button>' +
    (r.off
      ? '<button class="btn btn-light btn-sm" data-offclear="1"' + ctx + '>Clear day off</button>'
      : '<button class="btn btn-light btn-sm" data-offset="1"' + ctx + '>Mark day off</button>') +
    '</div>';
}

function punchForm(p) {
  return '<div class="row">' +
    '<div class="field">Date<input type="date" id="fDay" value="' + esc(p.day) + '"></div>' +
    '<div class="field">Time (Denver)<input type="time" id="fTime" value="' + esc(p.time || '') + '"></div>' +
    '<div class="field">Type<select id="fKind"><option value="in"' + (p.kind === 'in' ? ' selected' : '') + '>In</option><option value="out"' + (p.kind === 'out' ? ' selected' : '') + '>Out</option></select></div>' +
    '</div>' +
    '<div class="field">Note (write "lunch" to mark a lunch break)<input type="text" id="fNote" maxlength="100" value="' + esc(p.note || '') + '"></div>' +
    '<div class="field">Reason for this change (required, kept in the audit log)<textarea id="fReason" rows="2" maxlength="500"></textarea></div>';
}

$('tsBody').addEventListener('click', function (ev) {
  var b = ev.target.closest('button');
  if (!b) return;
  if (b.dataset.toggle) { state.open[b.dataset.toggle] = !state.open[b.dataset.toggle]; renderTimesheet(); return; }
  var emp = b.dataset.emp, day = b.dataset.day;
  if (b.dataset.add) {
    var name = (state.employees.find(function (e) { return e.id === emp; }) || {}).name || '';
    openModal('Add punch for ' + name, punchForm({ day: day, kind: 'out' }), 'Add punch', async function () {
      await api('POST', '/punches', { employee_id: emp, day: val('fDay'), time: val('fTime'), kind: val('fKind'), note: val('fNote'), reason: val('fReason') });
      await loadTimesheet();
    });
  }
  if (b.dataset.edit) {
    var p = state.punches.find(function (x) { return String(x.id) === b.dataset.edit; });
    openModal('Edit punch #' + p.id + ' (' + p.name + ')', punchForm({ day: localDay(p.ts), time: hhmm(p.ts), kind: p.kind, note: p.note }) +
      '<div class="muted" style="font-size:0.8rem">The original stays in the record, marked as replaced.</div>', 'Save correction', async function () {
      await api('PATCH', '/punches/' + p.id, { day: val('fDay'), time: val('fTime'), kind: val('fKind'), note: val('fNote'), reason: val('fReason') });
      await loadTimesheet();
    });
  }
  if (b.dataset.void) {
    var q = state.punches.find(function (x) { return String(x.id) === b.dataset.void; });
    openModal('Void punch #' + q.id, '<p style="margin-bottom:10px">' + esc(q.name) + ' - ' + (q.kind === 'in' ? 'In' : 'Out') + ' at ' + stamp(q.ts) +
      '. It stays in the record, marked as voided, and no longer counts toward hours.</p>' +
      '<div class="field">Reason (required)<textarea id="fReason" rows="2" maxlength="500"></textarea></div>', 'Void punch', async function () {
      await api('POST', '/punches/' + q.id + '/void', { reason: val('fReason') });
      await loadTimesheet();
    }, true);
  }
  if (b.dataset.offset) {
    openModal('Mark ' + prettyDay(day) + ' as a day off', '<div class="field">Note (e.g. PTO, sick)<input type="text" id="fNote" maxlength="200" value="PTO"></div>', 'Mark off', async function () {
      await api('POST', '/day-off', { employee_id: emp, day: day, note: val('fNote') });
      await loadTimesheet();
    });
  }
  if (b.dataset.offclear) {
    api('DELETE', '/day-off', { employee_id: emp, day: day }).then(loadTimesheet).catch(function (e) { alert(e.message); });
  }
});

$('tsLoad').addEventListener('click', loadTimesheet);
$('tsExceptions').addEventListener('change', renderTimesheet);
$('exDaily').addEventListener('click', function () { location.href = '/api/admin/export/daily.csv' + rangeQuery($('tsFrom').value, $('tsTo').value, $('tsEmp').value); });
$('exPunches').addEventListener('click', function () { location.href = '/api/admin/export/punches.csv' + rangeQuery($('tsFrom').value, $('tsTo').value, $('tsEmp').value); });

// ---------- employees ----------
async function loadEmployees() {
  state.employees = await api('GET', '/employees');
  var sel = $('tsEmp'), cur = sel.value;
  sel.innerHTML = '<option value="">Everyone</option>' + state.employees.map(function (e) {
    return '<option value="' + esc(e.id) + '">' + esc(e.name) + (e.active ? '' : ' (inactive)') + '</option>';
  }).join('');
  sel.value = cur;
  renderEmployees();
  renderPeople();
}

// ---------- export ----------
var exPicked = {};
function renderPeople() {
  var showInactive = $('exInactive').checked;
  $('exPeople').innerHTML = state.employees.filter(function (e) { return e.active || showInactive; }).map(function (e) {
    return '<label><input type="checkbox" data-person="' + esc(e.id) + '"' + (exPicked[e.id] ? ' checked' : '') + '> ' +
      esc(e.name) + (e.active ? '' : ' <span class="muted">(inactive)</span>') + '</label>';
  }).join('');
}
$('exPeople').addEventListener('change', function (ev) {
  var id = ev.target.dataset.person;
  if (id) exPicked[id] = ev.target.checked;
});
$('exInactive').addEventListener('change', renderPeople);
$('exAll').addEventListener('click', function () {
  document.querySelectorAll('[data-person]').forEach(function (el) { exPicked[el.dataset.person] = true; });
  renderPeople();
});
$('exNone').addEventListener('click', function () { exPicked = {}; renderPeople(); });

function pickedIds() {
  return Object.keys(exPicked).filter(function (id) { return exPicked[id]; });
}
// Nothing ticked means everyone; the server reads a missing list the same way.
function exportQuery() {
  var ids = pickedIds();
  return '?from=' + encodeURIComponent($('exFrom').value) + '&to=' + encodeURIComponent($('exTo').value) +
    (ids.length ? '&employees=' + encodeURIComponent(ids.join(',')) : '');
}

function setRange(kind) {
  var today = localDay(Date.now());
  var p = today.split('-');
  var dow = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
  var monday = addDays(today, -((dow + 6) % 7));
  var firstOfMonth = today.slice(0, 8) + '01';
  if (kind === 'thisweek') { $('exFrom').value = monday; $('exTo').value = today; }
  if (kind === 'lastweek') { $('exFrom').value = addDays(monday, -7); $('exTo').value = addDays(monday, -1); }
  if (kind === 'thismonth') { $('exFrom').value = firstOfMonth; $('exTo').value = today; }
  if (kind === 'lastmonth') {
    var lastDayPrev = addDays(firstOfMonth, -1);
    $('exFrom').value = lastDayPrev.slice(0, 8) + '01'; $('exTo').value = lastDayPrev;
  }
}
document.querySelectorAll('[data-range]').forEach(function (b) {
  b.addEventListener('click', function () { setRange(b.dataset.range); });
});

var SEG = { work: 'Work', lunch: 'Lunch', out: 'Out' };
$('exPreview').addEventListener('click', async function () {
  $('exErr').textContent = '';
  $('exBody').innerHTML = '<tr><td colspan="7" class="empty">Loading...</td></tr>';
  try {
    var data = await api('GET', '/timesheet' + exportQuery());
    var rows = data.rows.slice().sort(function (a, b) { return a.name.localeCompare(b.name) || (a.day < b.day ? -1 : a.day > b.day ? 1 : 0); });
    var html = [];
    rows.forEach(function (r) {
      if (r.off) html.push('<tr><td>' + esc(r.name) + '</td><td>' + prettyDay(r.day) + '</td><td></td><td></td><td class="muted">Day off</td><td></td><td>' + esc(r.off) + '</td></tr>');
      r.segments.forEach(function (s) {
        html.push('<tr><td>' + esc(r.name) + '</td><td>' + prettyDay(r.day) + '</td>' +
          '<td>' + fmtTime(s.start) + '</td><td>' + fmtTime(s.end) + '</td>' +
          '<td class="seg-' + s.type + '">' + SEG[s.type] + '</td>' +
          '<td class="num">' + dur(s.minutes) + '</td>' +
          '<td>' + esc(s.note) + (s.issue ? ' <span class="flag ' + (s.issue === 'in progress' ? 'flag-ok' : 'flag-bad') + '">' + esc(s.issue) + '</span>' : '') + '</td></tr>');
      });
    });
    $('exBody').innerHTML = html.join('') || '<tr><td colspan="7" class="empty">No shifts in this range.</td></tr>';
  } catch (e) {
    $('exBody').innerHTML = '';
    $('exErr').textContent = e.message;
  }
});
$('exShifts').addEventListener('click', function () { location.href = '/api/admin/export/shifts.csv' + exportQuery(); });
$('exDaily2').addEventListener('click', function () { location.href = '/api/admin/export/daily.csv' + exportQuery(); });
$('exPunches2').addEventListener('click', function () { location.href = '/api/admin/export/punches.csv' + exportQuery(); });

var DAY1 = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
function companyDays() { return (state.settings && state.settings.business_days) || [1, 2, 3, 4, 5]; }
function empDays(e) {
  try { var d = JSON.parse(e.work_days || 'null'); if (Array.isArray(d) && d.length) return d; } catch (err) {}
  return null;
}
function workDayBoxes(e) {
  var own = empDays(e), days = own || companyDays();
  return '<div class="wd" title="' + (own ? 'Own work days' : 'Company days (default)') + '">' + DAY1.map(function (l, i) {
    return '<label><input type="checkbox" data-wd="' + i + '"' + (days.indexOf(i) >= 0 ? ' checked' : '') + '>' + l + '</label>';
  }).join('') + (own ? '' : '<span class="muted wd-def">default</span>') + '</div>';
}
function shortDay(d) { var p = d.split('-'); return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]))); }
// One compact button either way, so a row never grows when someone goes on
// PTO. Details sit in the tooltip; clicking opens the form (which can end it).
function ptoCell(e) {
  var today = localDay(Date.now());
  if (!e.pto_return) return '<button class="btn btn-light btn-sm" data-pto="1">Set PTO</button>';
  var future = e.pto_start > today;
  var label = future ? 'PTO ' + shortDay(e.pto_start) : 'PTO \\u2192 ' + shortDay(e.pto_return);
  var tip = (future ? 'Scheduled ' + prettyDay(e.pto_start) + ', back ' : 'On PTO, back ') + prettyDay(e.pto_return) + (e.pto_note ? ' - ' + e.pto_note : '');
  return '<button class="btn btn-sm btn-pto" data-pto="1" title="' + esc(tip) + '">' + esc(label) + '</button>';
}

function renderEmployees() {
  $('empBody').innerHTML = state.employees.map(function (e) {
    return '<tr data-id="' + esc(e.id) + '">' +
      '<td><input type="text" data-f="name" maxlength="100" value="' + esc(e.name) + '"></td>' +
      '<td><input type="email" data-f="email" value="' + esc(e.email || '') + '"></td>' +
      '<td><input type="text" data-f="slack_user_id" value="' + esc(e.slack_user_id || '') + '" placeholder="U0123ABCD"></td>' +
      '<td>' + workDayBoxes(e) + '</td>' +
      '<td><input type="time" data-f="shift_start" value="' + esc(e.shift_start || '') + '"></td>' +
      '<td><input type="time" data-f="shift_end" value="' + esc(e.shift_end || '') + '"></td>' +
      '<td><input type="checkbox" data-f="track"' + (e.track ? ' checked' : '') + '></td>' +
      '<td><input type="checkbox" data-f="active"' + (e.active ? ' checked' : '') + '></td>' +
      '<td>' + (e.status === 'in' ? '<span class="flag flag-ok">In</span>' : '<span class="flag flag-info">Out</span>') + '</td>' +
      '<td>' + ptoCell(e) + '</td>' +
      '<td><button class="btn btn-sm" data-save="1">Save</button></td></tr>';
  }).join('') || '<tr><td colspan="11" class="empty">No one yet.</td></tr>';
}

$('empBody').addEventListener('click', async function (ev) {
  var pb = ev.target.closest('button[data-pto]');
  if (pb) { openPtoForm(pb.closest('tr').dataset.id); return; }
  var b = ev.target.closest('button[data-save]');
  if (!b) return;
  var tr = b.closest('tr');
  var body = {};
  tr.querySelectorAll('[data-f]').forEach(function (el) { body[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value.trim(); });
  // Work days that match the company's are stored as "default" so they follow Settings.
  var days = [];
  tr.querySelectorAll('[data-wd]').forEach(function (el) { if (el.checked) days.push(+el.dataset.wd); });
  if (!days.length) { $('empErr').textContent = 'Pick at least one work day.'; return; }
  body.work_days = days.join(',') === companyDays().slice().sort().join(',') ? null : days;
  var orig = state.employees.find(function (e) { return e.id === tr.dataset.id; });
  if (orig.active && !body.active) {
    var why = prompt('Deactivate ' + orig.name + '? They leave the board, and their time history is kept. Reason:');
    if (why === null) return;
    body.reason = why;
  }
  $('empErr').textContent = '';
  try { await api('PATCH', '/employees/' + tr.dataset.id, body); await loadEmployees(); b.textContent = 'Saved'; }
  catch (e) { $('empErr').textContent = e.message; }
});

function findEmp(id) { return state.employees.find(function (x) { return x.id === id; }); }

function openPtoEnd(id) {
  var e = findEmp(id);
  openModal('End PTO for ' + e.name,
    '<p style="margin-bottom:10px">PTO ends today. Remaining PTO days are cleared. ' + esc(e.name) + ' is not clocked in; they clock in as usual.</p>' +
    '<div class="field">Reason (optional, kept in the audit log)<textarea id="fReason" rows="2" maxlength="500"></textarea></div>', 'End PTO', async function () {
    await api('POST', '/employees/' + id + '/pto-end', { reason: val('fReason') });
    await loadEmployees();
  });
}

function openPtoForm(id) {
  var e = findEmp(id);
  var today = localDay(Date.now());
  openModal((e.pto_return ? 'Change PTO for ' : 'Set PTO for ') + e.name,
    '<div class="row">' +
    '<div class="field">First day of PTO<input type="date" id="fStart" value="' + esc(e.pto_start || today) + '"></div>' +
    '<div class="field">First day back<input type="date" id="fBack" value="' + esc(e.pto_return || addDays(today, 1)) + '"></div>' +
    '</div>' +
    '<div class="field">Note (optional)<input type="text" id="fNote" maxlength="150" value="' + esc(e.pto_note || '') + '" placeholder="e.g. vacation, sick"></div>' +
    '<div class="field">Reason (optional, kept in the audit log)<textarea id="fReason" rows="2" maxlength="500" placeholder="e.g. forgot to set it in Slack"></textarea></div>' +
    '<div class="muted" style="font-size:0.8rem">Each of their work days from the first day up to the day back is marked off. A start in the past is fine if they forgot.</div>' +
    (e.pto_return ? '<div style="margin-top:10px"><button class="btn btn-light btn-sm" id="fEndPto">End PTO now</button></div>' : ''),
    'Save PTO', async function () {
      await api('POST', '/employees/' + id + '/pto', { start_day: val('fStart'), return_day: val('fBack'), note: val('fNote'), reason: val('fReason') });
      await loadEmployees();
    });
  var endBtn = $('fEndPto');
  if (endBtn) endBtn.addEventListener('click', function () { closeModal(); openPtoEnd(id); });
}

$('addEmp').addEventListener('click', async function () {
  $('empErr').textContent = '';
  try {
    await api('POST', '/employees', { name: val('newName'), email: val('newEmail'), slack_user_id: val('newSlack'), shift_start: val('newStart'), shift_end: val('newEnd'), track: true });
    ['newName', 'newEmail', 'newSlack', 'newStart', 'newEnd'].forEach(function (id) { $(id).value = ''; });
    await loadEmployees();
  } catch (e) { $('empErr').textContent = e.message; }
});

// ---------- audit ----------
var ACTIONS = {
  punch_add: 'Added punch', punch_edit: 'Corrected punch', punch_void: 'Voided punch',
  employee_create: 'Added person', employee_update: 'Updated person', employee_deactivate: 'Deactivated person',
  day_off_set: 'Marked day off', day_off_clear: 'Cleared day off', settings_update: 'Changed settings',
  pto_start: 'Started PTO', pto_end: 'Ended PTO',
  request_create: 'Requested correction', request_approve: 'Approved correction', request_reject: 'Rejected correction', request_withdraw: 'Withdrew correction',
  export: 'Exported', status_restore: 'Restored board status', employee_import: 'Imported roster', midnight_sweep: 'Midnight board reset', slack_link: 'Linked Slack account'
};
function change(a) {
  var parts = [];
  if (a.before) parts.push('<div><span class="muted">before</span> ' + esc(a.before) + '</div>');
  if (a.after) parts.push('<div><span class="muted">after</span> ' + esc(a.after) + '</div>');
  return '<div class="json">' + parts.join('') + '</div>';
}
async function loadAudit() {
  $('auBody').innerHTML = '<tr><td colspan="5" class="empty">Loading...</td></tr>';
  try {
    var rows = await api('GET', '/audit' + rangeQuery($('auFrom').value, $('auTo').value));
    $('auBody').innerHTML = rows.map(function (a) {
      return '<tr><td style="white-space:nowrap">' + stamp(a.at) + '</td><td>' + esc(a.actor) + '</td>' +
        '<td>' + esc(ACTIONS[a.action] || a.action) + (a.entity ? ' <span class="muted">' + esc(a.entity) + (a.entity_id ? ' #' + esc(String(a.entity_id).slice(0, 8)) : '') + '</span>' : '') + '</td>' +
        '<td>' + change(a) + '</td><td>' + esc(a.reason || '') + '</td></tr>';
    }).join('') || '<tr><td colspan="5" class="empty">No activity in this range.</td></tr>';
  } catch (e) { $('auBody').innerHTML = '<tr><td colspan="5" class="empty">' + esc(e.message) + '</td></tr>'; }
}
$('auLoad').addEventListener('click', loadAudit);
$('exAudit').addEventListener('click', function () { location.href = '/api/admin/export/audit.csv' + rangeQuery($('auFrom').value, $('auTo').value); });

// ---------- settings ----------
var DAYNAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function sField(label, input, hint) {
  return '<div class="field">' + label + input + (hint ? '<span class="hint">' + hint + '</span>' : '') + '</div>';
}
async function loadSettings() {
  var s = await api('GET', '/settings');
  $('settingsForm').innerHTML =
    sField('Business days', '<div class="days">' + DAYNAMES.map(function (d, i) {
      return '<label><input type="checkbox" data-day="' + i + '"' + (s.business_days.indexOf(i) >= 0 ? ' checked' : '') + '> ' + d + '</label>';
    }).join('') + '</div>') +
    sField('Company hours start', '<input type="time" id="sStart" value="' + s.business_start + '">', 'Default shift for people with none set. Admin summaries only post in company hours.') +
    sField('Company hours end', '<input type="time" id="sEnd" value="' + s.business_end + '">') +
    sField('Clock-in grace (minutes)', '<input type="number" id="sGrace" min="0" value="' + s.clock_in_grace_min + '">', 'Minutes after someone\\'s shift starts before a "not clocked in" alert.') +
    sField('Holidays', '<textarea id="sHolidays" rows="3" placeholder="2026-11-26">' + esc(s.holidays.join(' ')) + '</textarea>', 'Dates (YYYY-MM-DD) with no alerts. Separate with spaces or new lines.') +
    sField('Lunch window', '<div class="pair"><input type="time" id="sLws" value="' + s.lunch_window_start + '"><input type="time" id="sLwe" value="' + s.lunch_window_end + '"></div>', 'A time out overlapping this window can count as lunch.') +
    sField('Lunch length (minutes, min / max)', '<div class="pair"><input type="number" id="sLmin" min="0" value="' + s.lunch_min_minutes + '"><input type="number" id="sLmax" min="0" value="' + s.lunch_max_minutes + '"></div>') +
    sField('Flag "no lunch" after (minutes on shift)', '<input type="number" id="sLafter" min="0" value="' + s.lunch_expected_after_min + '">', '300 = 5 hours (the Colorado COMPS meal-period threshold).') +
    sField('Admin Slack channel ID', '<input type="text" id="sChannel" value="' + esc(s.admin_channel) + '" placeholder="C0123ABCD">', 'Exception summaries go here. Invite the bot to the channel first.') +
    sField('Alerts', '<label><input type="checkbox" id="sAlerts"' + (s.alerts_enabled ? ' checked' : '') + '> Alerts on</label>' +
      '<label><input type="checkbox" id="sDm"' + (s.dm_enabled ? ' checked' : '') + '> DM employees</label>') +
    sField('Clock-out reminder', '<label><input type="checkbox" id="sReminder"' + (s.clock_out_reminder ? ' checked' : '') + '> DM people who are still clocked in</label>' +
      '<div class="pair"><input type="number" id="sRemMin" min="0" max="720" step="5" value="' + Math.abs(s.clock_out_reminder_offset_min) + '">' +
      '<select id="sRemWhen"><option value="before"' + (s.clock_out_reminder_offset_min <= 0 ? ' selected' : '') + '>min before shift end</option>' +
      '<option value="after"' + (s.clock_out_reminder_offset_min > 0 ? ' selected' : '') + '>min after shift end</option></select></div>',
      '<span id="sRemEx"></span> Measured from each person\\'s own shift end. Checked every 15 minutes; sent once a day, at the first check from that time on.');
  ['sStart', 'sEnd', 'sReminder', 'sRemMin', 'sRemWhen'].forEach(function (id) { $(id).addEventListener('input', reminderExample); });
  reminderExample();
}
// "With company hours: 4:45 PM", so the before/after choice is unambiguous.
function reminderExample() {
  var hm = function (v) { var p = v.split(':'); return p.length === 2 ? +p[0] * 60 + +p[1] : null; };
  var start = hm(val('sStart')), end = hm(val('sEnd')), m = Math.abs(+val('sRemMin') || 0);
  var text = '';
  if (!$('sReminder').checked) text = 'Off.';
  else if (start !== null && end !== null) {
    var at = Math.max(start, end + ($('sRemWhen').value === 'after' ? m : -m));
    text = at >= 1440 ? 'With company hours that is past midnight, so it would never go out.'
      : 'With company hours: ' + (Math.floor(at / 60) % 12 || 12) + ':' + String(at % 60).padStart(2, '0') + (at < 720 ? ' AM.' : ' PM.');
  }
  $('sRemEx').textContent = text;
}
$('saveSettings').addEventListener('click', async function () {
  $('setErr').textContent = '';
  var days = [];
  document.querySelectorAll('[data-day]').forEach(function (el) { if (el.checked) days.push(+el.dataset.day); });
  try {
    await api('PUT', '/settings', {
      business_days: days, business_start: val('sStart'), business_end: val('sEnd'), clock_in_grace_min: +val('sGrace'),
      holidays: val('sHolidays').split(/[^0-9-]+/).filter(Boolean),
      lunch_window_start: val('sLws'), lunch_window_end: val('sLwe'), lunch_min_minutes: +val('sLmin'), lunch_max_minutes: +val('sLmax'),
      lunch_expected_after_min: +val('sLafter'), admin_channel: val('sChannel'),
      alerts_enabled: $('sAlerts').checked, dm_enabled: $('sDm').checked, clock_out_reminder: $('sReminder').checked,
      clock_out_reminder_offset_min: ($('sRemWhen').value === 'after' ? 1 : -1) * Math.abs(+val('sRemMin') || 0)
    });
    state.settings = await api('GET', '/settings');
    $('setErr').style.color = '#155724';
    $('setErr').textContent = 'Saved.';
  } catch (e) { $('setErr').style.color = ''; $('setErr').textContent = e.message; }
});

// ---------- correction requests ----------
var REQ_STATUS = { pending: ['Waiting', 'flag-warn'], approved: ['Approved', 'flag-ok'], rejected: ['Rejected', 'flag-bad'], withdrawn: ['Withdrawn', 'flag-info'] };
function reqFilter() { var el = document.querySelector('input[name=reqFilter]:checked'); return el ? el.value : 'pending'; }
async function refreshReqCount() {
  try {
    var pend = await api('GET', '/requests?status=pending');
    $('reqCount').hidden = !pend.length;
    $('reqCount').textContent = pend.length;
  } catch (e) {}
}
async function loadRequests() {
  $('reqErr').textContent = '';
  try {
    var f = reqFilter();
    var rows = await api('GET', '/requests' + (f ? '?status=' + f : ''));
    $('reqBody').innerHTML = rows.map(function (r) {
      var s = REQ_STATUS[r.status] || [r.status, 'flag-info'];
      var decided = r.decided_by ? '<div class="muted">' + esc(r.decided_by) + (r.decision_note ? ': ' + esc(r.decision_note) : '') + '</div>' : '';
      var actions = r.status === 'pending'
        ? '<button class="btn btn-sm" data-approve="' + r.id + '">Approve</button> <button class="btn btn-light btn-sm" data-reject="' + r.id + '">Reject</button>'
        : '';
      return '<tr><td style="white-space:nowrap">' + stamp(r.requested_at) + '<div class="muted">#' + r.id + ' via ' + esc(r.requested_via) + '</div></td>' +
        '<td><strong>' + esc(r.name) + '</strong></td>' +
        '<td>' + esc(r.summary) + (r.note ? ' <span class="muted">(note: ' + esc(r.note) + ')</span>' : '') + '</td>' +
        '<td>' + esc(r.reason) + '</td>' +
        '<td><span class="flag ' + s[1] + '">' + s[0] + '</span>' + decided + '</td>' +
        '<td style="white-space:nowrap">' + actions + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="empty">' + (reqFilter() === 'pending' ? 'Nothing waiting.' : 'No requests.') + '</td></tr>';
  } catch (e) { $('reqErr').textContent = e.message; }
  refreshReqCount();
}
document.querySelectorAll('input[name=reqFilter]').forEach(function (el) { el.addEventListener('change', loadRequests); });
$('reqBody').addEventListener('click', async function (ev) {
  var b = ev.target.closest('button');
  if (!b) return;
  if (b.dataset.approve) {
    b.disabled = true;
    var failed = null;
    try { await api('POST', '/requests/' + b.dataset.approve + '/approve', {}); }
    catch (e) { failed = e.message; }
    await loadRequests();
    if (failed) $('reqErr').textContent = failed;
  }
  if (b.dataset.reject) {
    var id = b.dataset.reject;
    openModal('Reject request #' + id, '<div class="field">Why not? (sent to the employee)<textarea id="fNote" rows="3" maxlength="300"></textarea></div>', 'Reject', async function () {
      await api('POST', '/requests/' + id + '/reject', { note: val('fNote') });
      await loadRequests();
    }, true);
  }
});

// ---------- scheduled-check heartbeat ----------
// The cron runs every 15 minutes; more than 30 minutes of silence means it
// has stopped, so say so on every tab, not just Settings.
var TICK_STALE_MS = 30 * 60 * 1000;
function ago(ms) {
  var m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  var h = Math.floor(m / 60);
  return h < 48 ? h + ' h ' + (m % 60) + ' min ago' : Math.floor(h / 24) + ' days ago';
}
async function loadStatus() {
  var s;
  try { s = await api('GET', '/status'); } catch (e) { return; }
  var t = s.lastTick, line, problem = null;
  if (!t) {
    problem = 'The scheduled check has never run. Reminders, the admin summary and the midnight reset are not happening.';
    line = '<span class="tick-bad">never</span>';
  } else {
    var age = s.now - t.at;
    var when = stamp(t.at) + ' (' + ago(age) + ')';
    if (!t.ok) {
      problem = 'The last scheduled check failed: ' + esc(t.error || 'unknown error') + '.';
      line = when + ' &middot; <span class="tick-bad">failed</span> &middot; ' + esc(t.error || '');
    } else if (age > TICK_STALE_MS) {
      problem = 'The scheduled check last ran ' + ago(age) + '. It should run every 15 minutes; reminders, the admin summary and the midnight reset have stopped.';
      line = when + ' &middot; <span class="tick-bad">overdue</span>';
    } else {
      line = when + ' &middot; <span class="tick-ok">OK</span>' +
        (t.raised ? ' &middot; ' + t.raised + ' alert' + (t.raised === 1 ? '' : 's') + ' raised' : '');
    }
  }
  $('tickLine').innerHTML = 'Last scheduled check: ' + line;
  $('tickBanner').hidden = !problem;
  $('tickBanner').innerHTML = problem ? '<strong>Alerts are not running.</strong> ' + problem : '';
}

// ---------- init ----------
(async function init() {
  var today = localDay(Date.now());
  $('tsTo').value = today; $('tsFrom').value = addDays(today, -6);
  $('auTo').value = today; $('auFrom').value = addDays(today, -29);
  setRange('thisweek');
  fetch('/api/me').then(function (r) { return r.json(); }).then(function (me) { $('who').textContent = 'Signed in as ' + me.email; });
  loadStatus();
  refreshReqCount();
  setInterval(function () { loadStatus(); refreshReqCount(); }, 5 * 60 * 1000);
  try { state.settings = await api('GET', '/settings'); } catch (e) {}
  try { await loadEmployees(); } catch (e) { $('empErr').textContent = e.message; }
  loadTimesheet();
})();
<\/script>
</body>
</html>`;
