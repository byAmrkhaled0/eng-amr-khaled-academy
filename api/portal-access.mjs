const portalOrigin = 'https://getportalstudent-5mnpfjeuaq-ew.a.run.app';
const maxRequestBytes = 2048;
const scope = 'https://www.googleapis.com/auth/cloud-platform';
let identity;

function error(status, code, message) {
  return Response.json({ error: { status: code, message } }, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });
}

async function readPayload(request) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxRequestBytes) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    const data = JSON.parse(text + decoder.decode())?.data;
    if (!data || !/^[A-Za-z0-9_-]{6,40}$/.test(typeof data.code === 'string' ? data.code : '')) return null;
    if (data.mode !== 'student' && data.mode !== 'parent') return null;
    if (data.portalSessionToken !== undefined && (typeof data.portalSessionToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.portalSessionToken))) return null;
    return {
      code: data.code,
      mode: data.mode,
      includeTransfers: data.includeTransfers === true,
      resumeOnly: data.resumeOnly === true,
      ...(data.portalSessionToken === undefined ? {} : { portalSessionToken: data.portalSessionToken })
    };
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

async function googleJson(url, headers, body) {
  const response = await fetch(url, {
    method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error('Google identity request failed');
  return response.json();
}

async function mintIdentity(oidcToken, provider, account) {
  const exchange = await googleJson('https://sts.googleapis.com/v1/token', { 'Content-Type': 'application/x-www-form-urlencoded' }, new URLSearchParams({
    audience: provider,
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    subject_token: oidcToken,
    scope
  }));
  if (typeof exchange.access_token !== 'string' || !exchange.access_token) throw new Error('Missing exchange token');
  const result = await googleJson(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(account)}:generateIdToken`, {
    'Content-Type': 'application/json', Authorization: `Bearer ${exchange.access_token}`
  }, JSON.stringify({ audience: portalOrigin }));
  if (typeof result.token !== 'string' || !result.token) throw new Error('Missing Cloud Run identity');
  return result.token;
}

async function getIdentity(oidcToken, provider, account) {
  const key = `${provider}/${account}`;
  if (identity?.key === key && identity.expires > Date.now()) return identity.token;
  const current = { key, expires: Date.now() + 40 * 60_000, token: mintIdentity(oidcToken, provider, account) };
  identity = current;
  try { return await current.token; }
  catch (failure) {
    if (identity === current) identity = undefined;
    throw failure;
  }
}

export default {
  async fetch(request) {
    const provider = process.env.TM_PORTAL_WIF_PROVIDER || '';
    const account = process.env.TM_PORTAL_INVOKER || '';
    if (process.env.TM_PORTAL_GATEWAY_ENABLED !== 'true') return error(404, 'NOT_FOUND', 'Portal gateway unavailable.');
    if (request.method !== 'POST') return error(405, 'INVALID_ARGUMENT', 'Use POST.');
    if (request.headers.get('origin') !== new URL(request.url).origin) return error(403, 'PERMISSION_DENIED', 'Invalid request origin.');
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) return error(415, 'INVALID_ARGUMENT', 'JSON required.');
    const payload = await readPayload(request);
    if (!payload) return error(400, 'INVALID_ARGUMENT', 'Invalid portal request.');
    const oidcToken = request.headers.get('x-vercel-oidc-token');
    if (!oidcToken || !/^\/\/iam\.googleapis\.com\/projects\/\d+\/locations\/global\/workloadIdentityPools\/[a-z0-9-]+\/providers\/[a-z0-9-]+$/.test(provider) ||
        !/^[a-z0-9-]+@eng-amr-khaled-academy\.iam\.gserviceaccount\.com$/.test(account)) {
      return error(503, 'UNAVAILABLE', 'Portal gateway is not configured.');
    }
    try {
      const idToken = await getIdentity(oidcToken, provider, account);
      const upstream = await fetch(portalOrigin, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Serverless-Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({ data: payload }),
        redirect: 'error',
        signal: AbortSignal.timeout(6500)
      });
      if (!/^application\/json(?:\s*;|$)/i.test(upstream.headers.get('content-type') || '')) {
        return error(502, 'UNAVAILABLE', 'Portal service unavailable.');
      }
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    } catch {
      return error(502, 'UNAVAILABLE', 'Portal service unavailable.');
    }
  }
};
