export interface AzureConfiguration {
  endpoint: URL;
  key: string;
  deployment: string;
  responses: boolean;
}

/** Accept Azure resource roots, v1 base URLs, and copied full inference URLs. */
export function azureConfiguration(env: NodeJS.ProcessEnv = process.env): AzureConfiguration {
  const raw = env.AZURE_OPENAI_ENDPOINT?.trim();
  const key = env.AZURE_OPENAI_API_KEY?.trim() || env.AI_API_KEY?.trim();
  if (!raw) throw new Error('AZURE_OPENAI_ENDPOINT is required in live mode. Set the Azure resource endpoint in .env.');
  if (!key || key.startsWith('replace-')) throw new Error('AZURE_OPENAI_API_KEY (or AI_API_KEY) is required in live mode.');
  let endpoint: URL;
  try { endpoint = new URL(raw); } catch { throw new Error('AZURE_OPENAI_ENDPOINT must be a valid HTTPS URL.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
  if ((endpoint.protocol !== 'https:' && !(local && endpoint.protocol === 'http:')) || endpoint.username || endpoint.password) {
    throw new Error('AZURE_OPENAI_ENDPOINT must use HTTPS (HTTP is allowed only for local provider tests).');
  }
  const deployment = env.AZURE_OPENAI_DEPLOYMENT?.trim() || env.AI_VISION_MODEL?.trim() || 'gpt-4o';
  const path = endpoint.pathname.replace(/\/$/, '');
  const responses = path.endsWith('/responses');
  if (!responses && !path.endsWith('/chat/completions')) {
    if (path === '' || path === '/openai') {
      endpoint.pathname = `/openai/deployments/${encodeURIComponent(deployment)}/chat/completions`;
    } else if (path.endsWith('/openai/v1')) {
      endpoint.pathname = path + '/chat/completions';
    } else if (/\/openai\/deployments\/[^/]+$/.test(path)) {
      endpoint.pathname = path + '/chat/completions';
    } else {
      throw new Error('Use an Azure resource root, /openai/v1 base URL, or full /chat/completions or /responses URL.');
    }
  }
  if (!endpoint.pathname.includes('/openai/v1/') && !endpoint.searchParams.has('api-version')) {
    endpoint.searchParams.set('api-version', env.AZURE_OPENAI_API_VERSION || '2025-01-01-preview');
  }
  return { endpoint, key, deployment, responses };
}
