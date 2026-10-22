import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkDocs } from '../tools/check-docs.mjs';

async function fixture(t, changelog = '## 1.30.0\n\nRelease notes.\n') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'csboost-docs-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'docs'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '1.30.0' }));
  for (const file of ['README.md', 'FREE-EDITION.md', 'docs/DISTRIBUICAO.md', 'docs/COMO-USAR.txt']) {
    await fs.writeFile(path.join(root, file), 'Versão atual: 1.30.0\n');
  }
  await fs.writeFile(path.join(root, 'docs/CHANGELOG.md'), changelog);
  return root;
}

test('documentation check accepts a complete current-version changelog block', async t => {
  const root = await fixture(t);
  assert.deepEqual(checkDocs(root), []);
});

test('documentation check rejects a changelog missing the package version', async t => {
  const root = await fixture(t, '## 1.29.0\n\nOlder release.\n');
  assert.ok(checkDocs(root).some(error => /não há bloco para a versão 1\.30\.0/.test(error)));
});

test('documentation check rejects a current changelog block marked in development', async t => {
  const root = await fixture(t, '## 1.30.0\n\nAinda em desenvolvimento.\n');
  assert.ok(checkDocs(root).some(error => /em desenvolvimento/.test(error)));
});
