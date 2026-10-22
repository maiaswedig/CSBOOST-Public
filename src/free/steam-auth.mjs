/**
 * Independent CSBOOST identity: Steam OpenID only; no CSCLIENT services/tokens.
 * Call login() only in response to the user's “Entrar com Steam” action.
 * Steam documentation: https://steamcommunity.com/dev
 * Provider discovery: https://steamcommunity.com/openid/
 * OpenID verification: https://openid.net/specs/openid-authentication-2_0.html#verification
 * A cached identity is a convenience for this local application, not a credential
 * to authorize a remote service. Passwords and Steam session cookies never enter
 * this module; the user authenticates in their normal browser on Steam's site.
 */
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const SELECT_ID = `${OPENID_NS}/identifier_select`;
const MAX_MESSAGE_BYTES = 16 * 1024;
const MAX_SESSION_BYTES = 4096;
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const VERIFICATION_TIMEOUT_MS = 10 * 1000;
const NONCE_MAX_AGE_MS = 5 * 60 * 1000;
const FUTURE_SKEW_MS = 60 * 1000;
const REQUIRED_SIGNED = ['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce', 'assoc_handle'];
const STEAM_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/([0-9]{17})$/;

function authError(code, message) {
  return Object.assign(new Error(message), { code });
}

function constantEqual(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function uniqueParams(input) {
  const params = new URLSearchParams(input);
  if (Buffer.byteLength(params.toString()) > MAX_MESSAGE_BYTES) {
    throw authError('STEAM_INVALID_RESPONSE', 'Resposta da Steam excedeu o limite permitido.');
  }
  const keys = new Set();
  for (const [key, value] of params) {
    if (keys.has(key) || /[\r\n\0]/.test(key + value)) {
      throw authError('STEAM_INVALID_RESPONSE', 'Resposta da Steam inválida.');
    }
    keys.add(key);
  }
  return params;
}

function checkState(params, expectedState) {
  if (!constantEqual(params.get('state'), expectedState)) {
    throw authError('STEAM_INVALID_STATE', 'Esta resposta não pertence ao login iniciado.');
  }
}

function nonceTimestamp(nonce, currentTime) {
  if (typeof nonce !== 'string' || nonce.length > 255 ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z[\x21-\x7e]*$/.test(nonce)) {
    throw authError('STEAM_INVALID_NONCE', 'Identificador de login da Steam inválido.');
  }
  const timestamp = Date.parse(nonce.slice(0, 20));
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().replace('.000Z', 'Z') !== nonce.slice(0, 20) ||
      timestamp < currentTime - NONCE_MAX_AGE_MS || timestamp > currentTime + FUTURE_SKEW_MS) {
    throw authError('STEAM_INVALID_NONCE', 'Resposta da Steam expirada ou com horário inválido.');
  }
  return timestamp;
}

