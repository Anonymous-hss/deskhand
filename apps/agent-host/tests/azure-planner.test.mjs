import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { azureConfiguration } from '../dist/config/azure.js';
import { CallBudgetGuard } from '../dist/budget/callBudget.js';
import { VisionPlanner, parseVisionPlan } from '../dist/vision/visionPlanner.js';

function fixture(t, overrides = {}) {
  const keys = ['VISION_MODE', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_DEPLOYMENT', 'AZURE_OPENAI_API_VERSION', 'AI_API_KEY', 'AI_VISION_MODEL'];
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { VISION_MODE: 'live', AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com', AZURE_OPENAI_API_KEY: 'test-only-key', AZURE_OPENAI_DEPLOYMENT: 'gpt-4o', AZURE_OPENAI_API_VERSION: '2025-01-01-preview', ...overrides });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deskhand-provider-'));
  const budget = new CallBudgetGuard(path.join(directory, 'budget.json'));
  t.after(() => {
    for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { budget, planner: new VisionPlanner(budget) };
}
const plan = { thought: 'Open the requested site', action: { type: 'navigate', url: 'https://example.com' }, riskLevel: 'LOW', needsHumanTakeover: false };

test('Azure endpoint normalization supports resource root, v1, and full Responses URL', () => {
  const env = { AZURE_OPENAI_API_KEY: 'test-only', AZURE_OPENAI_DEPLOYMENT: 'gpt-4o', AZURE_OPENAI_API_VERSION: '2025-01-01-preview' };
  assert.equal(azureConfiguration({ ...env, AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com/' }).endpoint.href,
    'https://test.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2025-01-01-preview');
  assert.equal(azureConfiguration({ ...env, AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com/openai/v1/' }).endpoint.pathname, '/openai/v1/chat/completions');
  const full = 'https://test.openai.azure.com/openai/responses?api-version=2025-03-01-preview';
  assert.equal(azureConfiguration({ ...env, AZURE_OPENAI_ENDPOINT: full }).endpoint.href, full);
});

test('missing live configuration neither calls a provider nor consumes the budget', async t => {
  const { budget, planner } = fixture(t, { AZURE_OPENAI_ENDPOINT: '' });
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; throw Error('Unexpected provider request'); });
  await assert.rejects(planner.planNextStep('price update', 0), /AZURE_OPENAI_ENDPOINT/);
  assert.equal(requests, 0);
  assert.equal(budget.getStatus().usedCalls, 0);
});

test('live planner sends current screenshot and uses validated Azure output', async t => {
  const { budget, planner } = fixture(t);
  let requestBody;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.pathname, '/openai/deployments/gpt-4o/chat/completions');
    requestBody = JSON.parse(options.body);
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(plan) } }] });
  });
  const screenshotDataUrl = 'data:image/jpeg;base64,dGVzdA==';
  const result = await planner.planNextStep('open example.com', 0, undefined,
    { url: 'about:blank', title: '', interactiveElements: '', textSnippet: '', screenshotDataUrl });
  assert.equal(result.action.url, 'https://example.com');
  assert.equal(requestBody.messages[1].content[1].image_url.url, screenshotDataUrl);
  assert.equal(requestBody.model, 'gpt-4o');
  assert.equal(budget.getStatus().usedCalls, 1);
});

for (const status of [401, 403, 429]) {
  test(`provider HTTP ${status} trips the persisted breaker and prevents more requests`, async t => {
    const { budget, planner } = fixture(t);
    let requests = 0;
    t.mock.method(globalThis, 'fetch', async () => { requests++; return new Response('', { status }); });
    await assert.rejects(planner.planNextStep('open example.com', 0), /CallBudgetGuard/);
    assert.equal(budget.getStatus().halted, true);
    await assert.rejects(planner.planNextStep('open example.com', 1), /HALTED/);
    assert.equal(requests, 1);
  });
}

test('provider failures and invalid JSON fail rather than executing demo fallback', async t => {
  const { planner } = fixture(t);
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 500 }));
  await assert.rejects(planner.planNextStep('masala price 249', 0), /HTTP 500/);
  mock.mock.mockImplementation(async () => Response.json({ choices: [{ message: { content: 'not JSON' } }] }));
  await assert.rejects(planner.planNextStep('masala price 249', 0), /invalid JSON/);
});

test('Responses output extraction skips non-message output items', async t => {
  const { planner } = fixture(t, { AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com/openai/responses' });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ output: [
    { type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(plan) }] }
  ] }));
  assert.equal((await planner.planNextStep('open example.com', 0)).action.type, 'navigate');
});

test('model actions must have a recognized type, risk, valid URL, and real target', () => {
  for (const invalid of [
    { ...plan, action: { type: 'execute_shell', text: 'bad' } },
    { ...plan, riskLevel: undefined },
    { ...plan, action: { type: 'navigate', url: 'file:///private/file' } },
    { ...plan, action: { type: 'click' } },
    { ...plan, needsHumanTakeover: 'false' }
  ]) assert.throws(() => parseVisionPlan(JSON.stringify(invalid)), /invalid browser plan/);
});

test('completed model plans carry an explicit final result rather than a progress caption', () => {
  assert.throws(() => parseVisionPlan(JSON.stringify({ thought: 'Reading the result', action: { type: 'complete' }, riskLevel: 'LOW' })), /invalid browser plan/);
  const result = parseVisionPlan(JSON.stringify({ thought: 'Reading the result', result: 'The observed value is 249', action: { type: 'complete' }, riskLevel: 'LOW' }));
  assert.equal(result.result, 'The observed value is 249');
});
