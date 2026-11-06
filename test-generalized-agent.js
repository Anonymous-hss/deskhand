// Isolated live-planner integration: real Chromium + local Azure-compatible fixture, no paid API calls.
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deskhand-generalized-'));
const requests = [];
const live = process.argv.includes('--azure-live');
let child;
const server = http.createServer(async (req, res) => {
  if (req.url === '/page') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<title>Deskhand local integration</title><button id="reveal-title" onclick="document.body.append(\'Deskhand generalized check passed\')">Reveal result</button>');
    return;
  }
  let body = '';
  for await (const chunk of req) body += chunk;
  const payload = JSON.parse(body);
  requests.push(payload);
  const prompt = payload.messages[1].content[0].text;
  let plan;
  if (prompt.includes('Step Number: 1')) plan = { thought: 'Open the requested local page', action: { type: 'navigate', url: `http://127.0.0.1:${server.address().port}/page` } };
  else if (prompt.includes('Step Number: 2')) {
    assert.ok(payload.messages[1].content.some(part => part.type === 'image_url'));
    assert.ok(prompt.includes('#reveal-title'));
    plan = { thought: 'Reveal the requested result', action: { type: 'click', selectorHint: '#reveal-title' } };
  } else {
    assert.ok(prompt.includes('Deskhand generalized check passed'));
    plan = { thought: 'Verification complete', result: 'Verified: Deskhand generalized check passed', action: { type: 'complete' } };
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ ...plan, riskLevel: 'LOW', needsHumanTakeover: false }) } }] }));
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const portProbe = http.createServer();
  await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
  const port = portProbe.address().port;
  await new Promise(resolve => portProbe.close(resolve));
  const host = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['apps/agent-host/dist/index.js'], { cwd: root, stdio: 'ignore', env: {
    ...process.env, DESKHAND_STATE_DIR: directory, PORT: String(port), VISION_MODE: 'live', AI_PROVIDER: 'azure',
    ...(live ? {} : { AZURE_OPENAI_ENDPOINT: `http://127.0.0.1:${server.address().port}`, AZURE_OPENAI_API_KEY: 'local-test-only',
      AZURE_OPENAI_DEPLOYMENT: 'gpt-4o', CALL_BUDGET_FILE: path.join(directory, 'budget.json') }),
    GENERALIZED_AGENT: 'true', ALLOW_ALL_DOMAINS: 'true', MAX_TASK_STEPS: '6',
    SWITCH_SERVER_URL: 'http://127.0.0.1:17700'
  } });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(host + '/api/status')).ok) break; } catch {}
    if (child.exitCode !== null) throw new Error('Local test host failed to start');
    await sleep(100);
  }
  const credential = JSON.parse(fs.readFileSync(path.join(directory, 'client-credentials.json'), 'utf8')).find(item => item.kind === 'bridge');
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${credential.token}` };
  const before = await (await fetch(host + '/api/status')).json();
  const response = await fetch(host + '/api/tasks', { method: 'POST', headers,
    body: JSON.stringify({ prompt: `Open http://127.0.0.1:${server.address().port}/page, click Reveal result, read the verification result that appears, and report it exactly. This is a disposable local test page.`, senderName: 'Arjun', senderRole: 'ops-member', source: 'ios_text' }) });
  assert.equal(response.status, 201);
  let final;
  for (let i = 0; i < (live ? 600 : 120); i++) {
    final = await (await fetch(host + '/api/status')).json();
    if (['FAILED', 'COMPLETED', 'HALTED_BY_BUDGET'].includes(final.activeTask?.status)) break;
    await sleep(150);
  }
  assert.equal(final.activeTask?.status, 'COMPLETED', final.activeTask?.summary);
  assert.ok(final.activeTask.summary.includes('Deskhand generalized check passed'), final.activeTask.summary);
  assert.ok(final.activeTask.steps.length >= 2);
  const calls = final.budget.usedCalls - before.budget.usedCalls;
  assert.equal(final.activeTask.callsUsed, calls);
  if (!live) { assert.equal(requests.length, 3); assert.equal(calls, 3); }
  console.log(`PASS: generalized planner navigated, received browser context, clicked the target, and verified the result. Provider: ${live ? 'real Azure gpt-4o' : 'local fixture'}. Requests: ${calls}. Budget: ${final.budget.usedCalls}/${final.budget.maxCalls}.`);
  await fetch(host + '/api/kill', { method: 'POST', headers });
} finally {
  child?.kill('SIGINT');
  if (child && child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(directory, { recursive: true, force: true });
}
