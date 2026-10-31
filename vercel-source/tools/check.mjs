import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const version = readFileSync(resolve(root, 'downloads/PCBOOST-latest.txt'), 'utf8').trim();
if (!/^\d+\.\d+\.\d+(\.\d+)?$/.test(version) || !html.includes(`V${version}`)) throw new Error('Versão do manifesto diverge da página');
const parts = html.match(/data-parts="([^"]+)"/)?.[1].split(',');
const expected = html.match(/data-sha256="([A-Fa-f0-9]{64})"/)?.[1];
if (!parts?.length || !expected) throw new Error('Metadados do download ausentes');
const hash = createHash('sha256');
for (const part of parts) {
  if (!/^\/downloads\/[\w.\-]+$/.test(part)) throw new Error('Caminho inválido');
  hash.update(readFileSync(resolve(root, '.' + part)));
}
if (hash.digest('hex').toUpperCase() !== expected.toUpperCase()) throw new Error('Partes do ZIP não correspondem ao SHA-256');
if (!html.includes('CSBOOST')) throw new Error('Download CSBOOST ausente');
console.log(`OK: manifesto ${version}, partes e SHA-256 do PCBOOST conferidos`);
