import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STUDIO_PORT = Number(process.env.STUDIO_PORT || 4200);
const HOST_API = process.env.HOST_API || 'http://localhost:4100';

function renderStudioHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Deskhand Studio — Operator & Sandbox Controller</title>
  <style>
    * { box-sizing: border-box; font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif; }
    body { margin: 0; background: #090d16; color: #f8fafc; }
    header { display: flex; justify-content: space-between; align-items: center; padding: 14px 24px; background: #111827; border-bottom: 1px solid #1f2937; }
    .logo { font-size: 19px; font-weight: 800; color: #f59e0b; display: flex; align-items: center; gap: 10px; }
    .pill { background: #1e293b; border: 1px solid #334155; padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .layout { display: grid; grid-template-columns: 360px 1fr 340px; gap: 16px; padding: 16px; height: calc(100vh - 62px); }
    .panel { background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
    h3 { margin: 0 0 6px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.6px; color: #94a3b8; }
    .btn { cursor: pointer; border: none; border-radius: 8px; padding: 10px 14px; font-weight: 700; font-size: 13px; transition: 0.15s; text-align: left; }
    .btn-scene { background: #1e293b; color: #f8fafc; border: 1px solid #334155; width: 100%; margin-bottom: 8px; }
    .btn-scene:hover { border-color: #f59e0b; background: #263349; }
    .btn-kill { background: #dc2626; color: #fff; text-align: center; }
    .btn-approve { background: #10b981; color: #052e16; text-align: center; flex: 1; }
    .btn-reject { background: #ef4444; color: #fff; text-align: center; flex: 1; }
    .viewport-frame { background: #030712; border: 2px solid #334155; border-radius: 10px; flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative; min-height: 420px; }
    .viewport-frame img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .step-item { background: #1e293b; border-left: 4px solid #f59e0b; padding: 10px 12px; border-radius: 6px; font-size: 13px; margin-bottom: 8px; }
    .alert-card { background: #451a03; border: 2px solid #f59e0b; border-radius: 10px; padding: 14px; }
    .budget-bar { height: 10px; background: #1e293b; border-radius: 999px; overflow: hidden; margin-top: 6px; }
    .budget-fill { height: 100%; background: linear-gradient(90deg, #10b981, #f59e0b); width: 0%; transition: width 0.25s; }
    select, input { background: #0f172a; color: #fff; border: 1px solid #334155; border-radius: 6px; padding: 8px 10px; font-size: 13px; width: 100%; }
  </style>
</head>
<body>
  <header>
    <div class="logo">
      🖥️ Deskhand Studio
      <span class="pill" id="ws-indicator">Connecting...</span>
      <span class="pill" id="heartbeat-pill">Switch 2s Heartbeat: --</span>
    </div>
    <div style="display:flex;align-items:center;gap:12px">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:12px;color:#94a3b8">Active Persona:</span>
        <select id="persona-select" style="width:170px">
          <option value="priya|qa-lead">👩‍💻 Priya (qa-lead)</option>
          <option value="arjun|ops-member">📱 Arjun (ops-member)</option>
          <option value="rahul|admin">🛡️ Rahul (admin)</option>
        </select>
      </div>
      <button class="btn btn-kill" onclick="triggerKillSwitch()">🛑 Emergency Kill (Ctrl+Shift+K)</button>
    </div>
  </header>

  <div class="layout">
    <!-- Left Column: Demo Story Triggers, Budget & Switch Config -->
    <div class="panel">
      <div>
        <h3>🎬 3-Minute Demo Story Launcher</h3>
        <button class="btn btn-scene" onclick="runScene('checkout fails on staging when the coupon CHAI50 is applied, can you reproduce?')">
          <strong>1A. QA Bug Repro (Priya)</strong><br/>
          <span style="font-size:12px;color:#94a3b8">Opens /shop, adds Masala Chai, applies CHAI50, hits 500 error</span>
        </button>
        <button class="btn btn-scene" onclick="runScene('file it in the issue tracker')">
          <strong>1B. "File it" in Issue Tracker (Rahul)</strong><br/>
          <span style="font-size:12px;color:#94a3b8">Opens /issues & files #CHAI-104 with repro steps</span>
        </button>
        <button class="btn btn-scene" onclick="runScene('update the masala chai price to 249 in the store admin and tell the team', 'ios_voice')">
          <strong>2. Voice Note + Safety Approval (Arjun → Priya)</strong><br/>
          <span style="font-size:12px;color:#94a3b8">Types ₹249 in /admin, pauses for Approve / Not now</span>
        </button>
        <button class="btn btn-scene" onclick="runScene('log into store admin with 2fa login code gate and verify inventory')">
          <strong>3. 2FA Login Code Takeover (Rahul)</strong><br/>
          <span style="font-size:12px;color:#94a3b8">Hits 2FA gate on /admin, requests human screen takeover</span>
        </button>
      </div>

      <div>
        <h3>💬 Custom Room / Voice Prompt</h3>
        <div style="display:flex;gap:6px">
          <input id="custom-prompt" type="text" placeholder="@deskhand ..." />
          <button class="btn" style="background:#f59e0b;color:#0f172a;text-align:center" onclick="sendCustomPrompt()">Send</button>
        </div>
      </div>

      <div>
        <h3>📊 Hard Call Budget (Disk Counter)</h3>
        <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700">
          <span id="budget-label">0 / 150 Calls Used</span>
          <span id="budget-status" style="color:#10b981">ACTIVE</span>
        </div>
        <div class="budget-bar"><div class="budget-fill" id="budget-fill"></div></div>
        <div style="font-size:12px;color:#94a3b8;margin-top:6px" id="budget-breakdown">
          Vision: 0 • STT: 0 • Halts on 150 or HTTP 401/403/429
        </div>
      </div>

      <div>
        <h3>🔌 Team coordination</h3>
        <p id="coordination-status" style="font-size:13px;line-height:1.6">Slack → Switch Console → Deskhand coordinator → browser host</p>
        <p style="font-size:12px;color:#94a3b8">Azure browser calls are counted below. Claude coordinator usage is separate.</p>
        <button class="btn btn-scene" onclick="pairPhone()">Pair iPhone operator</button>
        <div id="pairing-code" style="font-size:18px;font-weight:bold"></div>
      </div>

      <div>
        <h3>🛡️ Allowed Sites List (Strict Guard)</h3>
        <div id="allowlist-box" style="font-size:12px;color:#cbd5e1;line-height:1.6"></div>
      </div>
    </div>

    <!-- Center Column: Live Sandbox Screen & Safety / Takeover Gates -->
    <div class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0">🖥️ Sandboxed Chromium Viewport (1280×800)</h3>
        <span id="active-task-badge" class="pill">Idle</span>
      </div>

      <!-- Safety Approval Banner -->
      <div id="approval-banner" class="alert-card" style="display:none">
        <div style="font-weight:800;color:#fbbf24;font-size:15px;margin-bottom:6px">
          🛑 Safety Switch Triggered — Waiting for Team Approval
        </div>
        <div id="approval-question" style="font-size:14px;margin-bottom:10px"></div>
        <div style="display:flex;gap:10px">
          <button class="btn btn-approve" onclick="submitApproval('approve')">✅ Approve</button>
          <button class="btn btn-reject" onclick="submitApproval('reject')">✋ Not now</button>
        </div>
        <div id="approval-error" style="color:#fca5a5;font-size:12px;margin-top:8px"></div>
      </div>

      <!-- Human Takeover Banner -->
      <div id="takeover-banner" class="alert-card" style="display:none;border-color:#38bdf8;background:#0c4a6e">
        <div style="font-weight:800;color:#38bdf8;font-size:15px;margin-bottom:6px">
          🖐️ Human Screen Takeover Active
        </div>
        <div id="takeover-reason" style="font-size:13px;margin-bottom:10px"></div>
        <div style="display:flex;gap:8px">
          <input id="takeover-otp" type="text" value="482910" placeholder="6-digit code" style="width:160px;font-weight:800;letter-spacing:3px;text-align:center" />
          <button class="btn btn-approve" onclick="submitTakeoverOtp()">Type Code & Hand Back</button>
          <a id="takeover-link" href="#" target="_blank" class="btn" style="background:#334155;color:#fff;text-decoration:none">Open Link</a>
        </div>
      </div>

      <div class="viewport-frame" id="viewport-box">
        <div style="color:#64748b;text-align:center">
          Sandboxed Computer Ready.<br/>Launch any Demo Story on the left or from the iOS Companion App.
        </div>
      </div>
    </div>

    <!-- Right Column: Live Thread Step Stream & Bug Report -->
    <div class="panel">
      <h3>🧵 #ops Thread Live Step Stream</h3>
      <div id="steps-list"></div>
    </div>
  </div>

  <script>
    const HOST = '/host';
    let currentTaskId = null;
    let currentTask = null;
    function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
    async function request(path, body) {
      const response = await fetch(HOST + path, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body || {}) });
      const data = await response.json();
      if (!response.ok) { alert(data.error || 'Request failed'); throw new Error(data.error || 'Request failed'); }
      return data;
    }
    async function pairPhone() {
      const result = await request('/api/pairing-code');
      document.getElementById('pairing-code').textContent = 'Code: ' + result.code + ' · expires in 5 minutes';
    }

    function getPersona() {
      const val = document.getElementById('persona-select').value;
      const [name, role] = val.split('|');
      return { name: name.charAt(0).toUpperCase() + name.slice(1), role };
    }

    async function runScene(prompt, source = 'windows_studio') {
      const p = getPersona();
      await request('/api/tasks', { prompt, senderName: p.name, senderRole: p.role, source,
        parentTaskId: /file it/i.test(prompt) ? currentTask?.taskId : undefined,
        roomId: currentTask?.roomId || 'ops', threadId: currentTask?.threadId });
    }

    function sendCustomPrompt() {
      const input = document.getElementById('custom-prompt');
      if (!input.value.trim()) return;
      runScene(input.value.trim());
      input.value = '';
    }

    async function submitApproval(decision) {
      if (!currentTaskId) return;
      const p = getPersona();
      document.getElementById('approval-error').textContent = '';
      const res = await fetch(HOST + '/api/tasks/' + currentTaskId + '/approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, approvalId: currentTask.pendingApproval.approvalId })
      });
      const data = await res.json();
      if (!res.ok) {
        document.getElementById('approval-error').textContent = data.error || 'Approval rejected';
      } else {
        document.getElementById('approval-banner').style.display = 'none';
      }
    }

    async function submitTakeoverOtp() {
      if (!currentTaskId) return;
      const code = document.getElementById('takeover-otp').value.trim();
      await fetch(HOST + '/api/tasks/' + currentTaskId + '/takeover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: currentTaskId, type: 'otp_submit', text: code, actorName: 'Rahul' })
      });
      document.getElementById('takeover-banner').style.display = 'none';
    }

    async function setSwitchMode(mode) {
      await fetch(HOST + '/api/switch/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
    }

    async function triggerKillSwitch() {
      await fetch(HOST + '/api/kill', { method: 'POST' });
    }

    function renderTask(task) {
      if (!task) return;
      currentTaskId = task.taskId;
      currentTask = task;
      document.getElementById('active-task-badge').textContent = task.status + ' • ' + task.taskId;

      if (task.status === 'AWAITING_APPROVAL' && task.pendingApproval) {
        document.getElementById('approval-banner').style.display = 'block';
        document.getElementById('approval-question').textContent =
          task.pendingApproval.promptQuestion + ' (Allowed roles: ' + task.pendingApproval.allowedRoles.join(', ') + ')';
      } else {
        document.getElementById('approval-banner').style.display = 'none';
      }

      if (task.status === 'HUMAN_TAKEOVER' && task.takeover) {
        document.getElementById('takeover-banner').style.display = 'block';
        document.getElementById('takeover-reason').textContent = task.takeover.reason;
        document.getElementById('takeover-link').href = task.takeover.takeoverUrl;
      } else {
        document.getElementById('takeover-banner').style.display = 'none';
      }

      const stepsContainer = document.getElementById('steps-list');
      stepsContainer.innerHTML = (task.steps || [])
        .map(
          (s) =>
            '<div class="step-item"><strong>Step ' +
            s.stepNumber +
            ':</strong> ' +
            escapeHtml(s.thought) +
            '</div>'
        )
        .join('');

      if (task.bugReport) {
        stepsContainer.innerHTML +=
          '<div class="step-item" style="border-color:#ef4444;background:#450a0a">' +
          '<strong>🐞 Ready-to-File Bug Report:</strong><br/>' +
          escapeHtml(task.bugReport.title) +
          '<br/><button class="btn" style="margin-top:8px;background:#f59e0b;color:#0f172a" onclick="runScene(\\'file it in the issue tracker\\')">File it now</button></div>';
      }

      if (task.summary) stepsContainer.innerHTML += '<div class="step-item"><strong>Outcome:</strong> ' + escapeHtml(task.summary) + '</div>';
      if (task.verification) stepsContainer.innerHTML += '<div class="step-item"><strong>Verified on page:</strong> ' + escapeHtml(task.verification.observedValue) + '</div>';
      if (task.bugReport?.filedUrl) stepsContainer.innerHTML += '<div class="step-item"><a style="color:#38bdf8" target="_blank" rel="noopener" href="' + escapeHtml(task.bugReport.filedUrl) + '">Open verified issue</a></div>';
      if (task.evidenceUrl) stepsContainer.innerHTML += '<div class="step-item"><a style="color:#38bdf8" target="_blank" href="' + HOST + task.evidenceUrl + '">Open evidence packet</a><br/>Room: ' + escapeHtml(task.roomId) + '<br/>Thread: ' + escapeHtml(task.threadId || 'local operator') + '</div>';
      const lastStep = task.steps && task.steps[task.steps.length - 1];
      const imgUrl = task.replayGifUrl || (lastStep && lastStep.screenshotUrl);
      if (imgUrl) {
        document.getElementById('viewport-box').innerHTML =
          '<img src="' + HOST + imgUrl + '?t=' + Date.now() + '" alt="Sandbox Viewport" />';
      }
    }

    function updateHostStatus(status) {
      const b = status.budget;
      document.getElementById('budget-label').textContent = b.usedCalls + ' / ' + b.maxCalls + ' Calls Used';
      document.getElementById('budget-fill').style.width = Math.min(100, (b.usedCalls / b.maxCalls) * 100) + '%';
      document.getElementById('budget-breakdown').textContent =
        'Vision: ' + b.breakdown.vision + ' • STT: ' + b.breakdown.stt + ' • Mode: ' + status.switchMode;
      const coordination = status.coordination;
      document.getElementById('heartbeat-pill').textContent = coordination?.mode === 'console_managed' ? 'Switch via Console-managed agent' : 'Legacy host connector';
      document.getElementById('coordination-status').textContent = coordination?.description + (coordination?.lastAgentContactAt ? ' Last coordinator request: ' + coordination.lastAgentContactAt : ' Awaiting an authenticated coordinator request.');
      document.getElementById('allowlist-box').innerHTML = (status.allowlist || [])
        .map((h) => '✅ <code>' + h + '</code>')
        .join('<br/>');
      if (status.activeTask) renderTask(status.activeTask);
    }

    function connectWs() {
      const ws = new WebSocket('ws://localhost:4100/ws');
      ws.onopen = () => {
        document.getElementById('ws-indicator').textContent = '🟢 Connected to Host :4100';
      };
      ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.event === 'host:status') updateHostStatus(msg.data);
        if (msg.event.startsWith('task:')) {
          renderTask(msg.data.task || msg.data);
        }
      };
      ws.onclose = () => {
        document.getElementById('ws-indicator').textContent = '🟠 Reconnecting...';
        setTimeout(connectWs, 1500);
      };
    }

    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'k') {
        triggerKillSwitch();
      }
    });

    connectWs();
  </script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '');
  if (!local) { res.writeHead(403); res.end('Studio is restricted to the local operator. Pair the iPhone for LAN access.'); return; }
  const origin = req.headers.origin;
  if (origin && ![`http://localhost:${STUDIO_PORT}`, `http://127.0.0.1:${STUDIO_PORT}`].includes(origin)) { res.writeHead(403); res.end('Origin not permitted'); return; }
  if (req.url?.startsWith('/host/api/') || req.url?.startsWith('/host/captures/')) {
    try {
      const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.deskhand/client-credentials.json');
      const credentials = JSON.parse(fs.readFileSync(process.env.DESKHAND_STATE_DIR ? path.join(process.env.DESKHAND_STATE_DIR, 'client-credentials.json') : file, 'utf8'));
      const operator = credentials.find((principal: { kind: string }) => principal.kind === 'operator');
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 8 * 1024 * 1024) throw new Error('Request too large'); chunks.push(Buffer.from(chunk)); }
      const response = await fetch(HOST_API + req.url.slice(5), {
        method: req.method, headers: { Authorization: `Bearer ${operator.token}`, 'Content-Type': 'application/json' },
        ...(req.method !== 'GET' ? { body: Buffer.concat(chunks) } : {})
      });
      res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') || 'application/json', 'Cache-Control':'no-store' });
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(502, { 'Content-Type':'application/json' }); res.end(JSON.stringify({ error: 'Start the browser host before using Studio.' })); }
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(renderStudioHtml());
});
server.listen(STUDIO_PORT, '127.0.0.1', () => console.log(`[Deskhand Studio] Local operator dashboard: http://localhost:${STUDIO_PORT}`));
