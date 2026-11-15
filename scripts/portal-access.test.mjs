import assert from 'node:assert/strict';
import test from 'node:test';
import gateway from '../api/portal-access.mjs';

const origin = 'https://preview.example.test';
const validPayload = JSON.stringify({ data: { code: 'DEMO1234', mode: 'student' } });
function request(body = validPayload, options = {}) {
  return new Request(`${origin}/api/portal-access`, {
    method: 'POST', body,
    headers: { origin, 'content-type': 'application/json', 'x-vercel-oidc-token': 'test-vercel-identity' },
    ...options
  });
}

test('preview portal gateway limits requests and sends authenticated, non-cacheable responses', async t => {
  const prior = { ...process.env };
  t.after(() => {
    for (const key of ['TM_PORTAL_GATEWAY_ENABLED', 'TM_PORTAL_WIF_PROVIDER', 'TM_PORTAL_INVOKER']) {
      if (prior[key] === undefined) delete process.env[key];
      else process.env[key] = prior[key];
    }
  });
  delete process.env.TM_PORTAL_GATEWAY_ENABLED;
  assert.equal((await gateway.fetch(request())).status, 404);
  process.env.TM_PORTAL_GATEWAY_ENABLED = 'true';
  process.env.TM_PORTAL_WIF_PROVIDER = '//iam.googleapis.com/projects/123/locations/global/workloadIdentityPools/test-pool/providers/test-provider';
  process.env.TM_PORTAL_INVOKER = 'test-invoker@eng-amr-khaled-academy.iam.gserviceaccount.com';

  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, ...options });
    if (url.startsWith('https://sts.googleapis.com/')) return Response.json({ access_token: 'test-access' });
    if (url.startsWith('https://iamcredentials.googleapis.com/')) return Response.json({ token: 'test-run-identity' });
    return Response.json({ error: { status: 'UNAUTHENTICATED' } }, { status: 401 });
  });
  const hostile = request(validPayload, { headers: { origin: 'https://foreign.example.test' } });
  assert.equal((await gateway.fetch(hostile)).status, 403);
  assert.equal((await gateway.fetch(request('x'.repeat(2049)))).status, 400);
  assert.equal((await gateway.fetch(request(validPayload, { headers: { origin, 'content-type': 'application/json' } }))).status, 503);
  assert.equal(calls.length, 0);

  const response = await gateway.fetch(request(JSON.stringify({ data: { code: 'DEMO1234', mode: 'parent', ignored: true } })));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { error: { status: 'UNAUTHENTICATED' } });
  assert.equal(calls[0].body.get('subject_token'), 'test-vercel-identity');
  assert.equal(calls[2].headers['X-Serverless-Authorization'], 'Bearer test-run-identity');
  assert.deepEqual(JSON.parse(calls[2].body).data, {
    code: 'DEMO1234', mode: 'parent', includeTransfers: false, resumeOnly: false
  });
  await gateway.fetch(request());
  assert.equal(calls.length, 4, 'the second request reuses the Google identity');
});
