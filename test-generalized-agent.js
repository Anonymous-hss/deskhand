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

let spawned = [];

async function testGeneralizedAgent() {
  console.log('--- 🧪 Testing Generalized Web Computer Agent with Azure OpenAI gpt-4o ---');

  try {
    await getJson('http://localhost:4100/api/status');
  } catch {
    console.log('[Test] Spawning background agent-host...');
    const host = spawn('node', ['--env-file=.env', 'apps/agent-host/dist/index.js'], { cwd: __dirname, stdio: 'ignore' });
    spawned = [host];
    for (let i = 0; i < 30; i++) {
      await sleep(300);
      try {
        await getJson('http://localhost:4100/api/status');
        break;
      } catch {}
    }
  }

  // 1. Submit a completely generalized web request (not Chai Co.)
  const prompt = 'Open https://example.com and check the page header title';
  console.log(`\nSubmitting Generalized Goal: "${prompt}"...`);

  const task = await postJson('http://localhost:4100/api/tasks', {
    prompt,
    senderName: 'Arjun',
    senderRole: 'ops-lead',
    source: 'switch_chat'
  });

  console.log(`✓ Task Started: ${task.taskId}`);

  // Poll for steps and completion
  let finalTask = null;
  for (let i = 0; i < 40; i++) {
    await sleep(800);
    const status = await getJson('http://localhost:4100/api/status');
    const t = status.activeTask;
    if (t && t.taskId === task.taskId) {
      if (t.steps.length > 0) {
        const lastStep = t.steps[t.steps.length - 1];
        console.log(`  Step ${lastStep.stepNumber}: ${lastStep.thought} [${lastStep.action.type}]`);
      }
      if (t.status === 'COMPLETED' || t.status === 'FAILED') {
        finalTask = t;
        break;
      }
    }
  }

  if (!finalTask) {
    throw new Error('Generalized task timed out before completing.');
  }

  console.log(`\n✓ Final Task Status: ${finalTask.status}`);
  console.log(`✓ Steps Executed: ${finalTask.steps.length}`);
  console.log(`✓ Final Summary: "${finalTask.summary}"`);
  console.log(`✓ Screenshot captured: ${finalTask.steps[0]?.screenshotUrl}`);

  if (finalTask.status !== 'COMPLETED') {
    throw new Error(`Task did not complete successfully. Status: ${finalTask.status}`);
  }

  console.log('\n🎉 GENERALIZED WEB AGENT TEST PASSED SUCCESSFULLY!');
  for (const p of spawned) { try { p.kill('SIGINT'); } catch {} }
}

testGeneralizedAgent().catch((err) => {
  console.error('Test failed:', err);
  for (const p of spawned) { try { p.kill('SIGINT'); } catch {} }
  process.exit(1);
});
