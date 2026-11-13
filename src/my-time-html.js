export const MY_TIME_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>My Time</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f2f5; color: #1a1a1a; padding: 20px; font-size: 14px; }
  .container { max-width: 900px; margin: 0 auto; }
  header { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 6px; }
  h1 { font-size: 1.5rem; }
  h2 { font-size: 1rem; margin: 18px 0 8px; }
  .who { color: #666; font-size: 0.85rem; }
  .who a { color: #0b5ed7; text-decoration: none; font-weight: 600; margin-left: 10px; }
  .intro { color: #555; margin-bottom: 14px; font-size: 0.9rem; }
  .card { background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); padding: 12px 14px; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 8px; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.4px; color: #555; border-bottom: 2px solid #ddd; white-space: nowrap; }
  td { padding: 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  tr.detail > td { background: #f8f9fb; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .muted { color: #888; }
  .flag { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.72rem; font-weight: 700; margin: 1px 2px 1px 0; white-space: nowrap; }
  .flag-bad { background: #f8d7da; color: #721c24; }
  .flag-warn { background: #fff3cd; color: #856404; }
  .flag-info { background: #e2e3e5; color: #383d41; }
  .flag-ok { background: #d4edda; color: #155724; }
  .flag-pending { background: #fff3cd; color: #856404; }
  .btn { padding: 6px 12px; border: none; border-radius: 6px; cursor: pointer; font-size: 0.82rem; font-weight: 600; background: #0b5ed7; color: #fff; white-space: nowrap; }
  .btn-light { background: #e9ecef; color: #1a1a1a; }
  .btn-sm { padding: 3px 8px; font-size: 0.76rem; }
  .voided td { text-decoration: line-through; color: #999; }
  .punches td, .punches th { padding: 4px 8px; font-size: 0.85rem; }
  .empty { text-align: center; padding: 24px; color: #999; }
  .notice { background: #fff3cd; color: #856404; border-radius: 8px; padding: 12px 14px; }
  .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 100; align-items: center; justify-content: center; padding: 16px; }
  .modal-overlay.active { display: flex; }
  .modal { background: #fff; border-radius: 12px; padding: 20px; width: 400px; max-width: 100%; }
  .modal h3 { margin-bottom: 6px; }
  .modal .sub { color: #555; font-size: 0.85rem; margin-bottom: 12px; }
  .field { display: flex; flex-direction: column; gap: 3px; margin-bottom: 10px; font-size: 0.8rem; color: #555; }
  .field input, .field select, .field textarea { padding: 7px 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 0.9rem; font-family: inherit; width: 100%; }
  .row { display: flex; gap: 10px; }
  .row .field { flex: 1; min-width: 0; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
  .err { color: #b02a37; font-size: 0.85rem; min-height: 1.1em; margin-bottom: 6px; }
  @media (max-width: 640px) { body { padding: 10px; } .hide-sm { display: none; } }
</style>
</head>
<body>
<div class="container">
  <header>
    <h1 id="title">My time</h1>
    <div class="who"><span id="who"></span><a href="/">Board</a></div>
  </header>
  <p class="intro" id="intro">Your punches for the last two weeks. If something is missing or wrong, request a fix. An admin approves it before your record changes.</p>
  <div id="notLinked" class="notice" hidden></div>
  <div id="main" hidden>
    <h2>Requests</h2>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Asked</th><th>Change</th><th>Why</th><th>Status</th><th></th></tr></thead>
      <tbody id="reqBody"></tbody>
    </table></div></div>
    <h2 style="display:flex;justify-content:space-between;align-items:center">Days <button class="btn btn-sm" data-add="any">+ Add a missing punch</button></h2>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>In</th><th>Out</th><th class="hide-sm">Lunch</th><th class="num">Hours worked</th><th class="num" title="Hours worked plus lunch, lunch counted up to 1 hour">Total hours</th><th>Flags</th><th></th></tr></thead>
      <tbody id="dayBody"><tr><td colspan="8" class="empty">Loading...</td></tr></tbody>
    </table></div></div>
  </div>
</div>

<div class="modal-overlay" id="modal">
  <div class="modal">
    <h3 id="mTitle"></h3>
    <div class="sub" id="mSub"></div>
    <div id="mBody"></div>
    <div class="err" id="mErr"></div>
    <div class="modal-actions">
      <button class="btn btn-light" id="mCancel">Cancel</button>
      <button class="btn" id="mOk">Send for approval</button>
    </div>
  </div>
</div>

<script>
var TZ = 'America/Denver';
var data = null, open = {}, pending = null;
function $(id) { return document.getElementById(id); }
function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
function fmtTime(ts) { return ts ? new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(ts)) : ''; }
function hhmm(ts) { return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts)); }
function localDay(ts) { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ts)); }
function prettyDay(d) { var p = d.split('-'); return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]))); }
function dur(min) { if (min == null) return ''; return Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0'); }
function ago(ts) { return prettyDay(localDay(ts)) + ' ' + fmtTime(ts); }

var FLAG = {
  missing_clock_out: ['No clock-out', 'flag-bad'], missing_clock_in: ['No clock-in', 'flag-bad'],
  no_punches: ['No punches', 'flag-bad'], no_lunch: ['No lunch recorded', 'flag-warn'],
  edited: ['Corrected', 'flag-info'], open: ['Clocked in', 'flag-ok']
};
var STATUS = { pending: ['Waiting for approval', 'flag-pending'], approved: ['Approved', 'flag-ok'], rejected: ['Not approved', 'flag-bad'], withdrawn: ['Withdrawn', 'flag-info'] };

async function load() {
  var meRes = await fetch('/api/me');
  if (meRes.ok) { var me = await meRes.json(); $('who').textContent = 'Signed in as ' + me.email; }
  var res = await fetch('/api/me/time');
  var body = await res.json().catch(function () { return {}; });
  if (!res.ok) {
    $('notLinked').hidden = false;
    $('notLinked').textContent = body.error || ('Could not load your time (' + res.status + ').');
    return;
  }
  data = body;
  $('title').textContent = 'My time: ' + data.employee.name;
  $('main').hidden = false;
  render();
}

function render() {
  var reqs = data.requests;
  $('reqBody').innerHTML = reqs.length ? reqs.map(function (r) {
    var s = STATUS[r.status] || [r.status, 'flag-info'];
    return '<tr><td style="white-space:nowrap">' + ago(r.requested_at) + '</td>' +
      '<td>' + esc(r.summary) + (r.note ? ' <span class="muted">(' + esc(r.note) + ')</span>' : '') + '</td>' +
      '<td>' + esc(r.reason) + '</td>' +
      '<td><span class="flag ' + s[1] + '">' + s[0] + '</span>' + (r.decision_note ? '<div class="muted">' + esc(r.decision_note) + '</div>' : '') + '</td>' +
      '<td>' + (r.status === 'pending' ? '<button class="btn btn-light btn-sm" data-withdraw="' + r.id + '">Withdraw</button>' : '') + '</td></tr>';
  }).join('') : '<tr><td colspan="5" class="empty">No requests yet.</td></tr>';

  var pendingFor = {};
  reqs.forEach(function (r) { if (r.status === 'pending') { pendingFor[r.day] = true; if (r.punch_id) pendingFor['p' + r.punch_id] = true; } });

  var rows = data.rows;
  $('dayBody').innerHTML = rows.length ? rows.map(function (r) {
    var flags = r.flags.map(function (f) { var d = FLAG[f] || [f, 'flag-info']; return '<span class="flag ' + d[1] + '">' + d[0] + '</span>'; }).join('');
    if (r.off) flags = '<span class="flag flag-info">Off: ' + esc(r.off) + '</span>' + flags;
    if (pendingFor[r.day]) flags += '<span class="flag flag-pending">Fix pending</span>';
    var lunch = r.lunch ? fmtTime(r.lunch.start) + ' - ' + fmtTime(r.lunch.end) : '<span class="muted">-</span>';
    var html = '<tr><td style="white-space:nowrap">' + prettyDay(r.day) + '</td><td>' + fmtTime(r.first_in) + '</td><td>' + fmtTime(r.last_out) + '</td>' +
      '<td class="hide-sm">' + lunch + '</td><td class="num">' + dur(r.on_clock_min) + '</td><td class="num">' + dur(r.total_min) + '</td><td>' + flags + '</td>' +
      '<td style="white-space:nowrap"><button class="btn btn-sm" data-add="' + r.day + '">+ Missing punch</button> ' +
      '<button class="btn btn-light btn-sm" data-toggle="' + r.day + '">' + (open[r.day] ? 'Hide' : 'Punches') + '</button></td></tr>';
    if (open[r.day]) html += '<tr class="detail"><td colspan="8">' + detail(r.day, pendingFor) + '</td></tr>';
    return html;
  }).join('') : '<tr><td colspan="8" class="empty">No work days in the last two weeks.</td></tr>';
}

function detail(day, pendingFor) {
  var list = data.punches.filter(function (p) { return localDay(p.ts) === day; });
  if (!list.length) return '<span class="muted">No punches this day.</span>';
  return '<table class="punches"><tbody>' + list.map(function (p) {
    var actions = p.voided ? '' : pendingFor['p' + p.id] ? '<span class="flag flag-pending">Fix pending</span>' :
      '<button class="btn btn-light btn-sm" data-change="' + p.id + '">Wrong time</button> <button class="btn btn-light btn-sm" data-remove="' + p.id + '">Remove</button>';
    return '<tr class="' + (p.voided ? 'voided' : '') + '"><td>' + fmtTime(p.ts) + '</td><td>' + (p.kind === 'in' ? 'In' : 'Out') + '</td>' +
      '<td>' + esc(p.note) + (p.request_id ? ' <span class="muted">(your request #' + p.request_id + ')</span>' : '') + '</td><td style="text-decoration:none">' + actions + '</td></tr>';
  }).join('') + '</tbody></table>';
}

function openModal(title, sub, html, ok) {
  $('mTitle').textContent = title; $('mSub').textContent = sub; $('mBody').innerHTML = html; $('mErr').textContent = '';
  pending = ok; $('modal').classList.add('active');
  var first = $('mBody').querySelector('input, select, textarea'); if (first) first.focus();
}
function closeModal() { $('modal').classList.remove('active'); pending = null; }
$('mCancel').addEventListener('click', closeModal);
$('mOk').addEventListener('click', async function () {
  if (!pending) return;
  $('mOk').disabled = true;
  try { await pending(); closeModal(); await reload(); }
  catch (e) { $('mErr').textContent = e.message; }
  finally { $('mOk').disabled = false; }
});
function val(id) { var el = $(id); return el ? el.value.trim() : ''; }
var REASON = '<div class="field">Why (required)<textarea id="fReason" rows="2" maxlength="500" placeholder="e.g. forgot to clock out, left at 5:15"></textarea></div>';

async function send(body) {
  var res = await fetch('/api/me/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  var out = await res.json().catch(function () { return {}; });
  if (!res.ok) throw new Error(out.error || ('HTTP ' + res.status));
}
async function reload() { var res = await fetch('/api/me/time'); if (res.ok) { data = await res.json(); render(); } }

document.addEventListener('click', async function (ev) {
  var b = ev.target.closest('button'); if (!b) return;
  if (b.dataset.toggle) { open[b.dataset.toggle] = !open[b.dataset.toggle]; render(); }
  if (b.dataset.add) {
    var anyDay = b.dataset.add === 'any';
    var day = anyDay ? data.to : b.dataset.add;
    openModal('Add a missing punch', anyDay ? 'Any day in the last ' + data.windowDays + ' days' : prettyDay(day),
      (anyDay ? '<div class="field">Date<input type="date" id="fDay" value="' + data.to + '" min="' + data.from + '" max="' + data.to + '"></div>' : '') +
      '<div class="row"><div class="field">Missing<select id="fKind"><option value="in">Clock-in (start)</option><option value="out">Clock-out (finish or break)</option></select></div>' +
      '<div class="field">Time<input type="time" id="fTime"></div></div>' +
      '<div class="field">Note (optional; write "lunch" for a lunch break)<input type="text" id="fNote" maxlength="100"></div>' + REASON,
      function () { return send({ kind: 'add', day: anyDay ? val('fDay') : day, punch_kind: val('fKind'), time: val('fTime'), note: val('fNote'), reason: val('fReason') }); });
  }
  if (b.dataset.change) {
    var p = data.punches.find(function (x) { return String(x.id) === b.dataset.change; });
    openModal('Fix a punch time', (p.kind === 'in' ? 'Clock-in' : 'Clock-out') + ' at ' + fmtTime(p.ts) + ' on ' + prettyDay(localDay(p.ts)),
      '<div class="row"><div class="field">Correct time<input type="time" id="fTime" value="' + hhmm(p.ts) + '"></div>' +
      '<div class="field">Type<select id="fKind"><option value="in"' + (p.kind === 'in' ? ' selected' : '') + '>Clock-in</option><option value="out"' + (p.kind === 'out' ? ' selected' : '') + '>Clock-out</option></select></div></div>' + REASON,
      function () { return send({ kind: 'change', punch_id: p.id, time: val('fTime'), punch_kind: val('fKind'), reason: val('fReason') }); });
  }
  if (b.dataset.remove) {
    var q = data.punches.find(function (x) { return String(x.id) === b.dataset.remove; });
    openModal('Remove a punch', (q.kind === 'in' ? 'Clock-in' : 'Clock-out') + ' at ' + fmtTime(q.ts) + ' on ' + prettyDay(localDay(q.ts)) + '. It stays in the history, marked as removed.',
      REASON, function () { return send({ kind: 'remove', punch_id: q.id, reason: val('fReason') }); });
  }
  if (b.dataset.withdraw) {
    var res = await fetch('/api/me/requests/' + b.dataset.withdraw + '/withdraw', { method: 'POST' });
    if (!res.ok) { var e = await res.json().catch(function () { return {}; }); alert(e.error || 'Could not withdraw'); }
    await reload();
  }
});

load();
<\/script>
</body>
</html>`;
