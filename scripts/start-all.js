import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const processes = [];

function startProcess(name, cmd, args, cwd) {
  const child = spawn(cmd, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env }
  });
  processes.push({ name, child });

  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[${name}] Exited with code ${code}`);
    }
  });

  return child;
}

console.log('====================================================');
console.log('🚀 Starting All Deskhand Services for Hackathon Demo');
console.log('====================================================');

// 1. Chai Co. Demos (Port 4000)
startProcess(
  'Chai-Co-Demos',
  'node',
  ['apps/chai-co-demos/dist/server.js'],
  ROOT
);

// 2. Deskhand Agent Host (Port 4100)
startProcess(
  'Agent-Host',
  'node',
  ['apps/agent-host/dist/index.js'],
  ROOT
);

// 3. Deskhand Desktop Studio UI (Port 4200)
startProcess(
  'Studio-UI',
  'node',
  ['apps/windows-studio/dist/studioServer.js'],
  ROOT
);

console.log('\n🌟 Services Initializing:');
console.log('  • Chai Co. Demos:       http://localhost:4000/shop');
console.log('  • Agent Host & WS:      http://localhost:4100 (ws://localhost:4100/ws)');
console.log('  • Desktop Studio UI:    http://localhost:4200\n');
console.log('Press Ctrl+C to stop all services.\n');

function cleanShutdown() {
  console.log('\n🛑 Shutting down all Deskhand processes...');
  for (const { child } of processes) {
    try {
      child.kill('SIGINT');
    } catch {
      // ignore
    }
  }
  process.exit(0);
}

process.on('SIGINT', cleanShutdown);
process.on('SIGTERM', cleanShutdown);
