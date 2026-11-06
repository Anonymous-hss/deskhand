import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { reportFromEvidence } from '../dist/evidence/bugReport.js';
import { OperatorAuth } from '../dist/auth/operatorAuth.js';
import { TaskRepository } from '../dist/state/taskRepository.js';
import { VoiceTranscriber } from '../dist/stt/voiceTranscriber.js';
function temporary(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deskhand-evidence-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; }
const task = { taskId:'task-123', roomId:'room-A', threadId:'thread-A', prompt:'reproduce coupon', createdAt:new Date().toISOString(), steps:[{stepNumber:1,pageUrl:'http://example.test',action:{type:'navigate'}}] };
test('prompt keywords alone cannot manufacture a bug report', () => {
  assert.equal(reportFromEvidence(task), undefined);
  const observed = { ...task, observedErrors:[{stepNumber:1,errorText:'503 PaymentServiceUnavailable',pageUrl:'http://example.test',screenshotUrl:'/captures/actual.png'}] };
  const report = reportFromEvidence(observed);
  assert.equal(report.title, '503 PaymentServiceUnavailable');
  assert.equal(report.screenshotUrl, '/captures/actual.png');
  assert.equal(report.title.includes('CHAI50'), false);
});
test('raw audio without a transcript rejects without consuming a call', async () => {
  let calls = 0;
  const service = new VoiceTranscriber({ consumeCall() { calls++; } });
  await assert.rejects(service.transcribeVoiceNote({audioBase64:'aW52YWxpZA=='}), /transcript is required/);
  assert.equal(calls, 0);
  assert.equal((await service.transcribeVoiceNote({onDeviceTranscript:'  inspect the shop  '})).transcript, 'inspect the shop');
});
test('bridge credential cannot approve; pairing is single use and gives a server-defined role', t => {
  const dir = temporary(t); const auth = new OperatorAuth(dir);
  const clients = JSON.parse(fs.readFileSync(path.join(dir,'client-credentials.json')));
  const bridge = clients.find(item => item.kind === 'bridge');
  assert.equal(Boolean(auth.canApprove(auth.authenticate('Bearer '+bridge.token))), false);
  assert.equal(auth.authenticate('Bearer forged'), undefined);
  const {code} = auth.issueCode(); const phone = auth.pair(code,'test-device');
  assert.equal(phone.role, 'ops-lead'); assert.equal(Boolean(auth.canApprove(phone)), true);
  assert.throws(() => auth.pair(code,'test-device'), /invalid or expired/);
  assert.equal(new OperatorAuth(dir).authenticate('Bearer '+phone.token).id, phone.id);
});
test('report follow-ups remain scoped to their room and thread', t => {
  const repository = new TaskRepository(temporary(t));
  repository.save({...task,bugReport:{title:'Observed error'}});
  assert.equal(repository.resolveParent('room-A','thread-A').taskId, task.taskId);
  assert.equal(repository.resolveParent('room-A','thread-B'), undefined);
  assert.equal(repository.resolveParent('room-B','thread-A'), undefined);
});
