import { azureConfiguration } from '../apps/agent-host/dist/config/azure.js';
const mode = process.env.VISION_MODE || 'mock';
console.log('Vision mode:', mode);
console.log('Switch mode:', process.env.SWITCH_MODE || 'stream');
console.log('Generalized agent:', process.env.GENERALIZED_AGENT === 'true');
console.log('All web domains:', process.env.ALLOW_ALL_DOMAINS === 'true');
if (mode === 'live') {
  try {
    const config = azureConfiguration();
    console.log('Azure host:', config.endpoint.hostname);
    console.log('Deployment:', config.deployment);
    console.log('API:', config.responses ? 'Responses' : 'Chat Completions');
    console.log('Credential configured: yes (value hidden)');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
} else { console.log('Mock mode: no Azure API calls will be made.'); }
