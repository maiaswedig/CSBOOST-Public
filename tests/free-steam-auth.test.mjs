import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSteamAuth, validateSteamAssertion, STEAM_OPENID_ENDPOINT } from '../src/free/steam-auth.mjs';

const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const NOW = Date.parse('2026-10-14T00:30:00Z');
const STATE = 'a'.repeat(64);
const RETURN_TO = `http://127.0.0.1:38475/steam/callback?state=${STATE}`;
const STEAM_ID = '76561198000000000';
const validVerification = () => new Response(`ns:${OPENID_NS}\nis_valid:true\n`, { status: 200 });

function assertion({ state = STATE, returnTo = RETURN_TO, nonce = '2026-10-14T00:30:00Zunique', ...overrides } = {}) {
  return new URLSearchParams({
    state,
    'openid.ns': OPENID_NS,
    'openid.mode': 'id_res',
    'openid.op_endpoint': STEAM_OPENID_ENDPOINT,
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    'openid.return_to': returnTo,
    'openid.response_nonce': nonce,
    'openid.assoc_handle': 'opaque-steam-association',
    'openid.signed': 'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'c2lnbmVkLWJ5LXN0ZWFt',
    ...overrides,
  });
}

const options = overrides => ({ expectedState: STATE, expectedReturnTo: RETURN_TO, now: () => NOW, fetchImpl: async () => validVerification(), ...overrides });

test('verified Steam identity uses the fixed official endpoint and protects direct verification', async () => {
  let calls = 0;
  const session = await validateSteamAssertion(assertion(), options({ fetchImpl: async (url, request) => {
    calls++;
    assert.equal(url, STEAM_OPENID_ENDPOINT);
    assert.equal(request.method, 'POST');
    assert.equal(request.redirect, 'error');
    assert.equal(request.credentials, 'omit');
    assert.equal(request.cache, 'no-store');
    assert.ok(request.signal instanceof AbortSignal);
    const sent = new URLSearchParams(request.body);
    assert.equal(sent.get('openid.mode'), 'check_authentication');
    assert.equal(sent.get('openid.return_to'), RETURN_TO);
    assert.equal(sent.has('state'), false);
    assert.equal(sent.get('openid.sig'), assertion().get('openid.sig'));
    return validVerification();
  } }));
  assert.equal(calls, 1);
  assert.deepEqual(session, { provider: 'steam', steamId: STEAM_ID, profileUrl: `https://steamcommunity.com/profiles/${STEAM_ID}`, authenticatedAt: new Date(NOW).toISOString() });
  assert.equal(Object.isFrozen(session), true);
});

test('rejects changed state, return URL, namespace, mode and provider before networking', async t => {
  const attacks = [
    ['state', { state: 'b'.repeat(64) }, 'STEAM_INVALID_STATE'],
    ['return URL', { 'openid.return_to': `${RETURN_TO}&evil=1` }, 'STEAM_INVALID_RESPONSE'],
    ['namespace', { 'openid.ns': 'http://openid.net/signon/1.1' }, 'STEAM_INVALID_RESPONSE'],
    ['mode', { 'openid.mode': 'check_authentication' }, 'STEAM_INVALID_RESPONSE'],
    ['provider domain', { 'openid.op_endpoint': 'https://steamcommunity.com.evil.invalid/openid/login' }, 'STEAM_INVALID_RESPONSE'],
    ['provider protocol', { 'openid.op_endpoint': 'http://steamcommunity.com/openid/login' }, 'STEAM_INVALID_RESPONSE'],
  ];
  for (const [name, changed, code] of attacks) await t.test(name, async () => {
    await assert.rejects(validateSteamAssertion(assertion(changed), options({ fetchImpl: () => { throw new Error('must not call fetch'); } })), { code });
  });
});

test('rejects duplicate keys and newline injection', async () => {
  const duplicated = assertion();
  duplicated.append('openid.claimed_id', 'https://steamcommunity.com/openid/id/76561198000000001');
  await assert.rejects(validateSteamAssertion(duplicated, options()), { code: 'STEAM_INVALID_RESPONSE' });
  await assert.rejects(validateSteamAssertion(assertion({ 'openid.assoc_handle': 'x\nis_valid:true' }), options()), { code: 'STEAM_INVALID_RESPONSE' });
});

