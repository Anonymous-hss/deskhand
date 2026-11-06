import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SwitchConnector, decodeSSE } from '../dist/switch/switchConnector.js';
import { SafetyEngine } from '../dist/safety/safetyEngine.js';

test('Switch event decoder handles split UTF-8, CRLF, comments, and multiline data', async () => {
  const bytes = new TextEncoder().encode(': heartbeat\r\ndata: {"text":"₹249",\r\ndata: "addressed":true}\r\n\r\n');
  const stream = new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } });
  const events = [];
  for await (const payload of decodeSSE(stream)) events.push(JSON.parse(payload));
  assert.deepEqual(events, [{ text: '₹249', addressed: true }]);
});

test('Switch ignores unaddressed/malformed/replayed events and dispatches once', () => {
  const connector = new SwitchConnector();
  const messages = [];
  connector.onAddressedMessage(message => messages.push(message));
  const event = { eventId: 'event-1', roomId: 'ops', senderName: 'Priya', text: 'approve', addressed: true };
  assert.equal(connector.handleIncomingSwitchEvent({ ...event, addressed: 'true' }), false);
  assert.equal(connector.handleIncomingSwitchEvent({ ...event, addressed: false }), false);
  assert.equal(connector.handleIncomingSwitchEvent(event), true);
  assert.equal(connector.handleIncomingSwitchEvent(event), false);
  assert.equal(messages.length, 1);
});

test('LOW model risk cannot bypass deterministic submit/delete gates', () => {
  const safety = new SafetyEngine();
  const plan = { thought: 'Delete account', action: { type: 'click', selectorHint: '#delete-account' }, riskLevel: 'LOW', needsHumanTakeover: false };
  assert.equal(safety.requiresTeamApproval(plan, 'https://example.com').required, true);
  const issue = { ...plan, thought: 'Submit issue', action: { type: 'click', selectorHint: '#submit-issue-btn' } };
  assert.equal(safety.requiresTeamApproval(issue, 'http://localhost:4000/issues').required, false);
  assert.equal(safety.requiresTeamApproval(issue, 'https://example.com/issues').required, true);
});

test('ALLOW_ALL_DOMAINS permits web domains while rejecting non-HTTP schemes', () => {
  const previous = process.env.ALLOW_ALL_DOMAINS;
  process.env.ALLOW_ALL_DOMAINS = 'true';
  try {
    const safety = new SafetyEngine();
    assert.equal(safety.isUrlAllowed('https://example.org/path'), true);
    assert.equal(safety.isUrlAllowed('file:///tmp/private'), false);
    assert.equal(safety.isUrlAllowed('javascript:alert(1)'), false);
  } finally {
    if (previous === undefined) delete process.env.ALLOW_ALL_DOMAINS; else process.env.ALLOW_ALL_DOMAINS = previous;
  }
});

test('Switch connects to a local SSE server and falls back when post_message is rejected', async () => {
  const http = await import('node:http');
  const posts = [];
  const event = { eventId: 'stream-1', roomId: 'ops', senderName: 'Priya', senderRole: 'qa-lead', text: 'reproduce coupon', addressed: true };
  const server = http.createServer((request, response) => {
    if (request.url.endsWith('/events')) {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write('data: ' + JSON.stringify({ data: event }) + '\n\n');
      return;
    }
    posts.push(request.url);
    response.writeHead(request.url.includes('post_message') ? 404 : 200, { 'Content-Type': 'application/json' });
    response.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const previous = process.env.SWITCH_SERVER_URL;
  process.env.SWITCH_SERVER_URL = `http://127.0.0.1:${server.address().port}`;
  const connector = new SwitchConnector();
  if (previous === undefined) delete process.env.SWITCH_SERVER_URL; else process.env.SWITCH_SERVER_URL = previous;
  let timer;
  try {
    const received = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('No SSE event received')), 3000);
      connector.onAddressedMessage(resolve);
    });
    await connector.start();
    assert.equal((await received).eventId, 'stream-1');
    clearTimeout(timer);
    await connector.postRoomMessage({ roomId: 'ops', text: 'local test' });
    assert.ok(posts.includes('/rooms/ops/post_message'));
    assert.ok(posts.includes('/agents/deskhand-agent/message'));
  } finally {
    clearTimeout(timer);
    connector.stop();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
