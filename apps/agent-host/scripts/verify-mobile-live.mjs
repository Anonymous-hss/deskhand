// Run only against disposable local demo servers: resets demo state and stops the active task.
import assert from 'node:assert/strict';
import WebSocket from 'ws';
const host = process.env.MOBILE_TEST_HOST || 'http://localhost:4100';
const demo = process.env.MOBILE_TEST_DEMOS || 'http://localhost:4000';
const frames = [];
const socket = new WebSocket('ws://localhost:4100/ws');
socket.on('message', raw => { const event = JSON.parse(raw); if (event.event === 'takeover:frame') frames.push(event.data); });
await new Promise(resolve => socket.on('open', resolve));
async function post(url, body = {}) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await response.json();
  assert.ok(response.ok, JSON.stringify(json)); return json;
}
async function status() { return (await (await fetch(host + '/api/status')).json()).activeTask; }
async function waitFor(test, label) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const task = await status();
    if (task?.status === 'FAILED') throw new Error(task.summary);
    if (test(task)) return task;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('Timed out: ' + label);
}
async function start(prompt, voice = false) {
  return post(host + '/api/tasks', { prompt, onDeviceTranscript: voice ? prompt : undefined,
    source: voice ? 'ios_voice' : 'ios_text', senderName: 'Arjun', senderRole: 'ops-member' });
}
try {
  await post(demo + '/api/demo-reset');
  const price = await start('update masala chai price to 249', true);
  await waitFor(t => t?.status === 'AWAITING_APPROVAL', 'price approval');
  let state = await (await fetch(demo + '/api/demo-state')).json();
  assert.equal(state.masalaChaiPrice, 229);
  const rejectedRole = await fetch(host + `/api/tasks/${price.taskId}/approval`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({decision: 'approve', responderName: 'Arjun', responderRole: 'ops-member'}) });
  assert.equal(rejectedRole.status, 403);
  await post(host + `/api/tasks/${price.taskId}/approval`, {decision: 'approve', responderName: 'Priya', responderRole: 'qa-lead'});
  const saved = await waitFor(t => t?.status === 'COMPLETED', 'price save');
  state = await (await fetch(demo + '/api/demo-state')).json();
  assert.equal(state.masalaChaiPrice, 249);
  assert.ok(saved.steps.every(step => step.screenshotUrl.endsWith('.png')));
  assert.ok(saved.replayGifUrl.endsWith('.gif'));
  const gif = await fetch(host + saved.replayGifUrl); assert.equal(gif.headers.get('content-type'), 'image/gif');
  const otp = await start('log into admin with 2fa login code');
  await waitFor(t => t?.status === 'HUMAN_TAKEOVER', 'OTP takeover');
  await new Promise(resolve => setTimeout(resolve, 800));
  assert.ok(frames.some(frame => frame.taskId === otp.taskId && frame.jpegBase64.length > 100));
  await post(host + `/api/tasks/${otp.taskId}/takeover`, {type: 'otp_submit', text: '482910', actorName: 'Rahul'});
  await waitFor(t => t?.status === 'COMPLETED', 'OTP hand-back');
  await start('reproduce checkout coupon CHAI50');
  const qa = await waitFor(t => t?.status === 'COMPLETED', 'QA reproduction');
  assert.ok(qa.bugReport);
  const budget = (await (await fetch(host + '/api/status')).json()).budget;
  assert.equal(budget.usedCalls, 0);
  console.log(JSON.stringify({priceSaved: state.masalaChaiPrice, realPNGs: saved.steps.length, replay: saved.replayGifUrl, takeoverFrames: frames.length, qaBugReport: qa.bugReport.title, apiCalls: budget.usedCalls}, null, 2));
} finally { socket.close(); await post(host + '/api/kill'); }
