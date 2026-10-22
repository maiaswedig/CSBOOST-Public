/** Local Steam identity is a convenience for local files, never remote authentication.
 * No password, cookie, login token, or network request is read by this module.
 * OpenID remains separate and its assertion validator is unchanged.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const runFile = promisify(execFile);
const STEAM_BASE = 76561197960265728n;
const LIMIT = 1024 * 1024;
const normalized = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);

export async function readLocalActiveUser({run = runFile, platform = process.platform} = {}) {
  if (platform !== 'win32') return 0;
  try {
    const {stdout} = await run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe'),
      ['query', 'HKCU\\Software\\Valve\\Steam\\ActiveProcess', '/v', 'ActiveUser'],
      {windowsHide: true, timeout: 5000, maxBuffer: 65536, encoding: 'utf8', shell: false});
    const match = stdout.match(/^\s*ActiveUser\s+REG_DWORD\s+(0x[0-9a-f]+|\d+)\s*$/im);
    const value = match ? Number(match[1]) : 0;
    return Number.isInteger(value) && value > 0 && value <= 0xffffffff ? value : 0;
  } catch { return 0; }
}

// A strict KeyValues reader: complete input, balanced objects, unique keys.
function parseUsers(text) {
  const tokens = [];
  let cursor = 0;
  while (cursor < text.length) {
    if (/\s/.test(text[cursor]) || text[cursor] === '\ufeff') { cursor++; continue; }
    if (text.slice(cursor, cursor + 2) === '//') { const end = text.indexOf('\n', cursor); cursor = end < 0 ? text.length : end + 1; continue; }
    if ('{}'.includes(text[cursor])) { tokens.push(text[cursor++]); continue; }
    if (text[cursor++] !== '"') throw new Error('Invalid Steam KeyValues.');
    let value = '', closed = false;
    while (cursor < text.length) {
      const char = text[cursor++];
      if (char === '"') { closed = true; break; }
      if (char === '\\') {
        const escaped = text[cursor++];
        if (escaped !== '\\' && escaped !== '"') throw new Error('Invalid Steam escape.');
        value += escaped;
      } else { if (char === '\0' || char === '\r' || char === '\n') throw new Error('Invalid Steam string.'); value += char; }
    }
    if (!closed) throw new Error('Invalid Steam string.');
    tokens.push({value});
  }
  let index = 0;
  function object(depth, nested) {
    if (depth > 16) throw new Error('Steam KeyValues nesting exceeds limit.');
    const result = new Map();
    while (index < tokens.length && tokens[index] !== '}') {
      const key = tokens[index++];
      if (!key || typeof key !== 'object' || result.has(key.value)) throw new Error('Invalid or duplicate Steam key.');
      const value = tokens[index++];
      if (value === '{') result.set(key.value, object(depth + 1, true));
      else if (value && typeof value === 'object') result.set(key.value, value.value);
      else throw new Error('Invalid Steam value.');
    }
    if (nested && tokens[index++] !== '}') throw new Error('Incomplete Steam object.');
    return result;
  }
  const root = object(0, false);
  if (index !== tokens.length || root.size !== 1 || !(root.get('users') instanceof Map)) throw new Error('Invalid Steam users file.');
  return root.get('users');
}

async function regularDirectory(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new Error('Invalid Steam directory.');
  const absolute = path.resolve(directory), root = path.parse(absolute).root;
  let current = root;
  for (const part of path.relative(root, absolute).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink() || normalized(await fs.realpath(current)) !== normalized(current)) throw new Error('Redirected Steam directory.');
  }
}

async function accountExists(steamPath, steamId) {
  await regularDirectory(steamPath);
  await regularDirectory(path.join(steamPath, 'config'));
  const file = path.join(steamPath, 'config', 'loginusers.vdf');
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > LIMIT || normalized(await fs.realpath(file)) !== normalized(file)) return false;
  const handle = await fs.open(file, 'r');
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size > LIMIT) return false;
    const bytes = Buffer.alloc(LIMIT + 1);
    const {bytesRead} = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > LIMIT) return false;
    const account = parseUsers(bytes.subarray(0, bytesRead).toString('utf8')).get(steamId);
    return account instanceof Map && typeof account.get('AccountName') === 'string' && account.get('AccountName').trim().length > 0;
  } finally { await handle.close(); }
}

export function createLocalSteamAuth({openid, system, readActiveUser = readLocalActiveUser, now = Date.now} = {}) {
  if (!openid || !system?.refreshSteam || typeof readActiveUser !== 'function') throw new TypeError('Steam OpenID, system and ActiveUser reader are required.');
  let selected = null, localMode = false, disposed = false, generation = 0, steamPath = null;
  async function getLocalIdentity() {
    if (disposed) return null;
    try {
      const active = await readActiveUser();
      if (!Number.isInteger(active) || active <= 0 || active > 0xffffffff) return null;
      if (!steamPath) {
        const installation = await system.refreshSteam();
        if (!installation.installed || !installation.steamPath) return null;
        steamPath = installation.steamPath;
      }
      const steamId = String(STEAM_BASE + BigInt(active));
      if (!await accountExists(steamPath, steamId) || await readActiveUser() !== active) return null;
      return Object.freeze({provider: 'steam', identitySource: 'steam-local', steamId,
        profileUrl: `https://steamcommunity.com/profiles/${steamId}`, remoteAuthenticated: false});
    } catch { return null; }
  }
  async function useLocal() {
    if (disposed) throw new Error('Identidade Steam encerrada.');
    const attempt = ++generation;
    openid.cancel();
    const identity = await getLocalIdentity();
    if (attempt !== generation || disposed) throw new Error('Seleção local cancelada.');
    if (!identity) throw new Error('Não foi possível confirmar a conta ativa da Steam neste PC. Abra a Steam e entre na sua conta, ou use o login pelo navegador.');
    selected = Object.freeze({...identity, selectedAt: new Date(now()).toISOString()});
    localMode = true;
    return selected;
  }
  async function getSession() {
    if (disposed) return null;
    const attempt = generation;
    if (!localMode) { const session = await openid.getSession(); return attempt === generation && !disposed && session ? Object.freeze({...session, identitySource: 'openid'}) : null; }
    const current = selected;
    if (!current) return null;
    const identity = await getLocalIdentity();
    if (attempt !== generation || disposed) return null;
    if (!identity || identity.steamId !== current.steamId) { selected = null; return null; }
    return current;
  }
  async function login() {
    if (disposed) throw new Error('Identidade Steam encerrada.');
    const attempt = ++generation;
    selected = null;
    localMode = false;
    const session = await openid.login();
    if (attempt !== generation || disposed) throw new Error('Login cancelado.');
    return Object.freeze({...session, identitySource: 'openid'});
  }
  return Object.freeze({getSession, getLocalIdentity, useLocal, login,
    logout: async () => { generation++; selected = null; localMode = true; await openid.logout(); },
    cancel: () => { generation++; return openid.cancel(); },
    dispose: () => { disposed = true; generation++; selected = null; openid.dispose(); }});
}