test('rejects identity disagreement, ID truncation, lookalike host, delegated and insecure IDs', async t => {
  const identities = [
    `https://steamcommunity.com/openid/id/${STEAM_ID.slice(1)}`,
    `https://steamcommunity.com.evil.invalid/openid/id/${STEAM_ID}`,
    `https://steamcommunity.com/openid/id/${STEAM_ID}?admin=1`,
    `http://steamcommunity.com/openid/id/${STEAM_ID}`,
    `https://steamcommunity.com/openid/id/${STEAM_ID}/`,
  ];
  for (const identity of identities) await t.test(identity, async () => {
    await assert.rejects(validateSteamAssertion(assertion({ 'openid.claimed_id': identity, 'openid.identity': identity }), options()), { code: 'STEAM_INVALID_IDENTITY' });
  });
  await assert.rejects(validateSteamAssertion(assertion({ 'openid.identity': 'https://steamcommunity.com/openid/id/76561198000000001' }), options()), { code: 'STEAM_INVALID_IDENTITY' });
});

test('all identity, provider, return URL, nonce and association fields must be signed', async t => {
  for (const field of ['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce', 'assoc_handle']) await t.test(field, async () => {
    const signed = assertion().get('openid.signed').split(',').filter(item => item !== field).join(',');
    await assert.rejects(validateSteamAssertion(assertion({ 'openid.signed': signed }), options()), { code: 'STEAM_UNSIGNED_FIELDS' });
  });
  await assert.rejects(validateSteamAssertion(assertion({ 'openid.signed': `${assertion().get('openid.signed')},identity` }), options()), { code: 'STEAM_UNSIGNED_FIELDS' });
});

test('rejects stale, future, invalid dates and non-ASCII nonces', async t => {
  for (const nonce of ['2026-10-14T00:24:59Zstale', '2026-10-14T00:31:01Zfuture', '2026-02-30T00:30:00Zinvalid', '2026-10-14T00:30:00Z espaço', 'not-a-timestamp', '2026-10-14T00:30:00Z' + 'x'.repeat(256)]) {
    await t.test(nonce.slice(0, 40), async () => assert.rejects(validateSteamAssertion(assertion({ nonce }), options()), { code: 'STEAM_INVALID_NONCE' }));
  }
});

test('reserves the nonce before verification to reject concurrent replays', async () => {
  const usedNonces = new Map();
  let allowVerification;
  const verification = new Promise(resolve => { allowVerification = resolve; });
  const first = validateSteamAssertion(assertion(), options({ usedNonces, fetchImpl: () => verification }));
  await assert.rejects(validateSteamAssertion(assertion(), options({ usedNonces })), { code: 'STEAM_REPLAY' });
  allowVerification(validVerification());
  await first;
  await assert.rejects(validateSteamAssertion(assertion(), options({ usedNonces })), { code: 'STEAM_REPLAY' });
});

test('direct verification must return an unambiguous successful official response', async t => {
  const badResponses = [
    () => new Response(`ns:${OPENID_NS}\nis_valid:false\n`),
    () => new Response('is_valid:true\n'),
    () => new Response(`ns:${OPENID_NS}\nis_valid:true\nis_valid:false\n`),
    () => new Response(`ns:${OPENID_NS}\nis_valid: true\n`),
    () => new Response(`ns:${OPENID_NS}\nis_valid:true\n`, { status: 403 }),
    () => Object.defineProperty(validVerification(), 'redirected', { value: true }),
    () => Object.defineProperty(validVerification(), 'url', { value: 'https://evil.invalid/' }),
  ];
  for (let index = 0; index < badResponses.length; index++) await t.test(String(index), async () => {
    await assert.rejects(validateSteamAssertion(assertion(), options({ fetchImpl: async () => badResponses[index]() })), error => error.code.startsWith('STEAM_'));
  });
});

