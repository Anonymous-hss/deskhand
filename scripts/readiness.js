import fs from 'node:fs';
import { azureConfiguration } from '../apps/agent-host/dist/config/azure.js';
const checks = [];
function record(name, ready, detail) { checks.push({ name, ready, detail }); }
try { const config = azureConfiguration(); record('Azure configuration', true, `${config.deployment} · ${config.responses ? 'Responses' : 'Chat Completions'}`); }
catch (error) { record('Azure configuration', false, error.message); }
const endpoints = [['Demo apps', 'http://localhost:4000/shop'], ['Agent host', `http://localhost:${process.env.PORT || 4100}/api/status`], ['Studio', 'http://localhost:4200']];
await Promise.all(endpoints.map(async ([name, url]) => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    record(name, response.ok, `HTTP ${response.status}`);
    if (name === 'Agent host' && response.ok) {
      const status = await response.json();
      if (status.coordination?.mode === 'console_managed') {
        record('Coordination mode', true, 'Console-managed coordinator configured; direct host link is unused. Verify Slack delivery separately.');
      } else record('Legacy Switch connection', status.switchConnected, status.switchConnected ? 'Heartbeat connected' : 'Check the optional legacy transport configuration');
      record('API budget', !status.budget.halted, `${status.budget.usedCalls}/${status.budget.maxCalls}`);
    }
  } catch { record(name, false, 'Run npm run dev'); }
}));
record('Development IPA', fs.existsSync('build/DeskhandMobile-Development.ipa'), 'build/DeskhandMobile-Development.ipa');
console.table(checks);
console.log('No model requests were made. Physical iPhone installation additionally requires an unlocked, connected device.');
if (checks.some(check => !check.ready)) process.exitCode = 1;