function abortable(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

async function readVerificationBody(response, signal) {
  if (Number(response.headers?.get('content-length')) > MAX_MESSAGE_BYTES || !response.body?.getReader) {
    throw authError('STEAM_INVALID_RESPONSE', 'Resposta de verificação da Steam inválida.');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > MAX_MESSAGE_BYTES) throw authError('STEAM_INVALID_RESPONSE', 'Resposta de verificação da Steam muito grande.');
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseVerificationBody(body) {
  const fields = new Map();
  for (const line of body.split('\n')) {
    if (line === '') continue;
    const delimiter = line.indexOf(':');
    if (delimiter < 1 || line.includes('\r')) throw authError('STEAM_INVALID_RESPONSE', 'Verificação da Steam inválida.');
    const key = line.slice(0, delimiter);
    if (fields.has(key)) throw authError('STEAM_INVALID_RESPONSE', 'Verificação da Steam duplicada.');
    fields.set(key, line.slice(delimiter + 1));
  }
  if (fields.get('ns') !== OPENID_NS || fields.get('is_valid') !== 'true') {
    throw authError('STEAM_VERIFICATION_FAILED', 'A Steam não confirmou este login.');
  }
}

/**
 * Exported to test the security boundary with a mocked official verification
 * response. Production uses global fetch; no configurable provider URL exists.
 * usedNonces belongs to one application instance and must be retained between
 * attempts. Steam also consumes each nonce during direct verification.
 */
export async function validateSteamAssertion(input, {
  expectedState,
  expectedReturnTo,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  usedNonces = new Map(),
  signal,
} = {}) {
  const params = uniqueParams(input);
  checkState(params, expectedState);
  const currentTime = now();
  if (!Number.isFinite(currentTime)) throw new TypeError('Invalid clock.');
  if (params.get('openid.ns') !== OPENID_NS || params.get('openid.mode') !== 'id_res' ||
      params.get('openid.op_endpoint') !== STEAM_OPENID_ENDPOINT ||
      params.get('openid.return_to') !== expectedReturnTo) {
    throw authError('STEAM_INVALID_RESPONSE', 'A origem ou o destino da resposta da Steam é inválido.');
  }
  const target = new URL(expectedReturnTo);
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' || target.pathname !== '/steam/callback' ||
      target.username || target.password || target.hash || !constantEqual(target.searchParams.get('state'), expectedState)) {
    throw new TypeError('Invalid expected Steam callback.');
  }
  const claimedId = params.get('openid.claimed_id');
  const match = STEAM_ID.exec(claimedId ?? '');
  if (!match || claimedId !== params.get('openid.identity')) {
    throw authError('STEAM_INVALID_IDENTITY', 'Identidade Steam inválida.');
  }
  const signed = (params.get('openid.signed') ?? '').split(',');
  if (new Set(signed).size !== signed.length || signed.some(field => !/^[a-zA-Z0-9_.-]+$/.test(field) || !params.has(`openid.${field}`)) ||
      REQUIRED_SIGNED.some(field => !signed.includes(field)) || !params.get('openid.assoc_handle') ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(params.get('openid.sig') ?? '')) {
    throw authError('STEAM_UNSIGNED_FIELDS', 'A resposta da Steam não protege todos os dados necessários.');
  }
  const nonce = params.get('openid.response_nonce');
  const timestamp = nonceTimestamp(nonce, currentTime);
  for (const [oldNonce, oldTimestamp] of usedNonces) {
    if (oldTimestamp < currentTime - NONCE_MAX_AGE_MS) usedNonces.delete(oldNonce);
  }
  if (usedNonces.has(nonce)) throw authError('STEAM_REPLAY', 'Esta resposta da Steam já foi utilizada.');
  // Reserve before the await so simultaneous callbacks cannot reuse a nonce.
  usedNonces.set(nonce, timestamp);

  const controller = new AbortController();
  const cancel = () => controller.abort(authError('STEAM_CANCELLED', 'Login cancelado.'));
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => controller.abort(authError('STEAM_VERIFICATION_TIMEOUT', 'A Steam demorou para confirmar o login.')), VERIFICATION_TIMEOUT_MS);
  const body = new URLSearchParams();
  for (const [key, value] of params) if (key.startsWith('openid.')) body.append(key, value);
  body.set('openid.mode', 'check_authentication');
  try {
    const response = await abortable(fetchImpl(STEAM_OPENID_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/plain' },
      body: body.toString(),
      redirect: 'error',
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
    }), controller.signal);
    if (response.status !== 200 || response.redirected || (response.url && response.url !== STEAM_OPENID_ENDPOINT)) {
      throw authError('STEAM_VERIFICATION_FAILED', 'Não foi possível confirmar o login no servidor oficial da Steam.');
    }
    parseVerificationBody(await readVerificationBody(response, controller.signal));
    return Object.freeze({
      provider: 'steam',
      steamId: match[1],
      profileUrl: `https://steamcommunity.com/profiles/${match[1]}`,
      authenticatedAt: new Date(currentTime).toISOString(),
    });
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    if (error.code?.startsWith('STEAM_')) throw error;
    throw authError('STEAM_CONNECTION_FAILED', 'Não foi possível conectar à Steam para confirmar o login.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

function browserResult(response, status, success) {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    Connection: 'close',
  });
  response.end(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>CSBOOST</title><h1>CSBOOST</h1><p>${success ? 'Login com Steam concluído. Você pode fechar esta aba e voltar ao CSBOOST.' : 'Não foi possível concluir este login. Volte ao CSBOOST e tente novamente.'}</p></html>`);
}

async function callbackParams(request, callbackUrl) {
  const query = uniqueParams(callbackUrl.searchParams);
  if (request.method === 'GET') return query;
  if (request.method !== 'POST' || request.headers['content-type']?.split(';')[0].trim() !== 'application/x-www-form-urlencoded' ||
      [...query.keys()].some(key => key !== 'state')) {
    throw authError('STEAM_INVALID_RESPONSE', 'Método de retorno inválido.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_MESSAGE_BYTES) throw authError('STEAM_INVALID_RESPONSE', 'Resposta da Steam muito grande.');
    chunks.push(chunk);
  }
  const body = uniqueParams(Buffer.concat(chunks).toString('utf8'));
  if (body.has('state')) throw authError('STEAM_INVALID_STATE', 'Estado duplicado.');
  body.set('state', query.get('state') ?? '');
  return body;
}

/**
 * @param {{sessionPath: string, openExternal: (url:string)=>Promise<void>|void,
 * fetchImpl?: typeof fetch, now?: ()=>number}} options
 * login(): Promise<SteamIdentity>; getSession(): Promise<SteamIdentity|null>;
 * logout(): Promise<void>; cancel(): boolean; dispose(): void.
 */
export function createSteamAuth({ sessionPath, openExternal, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  if (typeof sessionPath !== 'string' || !path.isAbsolute(sessionPath) || typeof openExternal !== 'function' || typeof fetchImpl !== 'function') {
    throw new TypeError('An absolute sessionPath, openExternal and fetch are required.');
  }
  let pending = null;
  let disposed = false;
  let storageQueue = Promise.resolve();
  const usedNonces = new Map();
  const withStorage = operation => {
    const result = storageQueue.then(operation);
    storageQueue = result.catch(() => {});
    return result;
  };

  async function readSession() {
    try {
      const stat = await fs.lstat(sessionPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_SESSION_BYTES) return null;
      const saved = JSON.parse(await fs.readFile(sessionPath, 'utf8'));
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return null;
      if (saved.version !== 1 || saved.provider !== 'steam' || !/^[0-9]{17}$/.test(saved.steamId) ||
          typeof saved.authenticatedAt !== 'string' || !Number.isFinite(Date.parse(saved.authenticatedAt)) ||
          new Date(saved.authenticatedAt).toISOString() !== saved.authenticatedAt || Date.parse(saved.authenticatedAt) > now() + FUTURE_SKEW_MS) return null;
      return Object.freeze({ provider: 'steam', steamId: saved.steamId, profileUrl: `https://steamcommunity.com/profiles/${saved.steamId}`, authenticatedAt: saved.authenticatedAt });
    } catch (error) {
      if (error.code === 'ENOENT' || error instanceof SyntaxError || error instanceof RangeError) return null;
      throw authError('STEAM_SESSION_READ_FAILED', 'Não foi possível ler o perfil local da Steam.');
    }
  }

  async function saveSession(session, attempt) {
    const directory = path.dirname(sessionPath);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = `${sessionPath}.${randomBytes(12).toString('hex')}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify({ version: 1, ...session }), { mode: 0o600, flag: 'wx' });
      if (pending !== attempt || attempt.settled) return;
      await fs.rename(temporary, sessionPath);
      // Restrictive POSIX permissions; Windows inherits the user's AppData ACL.
      await fs.chmod(sessionPath, 0o600);
    } finally {
      await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
  }

  function settle(attempt, error, session) {
    if (attempt.settled) return;
    attempt.settled = true;
    clearTimeout(attempt.timer);
    attempt.controller.abort();
    attempt.server.close();
    attempt.server.closeIdleConnections?.();
    attempt.server.closeAllConnections?.();
    if (pending === attempt) pending = null;
    if (error) attempt.reject(error);
    else attempt.resolve(session);
  }

  function cancel() {
    if (!pending) return false;
    settle(pending, authError('STEAM_CANCELLED', 'Login cancelado.'));
    return true;
  }

  function login() {
    if (disposed) return Promise.reject(authError('STEAM_DISPOSED', 'Autenticação encerrada.'));
    if (pending) return pending.promise;
    const attempt = { state: randomBytes(32).toString('hex'), controller: new AbortController(), settled: false, processing: false };
    attempt.promise = new Promise((resolve, reject) => { attempt.resolve = resolve; attempt.reject = reject; });
    // A rejecting login promise remains available to its caller without causing an
    // unhandled rejection if cancellation happens during browser startup.
    void attempt.promise.catch(() => {});
    pending = attempt;
    attempt.server = createServer({ maxHeaderSize: MAX_MESSAGE_BYTES, requestTimeout: 10000, headersTimeout: 10000 }, async (request, response) => {
      let matchedState = false;
      try {
        if (request.headers.host !== attempt.host || !request.url?.startsWith('/') || Buffer.byteLength(request.url) > MAX_MESSAGE_BYTES) {
          browserResult(response, 400, false);
          return;
        }
        const callbackUrl = new URL(request.url, `http://${attempt.host}`);
        if (callbackUrl.pathname !== '/steam/callback') {
          browserResult(response, 404, false);
          return;
        }
        const params = await callbackParams(request, callbackUrl);
        checkState(params, attempt.state);
        matchedState = true;
        if (attempt.processing || attempt.settled) {
          browserResult(response, 409, false);
          return;
        }
        attempt.processing = true;
        if (params.get('openid.ns') === OPENID_NS && params.get('openid.mode') === 'cancel') {
          throw authError('STEAM_CANCELLED', 'Login cancelado na Steam.');
        }
        const session = await validateSteamAssertion(params, {
          expectedState: attempt.state, expectedReturnTo: attempt.returnTo, fetchImpl, now, usedNonces, signal: attempt.controller.signal,
        });
        if (attempt.settled || pending !== attempt) return;
        await withStorage(async () => {
          if (attempt.settled || pending !== attempt) return;
          await saveSession(session, attempt);
          if (attempt.settled || pending !== attempt) return;
          browserResult(response, 200, true);
          // Finish after the static browser response has been sent.
          response.once('finish', () => settle(attempt, null, session));
          if (response.writableFinished) settle(attempt, null, session);
        });
      } catch (error) {
        const failure = error.code?.startsWith('STEAM_') ? error : authError('STEAM_LOGIN_FAILED', 'Não foi possível concluir o login com Steam.');
        if (matchedState && !response.destroyed) response.once('finish', () => settle(attempt, failure));
        if (!response.headersSent && !response.destroyed) browserResult(response, 400, false);
        if (matchedState && (response.writableFinished || response.destroyed)) settle(attempt, failure);
      }
    });
    attempt.server.on('error', () => settle(attempt, authError('STEAM_CALLBACK_FAILED', 'Não foi possível iniciar o retorno local da Steam.')));
    attempt.server.on('clientError', (_error, socket) => { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); });
    attempt.server.on('connection', socket => { socket.setTimeout(10000, () => socket.destroy()); });
    attempt.timer = setTimeout(() => settle(attempt, authError('STEAM_LOGIN_TIMEOUT', 'O login com Steam expirou. Tente novamente.')), LOGIN_TIMEOUT_MS);
    attempt.server.listen(0, '127.0.0.1', async () => {
      if (attempt.settled) { attempt.server.close(); return; }
      attempt.host = `127.0.0.1:${attempt.server.address().port}`;
      attempt.returnTo = `http://${attempt.host}/steam/callback?state=${attempt.state}`;
      const loginUrl = new URL(STEAM_OPENID_ENDPOINT);
      loginUrl.search = new URLSearchParams({
        'openid.ns': OPENID_NS,
        'openid.mode': 'checkid_setup',
        'openid.claimed_id': SELECT_ID,
        'openid.identity': SELECT_ID,
        'openid.return_to': attempt.returnTo,
        'openid.realm': `http://${attempt.host}/`,
      }).toString();
      try { await openExternal(loginUrl.href); }
      catch { settle(attempt, authError('STEAM_BROWSER_FAILED', 'Não foi possível abrir o navegador para entrar na Steam.')); }
    });
    return attempt.promise;
  }

  return Object.freeze({
    login,
    getSession: () => withStorage(readSession),
    logout: () => { cancel(); return withStorage(() => fs.unlink(sessionPath).catch(error => { if (error.code !== 'ENOENT') throw authError('STEAM_LOGOUT_FAILED', 'Não foi possível remover o perfil local.'); })); },
    cancel,
    dispose: () => { disposed = true; cancel(); },
  });
}
