export const BOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>In / Out Board</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f2f5; color: #1a1a1a; padding: 20px; }
  .container { max-width: 800px; margin: 0 auto; }
  h1 { text-align: center; margin-bottom: 8px; font-size: 1.8rem; }
  .whoami { text-align: center; color: #666; font-size: 0.85rem; margin-bottom: 20px; min-height: 1.2em; }
  .whoami a { color: #0b5ed7; font-weight: 600; text-decoration: none; margin-left: 10px; }
  .board { background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden; }
  table { width: 100%; border-collapse: collapse; }
  thead { background: #1a1a2e; color: #fff; }
  th { padding: 14px 16px; text-align: left; font-weight: 600; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px; }
  td { padding: 12px 16px; border-bottom: 1px solid #eee; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #f8f9fa; }
  .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-weight: 600; font-size: 0.85rem; }
  .status-in { background: #d4edda; color: #155724; }
  .status-out { background: #f8d7da; color: #721c24; }
  .return-time { color: #666; font-size: 0.9rem; }
  .actions { display: flex; gap: 6px; }
  .btn { padding: 6px 14px; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem; font-weight: 500; transition: opacity 0.2s; }
  .btn:hover { opacity: 0.85; }
  .btn-in { background: #28a745; color: #fff; }
  .btn-out { background: #dc3545; color: #fff; }
  .btn-pto { background: #e7f1ff; color: #0b5ed7; }
  .status-pto { background: #e7f1ff; color: #0b5ed7; }
  .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 100; align-items: center; justify-content: center; }
  .modal-overlay.active { display: flex; }
  .modal { background: #fff; border-radius: 12px; padding: 24px; width: 340px; }
  .modal h3 { margin-bottom: 16px; }
  .modal input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 12px; font-size: 0.95rem; }
  .modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
  .btn-cancel { background: #e9ecef; color: #333; }
  .empty { text-align: center; padding: 40px; color: #999; }
  .presets { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
  .btn-preset { background: #e7f1ff; color: #0b5ed7; border: 1px solid #b6d4fe; }
  .btn-preset.selected { background: #0b5ed7; color: #fff; border-color: #0b5ed7; }
  .preset-label { font-size: 0.8rem; color: #666; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
  .ask-text { color: #333; font-size: 0.9rem; line-height: 1.4; margin-bottom: 14px; }
  .ask-err { color: #b02a37; font-size: 0.85rem; min-height: 1.1em; margin-bottom: 8px; }
  @media (max-width: 400px) { .modal { width: calc(100vw - 32px); } }
</style>
</head>
<body>
<div class="container">
  <h1>In / Out Board</h1>
  <div class="whoami" id="whoami"></div>
  <div class="board">
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Status</th>
          <th>Return</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="boardBody">
        <tr><td colspan="4" class="empty">Loading...</td></tr>
      </tbody>
    </table>
  </div>
</div>

<div class="modal-overlay" id="outModal">
  <div class="modal">
    <h3>Mark as Out</h3>
    <div class="preset-label">Back in</div>
    <div class="presets" id="presets"></div>
    <input type="text" id="returnTime" placeholder="Or type a return time" />
    <div class="modal-actions">
      <button class="btn btn-cancel" onclick="closeModal()">Cancel</button>
      <button class="btn btn-out" onclick="confirmOut()">Mark Out</button>
    </div>
  </div>
</div>

<!-- Shown after you sign yourself in when an earlier day has no clock-out. -->
<div class="modal-overlay" id="askModal">
  <div class="modal">
    <h3 id="askTitle">What time did you clock out?</h3>
    <p class="ask-text" id="askText"></p>
    <div id="askForm">
      <div class="preset-label">Clock-out time</div>
      <input type="time" id="askTime" />
      <div class="preset-label">Why</div>
      <input type="text" id="askReason" maxlength="500" />
    </div>
    <div class="ask-err" id="askErr"></div>
    <div class="modal-actions">
      <button class="btn btn-cancel" id="askLater" onclick="closeAsk()">Later</button>
      <button class="btn btn-in" id="askSend" onclick="sendAsk()">Send for approval</button>
    </div>
  </div>
</div>

<div class="modal-overlay" id="ptoModal">
  <div class="modal">
    <h3 id="ptoTitle">PTO</h3>
    <div class="preset-label">First day back</div>
    <input type="date" id="ptoReturn" />
    <div class="preset-label">Note (optional)</div>
    <input type="text" id="ptoNote" maxlength="150" placeholder="e.g. vacation, sick, family" />
    <div class="modal-actions">
      <button class="btn btn-cancel" onclick="closePto()">Cancel</button>
      <button class="btn btn-pto" onclick="confirmPto()">Start PTO</button>
    </div>
  </div>
</div>

<script>
let employees = [];
let pendingOutId = null;

async function load() {
  const res = await fetch('/api/employees');
  if (res.status === 401) {
    document.getElementById('boardBody').innerHTML =
      '<tr><td colspan="4" class="empty">Sign-in required. Reload the page to sign in.</td></tr>';
    return;
  }
  employees = await res.json();
  render();
}

// Every punch is recorded against the signed-in person, so show who that is.
async function loadMe() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) return;
    const me = await res.json();
    document.getElementById('whoami').innerHTML = 'Signed in as ' + esc(me.email) +
      (me.employee ? '<a href="/me">My time \u2192</a>' : '') +
      (me.isAdmin ? '<a href="/admin">Admin portal \u2192</a>' : '');
  } catch (err) {}
}

async function punch(url, opts) {
  const res = await fetch(url, opts);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert('That did not save: ' + (body.error || res.status) + '. Please try again.');
    return null;
  }
  return body;
}

// After you sign yourself in, the server reports an earlier day with no
// clock-out (e.g. the midnight reset signed you out). Ask for the time now;
// it goes to an admin as a correction request, like the My time page.
let askDay = null;
function openAsk(ask) {
  askDay = ask.day;
  const others = ask.otherDays
    ? ' You have ' + ask.otherDays + ' more day' + (ask.otherDays > 1 ? 's' : '') + ' without a clock-out; see My time.'
    : '';
  document.getElementById('askTitle').textContent = 'What time did you clock out?';
  document.getElementById('askText').textContent =
    'Your record for ' + ask.dayText + ' has no clock-out after your ' + ask.clockedInText + ' clock-in. An admin approves the time before it goes on your record.' + others;
  document.getElementById('askForm').hidden = false;
  document.getElementById('askTime').value = '';
  document.getElementById('askReason').value = 'Forgot to clock out';
  document.getElementById('askErr').textContent = '';
  document.getElementById('askSend').hidden = false;
  document.getElementById('askLater').textContent = 'Later';
  document.getElementById('askModal').classList.add('active');
  document.getElementById('askTime').focus();
}
function closeAsk() {
  document.getElementById('askModal').classList.remove('active');
  askDay = null;
}
async function sendAsk() {
  const err = document.getElementById('askErr');
  const time = document.getElementById('askTime').value;
  if (!time) { err.textContent = 'Enter the time you clocked out.'; return; }
  err.textContent = '';
  const res = await fetch('/api/me/requests', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ kind: 'add', day: askDay, punch_kind: 'out', time, reason: document.getElementById('askReason').value.trim() })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { err.textContent = body.error || ('That did not send (' + res.status + ').'); return; }
  document.getElementById('askTitle').textContent = 'Sent for approval';
  document.getElementById('askText').textContent = 'An admin will approve it before your record changes. You can follow it on My time.';
  document.getElementById('askForm').hidden = true;
  document.getElementById('askSend').hidden = true;
  document.getElementById('askLater').textContent = 'Close';
}

function render() {
  const body = document.getElementById('boardBody');
  if (employees.length === 0) {
    body.innerHTML = '<tr><td colspan="4" class="empty">No one on the board yet. An admin can add people in the admin portal.</td></tr>';
    return;
  }
  body.innerHTML = employees.map(e => {
    const isIn = e.status === 'in';
    const isPto = e.status === 'pto';
    const badge = isPto ? '<span class="status-badge status-pto">PTO</span>'
      : \`<span class="status-badge \${isIn ? 'status-in' : 'status-out'}">\${isIn ? 'In' : 'Out'}</span>\`;
    const actions = isPto
      ? \`<button class="btn btn-in" onclick="endPto('\${e.id}')">Back from PTO</button>\`
      : (isIn
          ? \`<button class="btn btn-out" onclick="markOut('\${e.id}')">Sign Out</button>\`
          : \`<button class="btn btn-in" onclick="markIn('\${e.id}')">Sign In</button>\`) +
        \`<button class="btn btn-pto" onclick="openPto('\${e.id}')">PTO</button>\`;
    return \`<tr>
      <td><strong>\${esc(e.name)}</strong></td>
      <td>\${badge}</td>
      <td class="return-time">\${isIn ? '\u2014' : esc(e.returnTime || '\u2014')}</td>
      <td class="actions">\${actions}</td>
    </tr>\`;
  }).join('');
}

// PTO starts today and runs until the first day back.
let pendingPtoId = null;
function openPto(id) {
  pendingPtoId = id;
  const emp = employees.find(e => e.id === id);
  document.getElementById('ptoTitle').textContent = 'PTO for ' + (emp ? emp.name : '');
  const tomorrow = new Date(Date.now() + 86400000);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(tomorrow);
  const input = document.getElementById('ptoReturn');
  input.value = ymd;
  input.min = ymd;
  document.getElementById('ptoNote').value = '';
  document.getElementById('ptoModal').classList.add('active');
}
function closePto() {
  document.getElementById('ptoModal').classList.remove('active');
  pendingPtoId = null;
}
async function confirmPto() {
  await punch('/api/employees/' + pendingPtoId + '/pto', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ returnDay: document.getElementById('ptoReturn').value, note: document.getElementById('ptoNote').value.trim() })
  });
  closePto();
  await load();
}
async function endPto(id) {
  const r = await punch('/api/employees/' + id + '/pto-end', { method: 'POST' });
  await load();
  if (r && r.ask) openAsk(r.ask);
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

async function markOut(id) {
  pendingOutId = id;
  document.getElementById('outModal').classList.add('active');
  document.getElementById('returnTime').value = '';
  document.getElementById('returnTime').focus();
  await loadPresets();
}

// Presets are computed server-side in the team's timezone so the web board and
// Slack always offer the same choices.
async function loadPresets() {
  const box = document.getElementById('presets');
  box.innerHTML = '';
  let presets = [];
  try {
    const res = await fetch('/api/return-presets');
    presets = await res.json();
  } catch (err) {
    return; // typing a time still works if this fails
  }
  box.innerHTML = presets.map(p =>
    \`<button type="button" class="btn btn-preset" data-value="\${esc(p.value)}">\${esc(p.label)}</button>\`
  ).join('');
  box.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      box.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('returnTime').value = btn.dataset.value;
    });
  });
}

function closeModal() {
  document.getElementById('outModal').classList.remove('active');
  pendingOutId = null;
}

async function confirmOut() {
  const returnTime = document.getElementById('returnTime').value.trim();
  await punch('/api/employees/' + pendingOutId, {
    method: 'PUT',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ status: 'out', returnTime })
  });
  closeModal();
  await load();
}

async function markIn(id) {
  const r = await punch('/api/employees/' + id, {
    method: 'PUT',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ status: 'in', returnTime: '' })
  });
  await load();
  if (r && r.ask) openAsk(r.ask);
}

// Enter key to submit in modal
document.getElementById('returnTime').addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmOut();
});
document.getElementById('askReason').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendAsk();
});

load();
loadMe();
<\/script>
</body>
</html>`;
