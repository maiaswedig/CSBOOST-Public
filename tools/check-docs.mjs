import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const versionedFiles = [
  'README.md',
  'FREE-EDITION.md',
  'docs/DISTRIBUICAO.md',
  'docs/COMO-USAR.txt',
];

function collectDocs(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectDocs(fullPath);
    return /\.(?:md|txt)$/i.test(entry.name) ? [fullPath] : [];
  });
}

function addLink(root, errors, source, lineNumber, rawTarget) {
  let target = rawTarget.trim();
  if (target.startsWith('<') && target.includes('>')) {
    target = target.slice(1, target.indexOf('>'));
  } else {
    target = target.split(/\s+/, 1)[0];
  }

  if (!target || target.startsWith('#') || target.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(target)) return;
  target = target.split(/[?#]/, 1)[0];
  if (!target) return;

  try {
    target = decodeURIComponent(target);
  } catch {
    errors.push(`${path.relative(root, source)}:${lineNumber}: URL local inválida: ${rawTarget}`);
    return;
  }

  const resolved = target.startsWith('/')
    ? path.resolve(root, `.${target}`)
    : path.resolve(path.dirname(source), target);
  if (!fs.existsSync(resolved)) {
    errors.push(`${path.relative(root, source)}:${lineNumber}: arquivo vinculado não existe: ${rawTarget}`);
  }
}

export function checkDocs(root = DEFAULT_ROOT) {
  const errors = [];
  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  } catch {
    return ['package.json ausente ou inválido.'];
  }
  const version = packageJson.version;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) {
    return ['package.json: versão sem formato válido.'];
  }

  for (const relativeFile of versionedFiles) {
    const file = path.join(root, relativeFile);
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      errors.push(`${relativeFile}: arquivo de versão ausente.`);
      continue;
    }
    const matches = [...content.matchAll(/^Versão atual:\s*(\d+\.\d+\.\d+(?:-[\w.-]+)?)\s*$/gim)];
    if (matches.length !== 1) {
      errors.push(`${relativeFile}: esperada uma única linha "Versão atual"; encontradas ${matches.length}.`);
    } else if (matches[0][1] !== version) {
      errors.push(`${relativeFile}: versão ${matches[0][1]} diverge de package.json (${version}).`);
    }
  }

  const changelogPath = path.join(root, 'docs', 'CHANGELOG.md');
  let changelog = '';
  try {
    changelog = fs.readFileSync(changelogPath, 'utf8');
  } catch {
    errors.push('docs/CHANGELOG.md: arquivo ausente.');
  }
  if (changelog) {
    const lines = changelog.split(/\r?\n/);
    const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const headingPattern = new RegExp(`^##\\s+${escapedVersion}(?:\\s|$)`);
    const headingIndex = lines.findIndex((line) => headingPattern.test(line));
    if (headingIndex < 0) {
      errors.push(`docs/CHANGELOG.md: não há bloco para a versão ${version}.`);
    } else {
      const nextHeading = lines.findIndex((line, index) => index > headingIndex && /^##\s/.test(line));
      const block = lines.slice(headingIndex + 1, nextHeading < 0 ? lines.length : nextHeading).join('\n');
      if (/\bem desenvolvimento\b/i.test(block)) {
        errors.push(`docs/CHANGELOG.md: o bloco ${version} ainda está marcado "em desenvolvimento".`);
      }
    }
  }

  const docs = new Set([
    ...versionedFiles.map((file) => path.join(root, file)),
    ...collectDocs(path.join(root, 'docs')),
  ]);
  for (const file of docs) {
    let lines;
    try {
      lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    } catch {
      continue;
    }
    lines.forEach((line, index) => {
      const inlineLinks = /!?\[[^\]]*\]\((<[^>]+>|[^)]+)\)/g;
      const definitions = /^\s{0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)/g;
      const htmlLinks = /\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi;
      for (const match of line.matchAll(inlineLinks)) addLink(root, errors, file, index + 1, match[1]);
      for (const match of line.matchAll(definitions)) addLink(root, errors, file, index + 1, match[1]);
      for (const match of line.matchAll(htmlLinks)) addLink(root, errors, file, index + 1, match[2]);
    });
  }

  return errors;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  const errors = checkDocs();
  if (errors.length) {
    console.error(`Checagem de documentação falhou (${errors.length} problema(s)):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    const version = JSON.parse(fs.readFileSync(path.join(DEFAULT_ROOT, 'package.json'), 'utf8')).version;
    console.log(`Documentação válida: versão ${version}, changelog completo e links locais existentes.`);
  }
}
