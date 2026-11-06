import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CallBudgetGuard } from './apps/agent-host/dist/budget/callBudget.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_BUDGET_FILE = path.join(__dirname, 'data/test-budget.json');

async function testBudgetGuard() {
  console.log('--- 🧪 Testing Hard Call Budget & Circuit Breaker Guard ---');

  // Clean test file
  if (fs.existsSync(TEST_BUDGET_FILE)) fs.unlinkSync(TEST_BUDGET_FILE);

  const guard = new CallBudgetGuard(TEST_BUDGET_FILE);

  // 1. Initial State
  const initial = guard.getStatus();
  console.log(`1. Initial budget: ${initial.usedCalls}/${initial.maxCalls}, halted=${initial.halted}`);
  if (initial.usedCalls !== 0 || initial.halted !== false) throw new Error('Initial state invalid');

  // 2. Consume 1 vision call
  guard.consumeCall('vision');
  const after1 = guard.getStatus();
  console.log(`2. After 1 vision call: used=${after1.usedCalls}, breakdown.vision=${after1.breakdown.vision}`);
  if (after1.usedCalls !== 1 || after1.breakdown.vision !== 1) throw new Error('Consume call failed');

  // 3. Consume 1 stt call
  guard.consumeCall('stt');
  const after2 = guard.getStatus();
  console.log(`3. After 1 STT call: used=${after2.usedCalls}, breakdown.stt=${after2.breakdown.stt}`);
  if (after2.usedCalls !== 2 || after2.breakdown.stt !== 1) throw new Error('STT consume failed');

  // 4. Test Circuit Breaker: HTTP 429 Rate Limit Tripwire
  console.log('4. Testing Circuit Breaker trip on HTTP 429...');
  try {
    guard.inspectHttpStatus(429);
    throw new Error('Should have thrown on 429');
  } catch (err) {
    console.log(`✓ Circuit breaker tripped as expected: "${err.message}"`);
  }

  const haltedStatus = guard.getStatus();
  console.log(`✓ Budget file halted state: halted=${haltedStatus.halted}, reason="${haltedStatus.haltReason}"`);
  if (!haltedStatus.halted) throw new Error('Guard did not halt on 429');

  // 5. Subsequent calls must be blocked
  try {
    guard.consumeCall('vision');
    throw new Error('Should have blocked call when halted');
  } catch (err) {
    console.log(`✓ Blocked subsequent calls while halted: "${err.message}"`);
  }

  // Cleanup test file
  if (fs.existsSync(TEST_BUDGET_FILE)) fs.unlinkSync(TEST_BUDGET_FILE);

  console.log('🎉 CALL BUDGET GUARD TEST PASSED!\n');
}

testBudgetGuard().catch((err) => {
  console.error(err);
  if (fs.existsSync(TEST_BUDGET_FILE)) fs.unlinkSync(TEST_BUDGET_FILE);
  process.exit(1);
});