test('bounds callback data and the verification response', async () => {
  await assert.rejects(validateSteamAssertion(assertion({ 'openid.extra': 'x'.repeat(20 * 1024) }), options()), { code: 'STEAM_INVALID_RESPONSE' });
  await assert.rejects(validateSteamAssertion(assertion(), options({ fetchImpl: async () => new Response('x'.repeat(20 * 1024)) })), { code: 'STEAM_INVALID_RESPONSE' });
  await assert.rejects(validateSteamAssertion(assertion(), options({ fetchImpl: async () => new Response('', { headers: { 'content-length': '20000' } }) })), { code: 'STEAM_INVALID_RESPONSE' });
});

test('cancellation aborts even when an injected transport does not settle', async () => {
  const controller = new AbortController();
  let transportSignal;
  const verification = validateSteamAssertion(assertion(), options({ signal: controller.signal, fetchImpl: (_url, request) => { transportSignal = request.signal; return new Promise(() => {}); } }));
  controller.abort();
  await assert.rejects(verification, { code: 'STEAM_CANCELLED' });
  assert.equal(transportSignal.aborted, true);
});

test('a stalled verification is aborted after ten seconds', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let transportSignal;
  const verification = validateSteamAssertion(assertion(), options({ fetchImpl: (_url, request) => {
    transportSignal = request.signal;
    return new Promise(() => {});
  } }));
  t.mock.timers.tick(10001);
  await assert.rejects(verification, { code: 'STEAM_VERIFICATION_TIMEOUT' });
  assert.equal(transportSignal.aborted, true);
});

async function localAuth(t, overrides = {}) {
  const directory = await fs.mkdtemp(path.join(tmpdir(), 'csboost-steam-test-'));
  const sessionPath = path.join(directory, 'identity', 'steam.json');
  let browserOpened;
  const opened = new Promise(resolve => { browserOpened = resolve; });
  const auth = createSteamAuth({ sessionPath, openExternal: url => browserOpened(new URL(url)), fetchImpl: async () => validVerification(), now: () => NOW, ...overrides });
  t.after(async () => { auth.dispose(); await fs.rm(directory, { recursive: true, force: true }); });
  return { auth, opened, sessionPath };
}

function callbackFromLoginUrl(loginUrl, overrides = {}) {
  const returnTo = loginUrl.searchParams.get('openid.return_to');
  const callback = new URL(returnTo);
  callback.search = assertion({ state: callback.searchParams.get('state'), returnTo, ...overrides }).toString();
  return callback;
}

test('local browser callback persists only the verified identity, restores it and logs out', async t => {
  const { auth, opened, sessionPath } = await localAuth(t);
  assert.equal(await auth.getSession(), null);
  const login = auth.login();
  assert.equal(auth.login(), login, 'a double click does not open another login flow');
  const loginUrl = await opened;
  assert.equal(loginUrl.origin + loginUrl.pathname, STEAM_OPENID_ENDPOINT);
  assert.equal(loginUrl.searchParams.get('openid.mode'), 'checkid_setup');
  assert.equal(loginUrl.searchParams.get('openid.realm'), new URL(loginUrl.searchParams.get('openid.return_to')).origin + '/');
  const result = await fetch(callbackFromLoginUrl(loginUrl));
  assert.equal(result.status, 200);
  assert.match(await result.text(), /Login com Steam concluído/);
  const session = await login;
  assert.deepEqual(await auth.getSession(), session);
  const saved = JSON.parse(await fs.readFile(sessionPath, 'utf8'));
  assert.deepEqual(Object.keys(saved).sort(), ['version', 'provider', 'steamId', 'profileUrl', 'authenticatedAt'].sort());
  assert.equal(JSON.stringify(saved).includes('openid'), false);
  if (process.platform !== 'win32') assert.equal((await fs.stat(sessionPath)).mode & 0o777, 0o600);
  assert.deepEqual(await fs.readdir(path.dirname(sessionPath)), ['steam.json']);
  await auth.logout();
  assert.equal(await auth.getSession(), null);
  auth.dispose();
  await assert.rejects(auth.login(), { code: 'STEAM_DISPOSED' });
});

test('wrong callback state cannot interrupt the genuine browser flow', async t => {
  const { auth, opened } = await localAuth(t);
  const login = auth.login();
  const loginUrl = await opened;
  const invalid = callbackFromLoginUrl(loginUrl, { state: 'b'.repeat(64) });
  assert.equal((await fetch(invalid)).status, 400);
  assert.equal(await auth.getSession(), null);
  assert.equal((await fetch(callbackFromLoginUrl(loginUrl))).status, 200);
  assert.equal((await login).steamId, STEAM_ID);
});

