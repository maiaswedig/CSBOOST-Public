import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createLocalSteamAuth, readLocalActiveUser} from '../src/free/local-steam-auth.mjs';

const steamId = '76561197960265851'; // base + 123
const users = `"users" { "${steamId}" { "AccountName" "local-test" "PersonaName" "Test" } }`;
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'csboost-local-auth-'));
  t.after(() => fs.rm(directory, {recursive: true, force: true}));
  await fs.mkdir(path.join(directory, 'config'));
  const file = path.join(directory, 'config', 'loginusers.vdf');
  await fs.writeFile(file, users);
  let active = 123, detectCalls = 0, remoteCalls = 0, session = {provider: 'steam', steamId: '76561197960265729'};
  const openid = {getSession: async () => session, login: async () => { remoteCalls++; return session; },
    logout: async () => {session = null;}, cancel: () => false, dispose() {}};
  const auth = createLocalSteamAuth({openid, system: {refreshSteam: async () => {detectCalls++; return {installed: true, steamPath: directory};}}, readActiveUser: async () => active, now: () => 1700000000000});
  return {auth, file, directory, setActive: value => {active = value;}, getDetectCalls: () => detectCalls, getRemoteCalls: () => remoteCalls};
}

test('explicit local selection is offline, distinct from OpenID, and does not create persistent state', async t => {
  const f = await fixture(t);
  assert.equal((await f.auth.getSession()).identitySource, 'openid');
  const session = await f.auth.useLocal();
  assert.equal(session.steamId, steamId);
  assert.equal(session.identitySource, 'steam-local');
  assert.equal(session.remoteAuthenticated, false);
  assert.equal(session.authenticatedAt, undefined);
  assert.equal(session.selectedAt, '2023-11-14T22:13:20.000Z');
  assert.deepEqual(await f.auth.getSession(), session);
  assert.deepEqual(await fs.readdir(f.directory), ['config']);
  assert.equal(f.getDetectCalls(), 1);
  assert.equal(f.getRemoteCalls(), 0);
});

test('active account missing, malformed, or inconsistent cannot select local identity', async t => {
  const f = await fixture(t);
  for (const active of [0, -1, 2 ** 32, '123', 124, NaN]) {
    f.setActive(active);
    assert.equal(await f.auth.getLocalIdentity(), null);
    await assert.rejects(f.auth.useLocal(), /conta ativa/);
  }
});

test('local account switch invalidates selection without falling back to saved OpenID', async t => {
  const f = await fixture(t);
  await f.auth.useLocal();
  f.setActive(124);
  assert.equal(await f.auth.getSession(), null);
  f.setActive(123);
  assert.equal(await f.auth.getSession(), null);
  assert.equal((await f.auth.login()).identitySource, 'openid');
  assert.equal(f.getRemoteCalls(), 1);
});

test('logout, cancel and dispose never auto select local identity', async t => {
  const f = await fixture(t);
  await f.auth.useLocal();
  await f.auth.logout();
  assert.equal(await f.auth.getSession(), null);
  await f.auth.useLocal();
  f.auth.cancel();
  assert.equal((await f.auth.getSession()).identitySource, 'steam-local');
  f.auth.dispose();
  assert.equal(await f.auth.getSession(), null);
  await assert.rejects(f.auth.useLocal(), /encerrada/);
});

test('invalid, duplicate, oversized and truncated KeyValues fail closed', async t => {
  const f = await fixture(t);
  for (const content of ['{}', '"users" {', users + 'garbage', `"users" { "${steamId}" {} "${steamId}" {} }`, `"users" { "${steamId}" { "AccountName" "" } }`, 'x'.repeat(1024 * 1024 + 1)]) {
    await fs.writeFile(f.file, content);
    assert.equal(await f.auth.getLocalIdentity(), null);
  }
});

test('redirected users file cannot select local identity', async t => {
  const f = await fixture(t);
  const real = path.join(f.directory, 'real.vdf');
  await fs.rename(f.file, real);
  try { await fs.symlink(real, f.file); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('Creating file symlinks requires Windows privileges.'); return; } throw error; }
  assert.equal(await f.auth.getLocalIdentity(), null);
});

test('account switching during local verification cannot select either identity', async t => {
  const f = await fixture(t);
  let calls = 0;
  const auth = createLocalSteamAuth({openid: {cancel() {}}, system: {refreshSteam: async () => ({installed: true, steamPath: f.directory})}, readActiveUser: async () => ++calls === 1 ? 123 : 124});
  assert.equal(await auth.getLocalIdentity(), null);
});

test('registry fallback uses a fixed readonly command and bounded unsigned DWORD', async () => {
  const run = async (file, args, options) => {
    assert.equal(path.basename(file), 'reg.exe');
    assert.deepEqual(args, ['query', 'HKCU\\Software\\Valve\\Steam\\ActiveProcess', '/v', 'ActiveUser']);
    assert.equal(options.shell, false);
    assert.equal(options.windowsHide, true);
    return {stdout: '    ActiveUser    REG_DWORD    0x7b\r\n'};
  };
  assert.equal(await readLocalActiveUser({run, platform: 'win32'}), 123);
  assert.equal(await readLocalActiveUser({platform: 'linux', run: () => { throw new Error('Must not execute.'); }}), 0);
  for (const stdout of ['ActiveUser REG_DWORD 0x100000000', 'ActiveUser REG_SZ 123', 'ActiveUser REG_DWORD -1']) {
    assert.equal(await readLocalActiveUser({run: async () => ({stdout}), platform: 'win32'}), 0);
  }
});
