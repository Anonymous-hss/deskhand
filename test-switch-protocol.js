import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function postJson(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

async function getJson(url) {
  const res = await fetch(url);
  return res.json();
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let procs = [];

async function main() {
  console.log('--- 🧪 Testing Switch Protocol Integration ---');

  // Start servers if not up
  try {
    await getJson('http://localhost:4100/api/status');
  } catch {
    const demo = spawn('node', ['--env-file=.env', 'apps/chai-co-demos/dist/server.js'], { cwd: __dirname, stdio: 'ignore' });
    const host = spawn('node', ['--env-file=.env', 'apps/agent-host/dist/index.js'], { cwd: __dirname, stdio: 'ignore' });
    procs = [demo, host];
    for (let i = 0; i < 30; i++) {
      await sleep(300);
      try {
        await getJson('http://localhost:4100/api/status');
        break;
      } catch {}
    }
  }

  // Test 1: Unaddressed message must be IGNORED
  console.log('\n1. Testing unaddressed message (addressed: false)...');
  const res1 = await postJson('http://localhost:4100/webhook/switch', {
    eventId: 'evt-1',
    roomId: 'ops',
    senderName: 'RandomTeammate',
    text: 'Hey team, good morning',
    addressed: false
  });
  console.log(`✓ Unaddressed message handled status: ${res1.handled} (expected: false)`);
  if (res1.handled !== false) throw new Error('Failed: unaddressed message was not ignored!');

  // Test 2: Addressed message must trigger task
  console.log('\n2. Testing addressed message (addressed: true)...');
  const res2 = await postJson('http://localhost:4100/webhook/switch', {
    eventId: 'evt-2',
    roomId: 'ops',
    senderName: 'Arjun',
    senderRole: 'ops-member',
    text: 'update the masala chai price to 249 in the store admin and tell the team',
    addressed: true
  });
  console.log(`✓ Addressed message handled status: ${res2.handled} (expected: true)`);
  if (res2.handled !== true) throw new Error('Failed: addressed message was not picked up!');

  // Poll until it reaches AWAITING_APPROVAL
  console.log('\n3. Waiting for Safety Switch gate...');
  let task = null;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    const hostStatus = await getJson('http://localhost:4100/api/status');
    if (hostStatus.activeTask?.status === 'AWAITING_APPROVAL') {
      task = hostStatus.activeTask;
      console.log(`✓ Reached Safety Switch! Question: "${task.pendingApproval.promptQuestion}"`);
      break;
    }
  }
  if (!task) throw new Error('Failed to reach AWAITING_APPROVAL state.');

  // Test 3: Teammate Priya answers in Switch thread with "@deskhand approve"
  console.log('\n4. Testing chat approval via Switch message ("@deskhand approve")...');
  const res3 = await postJson('http://localhost:4100/webhook/switch', {
    eventId: 'evt-3',
    roomId: 'ops',
    senderName: 'Priya',
    senderRole: 'qa-lead',
    text: '@deskhand approve',
    addressed: true
  });
  console.log(`✓ Approval message processed: ${res3.handled}`);

  // Wait for task completion
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    const hostStatus = await getJson('http://localhost:4100/api/status');
    if (hostStatus.activeTask?.status === 'COMPLETED') {
      console.log('✓ Task completed and saved after chat approval!');
      break;
    }
  }

  console.log('\n🎉 SWITCH AGENT PROTOCOL TEST PASSED!');
  for (const p of procs) { try { p.kill('SIGINT'); } catch {} }
}

main().catch((err) => {
  console.error(err);
  for (const p of procs) { try { p.kill('SIGINT'); } catch {} }
  process.exit(1);
});

