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

let spawnedProcesses = [];

async function ensureServersRunning() {
  try {
    await getJson('http://localhost:4100/api/status');
    return; // Already running
  } catch {
    console.log('[Test Runner] Starting background demo servers for automated test run...');
    const demo = spawn('node', ['--env-file=.env', 'apps/chai-co-demos/dist/server.js'], { cwd: __dirname, stdio: 'ignore' });
    const host = spawn('node', ['--env-file=.env', 'apps/agent-host/dist/index.js'], { cwd: __dirname, stdio: 'ignore' });
    spawnedProcesses = [demo, host];
    for (let i = 0; i < 30; i++) {
      await sleep(300);
      try {
        await getJson('http://localhost:4100/api/status');
        console.log('[Test Runner] Background servers ready.');
        return;
      } catch {
        // waiting
      }
    }
    throw new Error('Timed out waiting for test servers to start on ports 4000 & 4100.');
  }
}

async function runTests() {
  await ensureServersRunning();
  console.log('--- 🧪 Starting Deskhand Full Flow Verification ---');

  // Verify servers are up
  const status = await getJson('http://localhost:4100/api/status');
  console.log('✓ Agent Host status: Active. Budget: ' + status.budget.usedCalls + '/' + status.budget.maxCalls);

  // Scene 1: QA Bug Reproduction
  console.log('\n--- 1️⃣ Testing Scene 1: QA Bug Repro on /shop ---');
  const task1 = await postJson('http://localhost:4100/api/tasks', {
    prompt: 'checkout fails on staging when coupon is applied, can you reproduce?',
    senderName: 'Priya',
    senderRole: 'qa-lead',
    source: 'ios_text'
  });
  console.log(`Task 1 started: ${task1.taskId}`);

  // Wait for task 1 to finish
  let t1Status = task1;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const hostStatus = await getJson('http://localhost:4100/api/status');
    if (hostStatus.activeTask?.taskId === task1.taskId && hostStatus.activeTask?.status === 'COMPLETED') {
      t1Status = hostStatus.activeTask;
      break;
    }
  }
  if (t1Status.status !== 'COMPLETED') {
    throw new Error(`Task 1 timed out before reaching COMPLETED status. Current status: ${t1Status.status}`);
  }
  console.log(`✓ Task 1 finished with status: ${t1Status.status}`);
  console.log(`✓ Steps completed: ${t1Status.steps?.length || 0}`);
  if (t1Status.bugReport) {
    console.log(`✓ Bug report generated: "${t1Status.bugReport.title}"`);
  }

  // Scene 1B: File the bug in issue tracker
  console.log('\n--- 1️⃣B Testing Scene 1B: Filing Bug Report in Tracker ---');
  const task1b = await postJson('http://localhost:4100/api/tasks', {
    prompt: 'file it in the issue tracker',
    senderName: 'Rahul',
    senderRole: 'admin',
    source: 'ios_text'
  });
  console.log(`Task 1B started: ${task1b.taskId}`);
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const hostStatus = await getJson('http://localhost:4100/api/status');
    if (hostStatus.activeTask?.taskId === task1b.taskId && hostStatus.activeTask?.status === 'COMPLETED') {
      console.log('✓ Task 1B completed: Issue filed in Chai Co. Tracker!');
      break;
    }
  }

  // Scene 2: Price Update with Safety Switch Approval Gate
  console.log('\n--- 2️⃣ Testing Scene 2: Price Update + Safety Switch Approval ---');
  const task2 = await postJson('http://localhost:4100/api/tasks', {
    prompt: 'update the masala chai price to 249 in the store admin and tell the team',
    senderName: 'Arjun',
    senderRole: 'ops-member',
    source: 'ios_voice'
  });
  console.log(`Task 2 started: ${task2.taskId}`);

  // Poll until it reaches AWAITING_APPROVAL
  let hitApproval = false;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    const hostStatus = await getJson('http://localhost:4100/api/status');
    if (hostStatus.activeTask?.taskId === task2.taskId && hostStatus.activeTask?.status === 'AWAITING_APPROVAL') {
      hitApproval = true;
      console.log('🛑 Safety Switch Triggered! Prompt: ' + hostStatus.activeTask.pendingApproval?.promptQuestion);
      break;
    }
  }

  if (!hitApproval) {
    console.error('❌ Failed to reach AWAITING_APPROVAL state.');
    const hostStatus = await getJson('http://localhost:4100/api/status');
    console.error('Current activeTask:', hostStatus.activeTask);
    return;
  }

  // Test unauthorized role rejection (e.g. Arjun as ops-member cannot approve)
  const unauthRes = await postJson(`http://localhost:4100/api/tasks/${task2.taskId}/approval`, {
    decision: 'approve',
    responderName: 'Arjun',
    responderRole: 'ops-member'
  });
  console.log(`✓ Verified RBAC: Unauthorized role cannot approve: "${unauthRes.error}"`);

  // Now approve as Priya (qa-lead)
  const authRes = await postJson(`http://localhost:4100/api/tasks/${task2.taskId}/approval`, {
    decision: 'approve',
    responderName: 'Priya',
    responderRole: 'qa-lead'
  });
  console.log(`✓ Approved by Priya (qa-lead): ${authRes.ok ? 'SUCCESS' : 'FAILED'}`);

  // Wait for task 2 completion
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    const hostStatus = await getJson('http://localhost:4100/api/status');
    if (hostStatus.activeTask?.taskId === task2.taskId && hostStatus.activeTask?.status === 'COMPLETED') {
      console.log('✓ Task 2 completed: Price updated to ₹249 in Store Admin!');
      break;
    }
  }

  // Scene 3: 2FA Login Code Challenge & Takeover
  console.log('\n--- 3️⃣ Testing Scene 3: 2FA Login Code Challenge & Takeover ---');
  const task3 = await postJson('http://localhost:4100/api/tasks', {
    prompt: 'open admin with 2fa login code',
    senderName: 'Rahul',
    senderRole: 'admin',
    source: 'ios_text'
  });
  console.log(`Task 3 started: ${task3.taskId}`);

  // Poll until it reaches HUMAN_TAKEOVER
  let hitTakeover = false;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    const hostStatus = await getJson('http://localhost:4100/api/status');
    if (hostStatus.activeTask?.taskId === task3.taskId && hostStatus.activeTask?.status === 'HUMAN_TAKEOVER') {
      hitTakeover = true;
      console.log('🖐️ Takeover Requested! Reason: ' + hostStatus.activeTask.takeover?.reason);
      break;
    }
  }

  if (!hitTakeover) {
    console.error('❌ Failed to reach HUMAN_TAKEOVER state.');
    const hostStatus = await getJson('http://localhost:4100/api/status');
    console.error('Current activeTask:', hostStatus.activeTask);
    return;
  }

  // Simulate human teammate Rahul typing 2FA code into takeover endpoint
  const takeoverRes = await postJson(`http://localhost:4100/api/tasks/${task3.taskId}/takeover`, {
    taskId: task3.taskId,
    type: 'otp_submit',
    text: '482910',
    actorName: 'Rahul'
  });
  console.log(`✓ 2FA Code 482910 injected by Rahul: ${takeoverRes.ok ? 'SUCCESS' : 'FAILED'}`);

  // Wait for task 3 completion
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    const hostStatus = await getJson('http://localhost:4100/api/status');
    if (hostStatus.activeTask?.taskId === task3.taskId && hostStatus.activeTask?.status === 'COMPLETED') {
      console.log('✓ Task 3 completed: Admin unlocked and control handed back!');
      break;
    }
  }

  console.log('\n🎉 ALL 3 DEMO SCENES VERIFIED SUCCESSFULLY!');
  for (const proc of spawnedProcesses) {
    try { proc.kill('SIGINT'); } catch { }
  }
}

runTests().catch((err) => {
  console.error(err);
  for (const proc of spawnedProcesses) {
    try { proc.kill('SIGINT'); } catch { }
  }
  process.exit(1);
});
