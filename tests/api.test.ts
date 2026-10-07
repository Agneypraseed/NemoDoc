import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp, type Config } from '../server/app.ts';

const config: Config = { apiKey: '', baseUrl: 'https://integrate.api.nvidia.com/v1', model: 'nvidia/nemotron-3-nano-30b-a3b' };
const body = { question: 'Explain attention', sources: [{ id: 'pdf', name: 'Paper.pdf', pages: ['Attention is finite.'] }], history: [] };
async function withApp(settings: Config, fn: (url: string) => Promise<void>, fetcher?: typeof fetch) {
  const server = createApp(settings, fetcher).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try { await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
test('status does not expose credentials and missing key gives actionable error', async () => {
  await withApp(config, async url => {
    assert.deepEqual(await (await fetch(url + '/api/status')).json(), { configured: false, model: config.model, local: false });
    const response = await fetch(url + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 503); assert.match((await response.json()).error, /NVIDIA_API_KEY/);
  });
});
test('request validation and remote browser origin checks reject invalid requests', async () => {
  await withApp(config, async url => {
    const invalid = await fetch(url + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(invalid.status, 400);
    const remote = await fetch(url + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' }, body: JSON.stringify(body) });
    assert.equal(remote.status, 403);
  });
});
test('NVIDIA request keeps key server-side, streams content, and omits reasoning', async () => {
  let requested: { url?: string; data?: any; headers?: HeadersInit } = {};
  const fetcher = (async (url, init) => {
    requested = { url: String(url), data: JSON.parse(String(init?.body)), headers: init?.headers };
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"private thought"}}]}\n\ndata: {"choices":[{"delta":{"content":"Attention '));
      controller.enqueue(encoder.encode('is finite. [1]"}}]}\n\ndata: [DONE]\n\n')); controller.close();
    } }), { headers: { 'Content-Type': 'text/event-stream' } });
  }) as typeof fetch;
  await withApp({ ...config, apiKey: 'test-secret' }, async url => {
    const response = await fetch(url + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /event: sources/); assert.match(text, /Attention is finite/); assert.match(text, /event: done/);
    assert.doesNotMatch(text, /private thought|test-secret/);
    assert.equal(requested.url, config.baseUrl + '/chat/completions');
    assert.equal(new Headers(requested.headers).get('authorization'), 'Bearer test-secret');
    assert.equal(requested.data.chat_template_kwargs.enable_thinking, false);
    assert.match(requested.data.messages[0].content, /untrusted data/);
  }, fetcher);
});
test('local NIM can run without a key and empty scans do not trigger inference', async () => {
  await withApp({ ...config, baseUrl: 'http://127.0.0.1:8000/v1' }, async url => {
    assert.equal((await (await fetch(url + '/api/status')).json()).configured, true);
    const response = await fetch(url + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, sources: [{ id: 'scan', name: 'scan.pdf', pages: [''] }] }) });
    assert.equal(response.status, 422);
  });
});
test('provider auth and network failures give useful errors without secrets', async () => {
  for (const [fetcher, expected] of [[async () => new Response('', { status: 401 }), /rejected the API key/], [async () => { throw new Error('private network detail'); }, /Could not reach/]] as const) {
    await withApp({ ...config, apiKey: 'hidden' }, async url => {
      const response = await fetch(url + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(response.status, 502); assert.match((await response.json()).error, expected);
    }, fetcher as typeof fetch);
  }
});
