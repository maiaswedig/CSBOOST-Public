import { readFileSync } from 'node:fs';
import { webcrypto, createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../public/pcboost-download.js', import.meta.url), 'utf8');
const bytes = new TextEncoder().encode('zip de teste');
const hash = createHash('sha256').update(bytes).digest('hex').toUpperCase();
function setup(expected = hash, mode = 'retry') {
  let handler, expire, saved = 0, calls = 0;
  const status = { textContent: '' };
  const button = { innerHTML: 'Baixar', dataset: { parts: '/downloads/test.zip.part01', sha256: expected }, addEventListener: (_, fn) => { handler = fn; } };
  runInNewContext(source, {
    document: { querySelector: id => id === '#pcboost-download' ? button : status, createElement: () => ({ click: () => saved++ }) },
    AbortController, Blob, crypto: webcrypto,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    setTimeout: (fn, ms) => { if (ms === 300000) expire = fn; const timer = setTimeout(fn, ms); timer.unref(); return timer; }, clearTimeout,
    fetch: async (_, { signal }) => {
      calls++;
      if (mode === 'cancel') return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('cancelado')), { once: true }));
      if (mode === 'missing') return new Response('', { status: 404 });
      if (mode === 'retry' && calls === 1) throw new Error('rede interrompida');
      return new Response(bytes);
    }
  });
  return { click: () => handler(), expire: () => expire(), status, button, get saved() { return saved; }, get calls() { return calls; } };
}
const valid = setup(); await valid.click();
assert.equal(valid.saved, 1); assert.equal(valid.calls, 2); assert.equal(valid.button.innerHTML, 'Baixar');
const corrupt = setup('0'.repeat(64), 'normal'); await corrupt.click(); assert.equal(corrupt.saved, 0);
const missing = setup(hash, 'missing'); await missing.click(); assert.equal(missing.saved, 0); assert.equal(missing.calls, 2);
const cancelled = setup(hash, 'cancel'); const pending = cancelled.click(); await cancelled.click(); await pending;
assert.equal(cancelled.saved, 0); assert.match(cancelled.status.textContent, /cancelado/);
const timeout = setup(hash, 'cancel'); const waiting = timeout.click(); timeout.expire(); await waiting;
assert.equal(timeout.saved, 0); assert.match(timeout.status.textContent, /5 minutos/);
console.log('OK: download íntegro, repetição de parte, hash incorreto, parte ausente, cancelamento e prazo');