test('supports form-post OpenID messages with state only in the callback URL', async t => {
  const { auth, opened } = await localAuth(t);
  const login = auth.login();
  const loginUrl = await opened;
  const callback = callbackFromLoginUrl(loginUrl);
  const body = new URLSearchParams(callback.searchParams);
  body.delete('state');
  const response = await fetch(loginUrl.searchParams.get('openid.return_to'), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
  assert.equal(response.status, 200);
  await response.text();
  assert.equal((await login).steamId, STEAM_ID);
});

test('browser launch failure and cancel produce no local identity', async t => {
  const failed = await localAuth(t, { openExternal: async () => { throw new Error('browser secret detail'); } });
  await assert.rejects(failed.auth.login(), error => error.code === 'STEAM_BROWSER_FAILED' && !error.message.includes('secret'));
  assert.equal(await failed.auth.getSession(), null);
  const cancelled = await localAuth(t);
  const login = cancelled.auth.login();
  await cancelled.opened;
  assert.equal(cancelled.auth.cancel(), true);
  await assert.rejects(login, { code: 'STEAM_CANCELLED' });
  assert.equal(cancelled.auth.cancel(), false);
  assert.equal(await cancelled.auth.getSession(), null);
});

test('failed provider verification cannot persist a session and shows a generic browser result', async t => {
  const { auth, opened, sessionPath } = await localAuth(t, { fetchImpl: async () => new Response(`ns:${OPENID_NS}\nis_valid:false\n`) });
  const login = auth.login();
  const loginUrl = await opened;
  const result = await fetch(callbackFromLoginUrl(loginUrl));
  assert.equal(result.status, 400);
  assert.match(await result.text(), /Não foi possível concluir este login/);
  await assert.rejects(login, { code: 'STEAM_VERIFICATION_FAILED' });
  assert.equal(await auth.getSession(), null);
  await assert.rejects(fs.stat(sessionPath), { code: 'ENOENT' });
});

test('Steam cancellation returns to the application without establishing a session', async t => {
  const { auth, opened } = await localAuth(t);
  const login = auth.login();
  const loginUrl = await opened;
  const callback = new URL(loginUrl.searchParams.get('openid.return_to'));
  callback.searchParams.set('openid.ns', OPENID_NS);
  callback.searchParams.set('openid.mode', 'cancel');
  const result = await fetch(callback);
  assert.equal(result.status, 400);
  await result.text();
  await assert.rejects(login, { code: 'STEAM_CANCELLED' });
  assert.equal(await auth.getSession(), null);
});

test('logout during verification aborts login and never creates an identity file', async t => {
  let verificationStarted;
  const started = new Promise(resolve => { verificationStarted = resolve; });
  const { auth, opened, sessionPath } = await localAuth(t, { fetchImpl: () => { verificationStarted(); return new Promise(() => {}); } });
  const login = auth.login();
  const loginUrl = await opened;
  const callbackRequest = fetch(callbackFromLoginUrl(loginUrl)).catch(() => {});
  await started;
  await auth.logout();
  await assert.rejects(login, { code: 'STEAM_CANCELLED' });
  await callbackRequest;
  assert.equal(await auth.getSession(), null);
  await assert.rejects(fs.stat(sessionPath), { code: 'ENOENT' });
});

test('malformed and incompatible local profile files cannot create a session', async t => {
  const { auth, sessionPath } = await localAuth(t);
  await fs.mkdir(path.dirname(sessionPath), { recursive: true });
  for (const content of ['{', '{}', 'null', '[]', 'true', '123', JSON.stringify({ version: 1, provider: 'other', steamId: STEAM_ID, authenticatedAt: new Date(NOW).toISOString() }), JSON.stringify({ version: 1, provider: 'steam', steamId: STEAM_ID, authenticatedAt: '2026-99-99' }), 'x'.repeat(5000)]) {
    await fs.writeFile(sessionPath, content);
    assert.equal(await auth.getSession(), null);
  }
});
