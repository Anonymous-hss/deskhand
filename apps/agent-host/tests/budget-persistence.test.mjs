import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CallBudgetGuard } from '../dist/budget/callBudget.js';

test('corrupt persisted budget fails closed instead of resetting calls to zero', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deskhand-budget-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'budget.json');
  fs.writeFileSync(file, 'invalid JSON');
  assert.throws(() => new CallBudgetGuard(file).consumeCall('vision'), /unreadable/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'invalid JSON');
});

test('a restarted guard preserves the call history and enforces its existing cap', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deskhand-budget-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'budget.json');
  const first = new CallBudgetGuard(file);
  first.consumeCall('vision');
  const restarted = new CallBudgetGuard(file);
  assert.equal(restarted.getStatus().usedCalls, 1);
  restarted.consumeCall('stt');
  assert.equal(restarted.getStatus().usedCalls, 2);
});
