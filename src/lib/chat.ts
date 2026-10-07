import type { Citation } from '../types';

export async function streamChat(body: unknown, signal: AbortSignal, onDelta: (text: string) => void, onSources: (citations: Citation[]) => void) {
  const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'The AI connection is unavailable. Please try again.'); }
  if (!response.body) throw new Error('This browser does not support streamed answers.');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '';
  const consume = (block: string) => {
    const event = block.split('\n').find(l => l.startsWith('event:'))?.slice(6).trim();
    const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
    if (!data) return;
    const payload = JSON.parse(data);
    if (event === 'delta') onDelta(payload);
    if (event === 'sources') onSources(payload);
    if (event === 'error') throw new Error(payload);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const blocks = buffer.split('\n\n'); buffer = blocks.pop() ?? '';
      blocks.forEach(consume);
      if (done) { if (buffer.trim()) consume(buffer); break; }
    }
  } finally { await reader.cancel().catch(() => {}); }
}
