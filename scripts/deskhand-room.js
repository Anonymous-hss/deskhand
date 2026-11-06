#!/usr/bin/env node
/** Narrow tool for the Switch-managed coordinator. Never prints stored credentials. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const command = args.shift();
const option = name => { const index = args.indexOf('--' + name); return index < 0 ? undefined : args[index + 1]; };
const host = process.env.DESKHAND_HOST || 'http://127.0.0.1:4100';
const credentials = JSON.parse(fs.readFileSync(path.join(process.env.DESKHAND_STATE_DIR || path.join(ROOT, '.deskhand'), 'client-credentials.json'), 'utf8'));
const bridge = credentials.find(item => item.kind === 'bridge');
async function request(route, body) {
  const response = await fetch(host + route, { method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${bridge.token}`, 'Content-Type':'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
function output(task) {
  if (task.steps) task.localEvidenceFiles = task.steps.map(step => path.join(ROOT, 'apps/agent-host/captures', path.basename(step.screenshotUrl))).filter(file => fs.existsSync(file));
  console.log(JSON.stringify(task, null, 2));
}
try {
  if (command === 'status') output(await request('/api/status'));
  else if (command === 'start') {
    if (!option('prompt') || !option('room') || !option('thread')) throw new Error('start requires --prompt, --room and --thread from the Switch conversation.');
    output(await request('/api/tasks', { prompt: option('prompt'), roomId: option('room'), threadId: option('thread'), requestId: option('request'), senderName: option('actor') || 'Slack requester', source: 'switch_chat' }));
  } else if (command === 'file') {
    const source = await request('/api/tasks/' + option('task'));
    output(await request('/api/tasks', { prompt: 'file it in the issue tracker', parentTaskId: source.taskId,
      roomId: source.roomId, threadId: source.threadId, requestId: option('request'), senderName: option('actor') || 'Slack requester', source: 'switch_chat' }));
  } else if (command === 'watch') {
    const deadline = Date.now() + 50000;
    let task;
    do {
      task = await request('/api/tasks/' + option('task'));
      if (!['RUNNING','QUEUED'].includes(task.status)) break;
      await new Promise(resolve => setTimeout(resolve, 1500));
    } while (Date.now() < deadline);
    output(task);
  } else if (command === 'evidence') output(await request('/api/tasks/' + option('task') + '/evidence'));
  else if (command === 'stop') output(await request('/api/kill', {}));
  else throw new Error('Commands: status, start, watch, file, evidence, stop. Approval is intentionally unavailable to the coordinator.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
