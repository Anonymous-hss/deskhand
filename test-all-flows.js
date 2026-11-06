// Isolated real Chromium workflow checks; deterministic planner, zero paid calls.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
const root = path.dirname(new URL(import.meta.url).pathname);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deskhand-flows-'));
const children = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function port() { const s = http.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise(r => s.close(r)); return p; }
const hostPort = await port(), demoPort = await port();
const base = `http://127.0.0.1:${hostPort}`;
let credentials;
async function request(route, body, kind = 'bridge', expected = 200) {
  const token = credentials?.find(x => x.kind === kind)?.token;
  const r = await fetch(base + route, {method: body === undefined ? 'GET' : 'POST', headers: {'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {})}, ...(body === undefined ? {} : {body:JSON.stringify(body)})});
  const data = await r.json(); assert.equal(r.status, expected, JSON.stringify(data)); return data;
}
async function wait(task, target = 'COMPLETED') {
  for (let i = 0; i < 180; i++) { const t = await request(`/api/tasks/${task.taskId}`); if (t.status === target) return t; if (['FAILED','REJECTED','HALTED_BY_BUDGET'].includes(t.status)) throw new Error(JSON.stringify(t)); await sleep(200); }
  throw new Error(`Timeout awaiting ${target}`);
}
async function start(prompt, extra = {}) { return request('/api/tasks', {prompt, roomId:'test-room', threadId:'test-thread', source:'switch_chat', senderName:'Test requester', ...extra}, 'bridge', 201); }
try {
  const env = {...process.env, VISION_MODE:'mock', DEMO_PORT:String(demoPort), PORT:String(hostPort), DEMO_APPS_URL:`http://127.0.0.1:${demoPort}`, DESKHAND_STATE_DIR:directory, CALL_BUDGET_FILE:path.join(directory,'budget.json'), SWITCH_TRANSPORT:'console_managed', ALLOW_ALL_DOMAINS:'true', GENERALIZED_AGENT:'false'};
  for (const file of ['apps/chai-co-demos/dist/server.js','apps/agent-host/dist/index.js']) children.push(spawn(process.execPath,[file],{cwd:root,env,stdio:'ignore'}));
  for(let i=0;i<80;i++){try{if((await fetch(base+'/api/status')).ok)break;}catch{} await sleep(100);}
  credentials = JSON.parse(fs.readFileSync(path.join(directory,'client-credentials.json'),'utf8'));
  await request('/api/tasks',{prompt:'unauthenticated'},'none',401);
  const report = await wait(await start('Reproduce checkout failure with coupon CHAI50'));
  assert.ok(report.observedErrors?.length); assert.ok(report.bugReport?.title.includes('500'));
  const filed = await wait(await start('file it in the issue tracker',{parentTaskId:report.taskId}));
  assert.equal(filed.verification?.kind,'issue_created');
  assert.equal((await fetch(filed.bugReport.filedUrl)).status,200);
  const price = await wait(await start('Update the masala chai price to 249 in the store admin'), 'AWAITING_APPROVAL');
  assert.equal(price.pendingApproval.observedDiff.after,'₹249');
  const route = `/api/tasks/${price.taskId}/approval`;
  await request(route,{decision:'approve',approvalId:price.pendingApproval.approvalId,responderRole:'admin'},'bridge',403);
  await request(route,{decision:'approve',approvalId:'stale'},'operator',409);
  await request(route,{decision:'approve',approvalId:price.pendingApproval.approvalId},'operator');
  const saved = await wait(price); assert.equal(saved.verification?.kind,'price_saved'); assert.equal(saved.verification.observedValue,'₹249');
  const status = await request('/api/status'); assert.equal(status.budget.usedCalls,0);
  console.log('PASS: actual checkout error → report → verified issue URL; price pause → bridge/stale approval rejection → authenticated approval → verified saved price. Real Chromium, mock planner, zero paid calls.');
} finally {
  for(const child of children) child.kill('SIGINT');
  await Promise.all(children.map(child=>child.exitCode === null ? new Promise(r=>child.once('exit',r)) : undefined));
  fs.rmSync(directory,{recursive:true,force:true});
}
