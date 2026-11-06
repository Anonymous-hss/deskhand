import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { DeskhandGatewayServer } from '../dist/gateway/server.js';
import { ReplayGenerator } from '../dist/media/gifGenerator.js';

const directories = [];
after(() => directories.forEach(directory => fs.rmSync(directory, { recursive: true, force: true })));
const tick = () => new Promise(resolve => setImmediate(resolve));
const params = { prompt: 'price update', senderName: 'Arjun', senderRole: 'ops-member', source: 'ios_text' };
function harness() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deskhand-gateway-')); directories.push(directory);
  const host = new DeskhandGatewayServer(4100, directory);
  const actions = [];
  host.switchClient = { postRoomMessage: async () => {}, isConnected: () => false, getMode: () => 'stream', getLastHeartbeatAt: () => null };
  host.browser = { approvalContext: async () => ({ digest: 'stable-page' }), getPageSnapshot: async () => ({ url: 'http://localhost:4000/admin', title: 'Admin', interactiveElements: '', textSnippet: '' }), viewport: { width: 1280, height: 800 }, getCurrentUrl: () => 'http://localhost:4000/admin',
    captureStepScreenshot: async () => '/captures/test.png', executeAction: async action => actions.push(action),
    injectTakeoverInput: async input => actions.push(input), stopScreencast: async () => {}, startScreencast: async () => {}, close: async () => {} };
  host.planner = { planNextStep: async (_prompt, step) => step === 0
    ? { thought: 'Change price', action: { type: 'click', selectorHint: '#save-price-btn' }, riskLevel: 'HIGH', needsHumanTakeover: false }
    : { thought: 'Done', action: { type: 'complete' }, riskLevel: 'LOW', needsHumanTakeover: false } };
  host.replay = { generateReplayArtifact: () => '/captures/replay.gif' };
  return { host, actions };
}

test('only an authorized, valid approval resumes the paused browser', async () => {
  const { host, actions } = harness();
  const task = await host.startTask(params);
  await tick();
  assert.equal(task.status, 'AWAITING_APPROVAL');
  assert.equal(host.resolveApproval(task.taskId, 'approve', 'Arjun', 'ops-member').ok, false);
  assert.equal(host.resolveApproval(task.taskId, 'invalid', 'Priya', 'qa-lead').ok, false);
  assert.equal(actions.length, 0);
  assert.equal(host.resolveApproval(task.taskId, 'approve', 'Priya', 'qa-lead').ok, true);
  await tick();
  assert.equal(actions.length, 1);
  assert.equal(task.status, 'COMPLETED');
  assert.equal(host.resolveApproval(task.taskId, 'approve', 'Priya', 'qa-lead').ok, false);
});

test('rejection and emergency stop never execute the risky save', async () => {
  for (const stop of [false, true]) {
    const { host, actions } = harness();
    const task = await host.startTask(params);
    await tick();
    if (stop) await host.emergencyStop();
    else host.resolveApproval(task.taskId, 'reject', 'Priya', 'qa-lead');
    await tick();
    assert.equal(actions.length, 0);
    assert.equal(task.status, stop ? 'FAILED' : 'REJECTED');
    assert.equal(host.approvalResolvers.size, 0);
  }
});

test('concurrent tasks and stale takeover inputs are rejected', async () => {
  const { host, actions } = harness();
  const task = await host.startTask(params);
  await assert.rejects(host.startTask(params), /already running/);
  await assert.rejects(host.handleTakeoverInput({ taskId: task.taskId, type: 'otp_submit', text: '482910' }), /not awaiting/);
  assert.equal(actions.length, 0);
  await host.emergencyStop();
});

test('takeover validates coordinates and OTP before injection', async () => {
  const { host, actions } = harness();
  host.planner.planNextStep = async (_prompt, step) => step === 0
    ? { needsHumanTakeover: true, thought: 'Login', action: { type: 'wait' }, riskLevel: 'LOW' }
    : { needsHumanTakeover: false, thought: 'Done', action: { type: 'complete' }, riskLevel: 'LOW' };
  const task = await host.startTask(params);
  await tick();
  await assert.rejects(host.handleTakeoverInput({ taskId: task.taskId, type: 'tap', x: 1280, y: 10 }), /coordinates/);
  await assert.rejects(host.handleTakeoverInput({ taskId: task.taskId, type: 'otp_submit', text: '123' }), /six-digit/);
  await host.handleTakeoverInput({ taskId: task.taskId, type: 'otp_submit', text: '482910' });
  await tick();
  assert.equal(actions.length, 1);
  assert.equal(task.status, 'COMPLETED');
});

test('real PNG screenshots produce a looping GIF artifact', () => {
  const captures = path.resolve('captures');
  fs.mkdirSync(captures, { recursive: true });
  const pngPath = path.join(captures, 'regression-step.png');
  const gifPath = path.join(captures, 'regression-replay.gif');
  const png = new PNG({ width: 2, height: 2 });
  png.data.fill(255);
  try {
    fs.writeFileSync(pngPath, PNG.sync.write(png));
    const url = new ReplayGenerator().generateReplayArtifact('regression', [{ screenshotUrl: '/captures/regression-step.png' }]);
    assert.equal(url, '/captures/regression-replay.gif');
    const bytes = fs.readFileSync(gifPath);
    assert.equal(bytes.subarray(0, 6).toString(), 'GIF89a');
    assert.ok(bytes.includes(Buffer.from('NETSCAPE2.0')));
  } finally {
    fs.rmSync(pngPath, { force: true });
    fs.rmSync(gifPath, { force: true });
  }
});


test('approval cannot execute after the inspected page changes', async () => {
  const { host, actions } = harness();
  const task = await host.startTask(params);
  await tick();
  assert.equal(task.status, 'AWAITING_APPROVAL');
  host.browser.approvalContext = async () => ({ digest: 'changed-page' });
  host.resolveApproval(task.taskId, 'approve', 'Priya', 'qa-lead');
  await tick();
  assert.equal(actions.length, 0);
  assert.equal(task.status, 'FAILED');
});

test('expired approval cannot execute a risky action', async () => {
  const { host, actions } = harness();
  const task = await host.startTask(params);
  await tick();
  task.pendingApproval.expiresAt = new Date(Date.now() - 1000).toISOString();
  assert.equal(host.resolveApproval(task.taskId, 'approve', 'Priya', 'qa-lead').ok, false);
  assert.equal(actions.length, 0);
  await host.emergencyStop();
});

test('observed bug evidence survives a later invalid model response', async () => {
  const { host } = harness();
  host.browser.getPageSnapshot = async () => ({ url:'http://localhost:4000/shop', title:'Shop', interactiveElements:'', textSnippet:'', observedErrors:['500 Checkout failed'] });
  host.planner.planNextStep = async (_prompt, step) => {
    if (step) throw new Error('Invalid model completion');
    return {thought:'Inspect checkout', action:{type:'navigate',url:'http://localhost:4000/shop'},riskLevel:'LOW',needsHumanTakeover:false};
  };
  const task = await host.startTask({...params,roomId:'room',threadId:'thread'});
  await tick(); await tick();
  assert.equal(task.status,'FAILED');
  assert.equal(task.bugReport.title,'500 Checkout failed');
  assert.equal(host.repository.get(task.taskId).bugReport.title,'500 Checkout failed');
});
