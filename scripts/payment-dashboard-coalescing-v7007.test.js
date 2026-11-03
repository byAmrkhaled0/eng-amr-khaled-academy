'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildPaymentDashboard } = require('../functions/lib/payment-dashboard');
const backend = fs.readFileSync(path.join(__dirname, '../functions/index.js'), 'utf8');
const current = backend.slice(backend.indexOf("const { buildPaymentDashboard } = require('./lib/payment-dashboard');"), backend.indexOf('exports.getPaymentHistory ='));
// Locked Phase 2A implementation for a runnable before/after read comparison.
const before = `
const paymentDashboardCache=new Map();
exports.getPaymentDashboard=onCall(CALLABLE_OPTIONS,async request=>{
  await requireStaff(request);
  const body=request.data||{},filters={month:text(body.month,40)||'all',academicYear:text(body.academicYear,30)||'all',grade:text(body.grade,100)||'all',status:['paid','partial','unpaid'].includes(body.status)?body.status:'all',query:text(body.query,100)};
  if(filters.month!=='all'&&!PAYMENT_MONTH_NAMES.includes(filters.month))throw new HttpsError('invalid-argument','الشهر غير صالح.');
  const cacheKey=JSON.stringify([filters.month,filters.academicYear,cairoDateKey()]);
  let cached=paymentDashboardCache.get(cacheKey);
  if(!cached||Date.now()-cached.at>15000||body.force===true){
    const scope=q=>{if(filters.month!=='all')q=q.where('month','==',filters.month);if(filters.academicYear!=='all')q=q.where('academicYear','==',filters.academicYear);return q;};
    const [students,summaries,today,settings]=await Promise.all([fetchAllCollectionDocuments('students'),fetchAllCollectionDocuments('monthly_payments',scope),fetchAllCollectionDocuments('payment_transactions',q=>scope(q).where('paymentDate','==',cairoDateKey()).where('status','==','active')),db.collection('settings').doc('platform').get()]);
    const rows=result=>result.docs.map(doc=>({id:doc.id,...doc.data()}));
    cached={at:Date.now(),students:rows(students),summaries:rows(summaries),todayTransactions:rows(today),prices:settings.data()?.coursePrices||{}};
    if(paymentDashboardCache.size>=8)paymentDashboardCache.clear();paymentDashboardCache.set(cacheKey,cached);
  }
  const result=buildPaymentDashboard({...cached,filters,canonical:canonicalAcademicLabel});
  const after=text(body.cursor,500),pageSize=40,rows=result.rows.filter(row=>!after||row.key.localeCompare(after,'en')>0).slice(0,pageSize);
  return {...result,rows,nextCursor:rows.length===pageSize?rows.at(-1).key:null,generatedAt:new Date(cached.at).toISOString(),maxStalenessSeconds:15};
});`;
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function fixture({ baseline = false, blocked = false, size = 3 } = {}) {
  const data = {
    students: Array.from({ length: size }, (_, i) => ({ id: `S${String(i).padStart(3, '0')}`, studentCode: `S${String(i).padStart(3, '0')}`, name: ['Alice', 'Bob', 'Cara'][i] || `Synthetic ${i}`, grade: i === 2 ? 'G2' : 'G1', active: true })),
    monthly_payments: [
      { id: 'paid', studentCode: 'S000', course: 'G1', month: months[8], academicYear: '2026/2027', expectedAmount: 100, paidAmount: 100 },
      { id: 'partial', studentCode: 'S001', course: 'G1', month: months[8], academicYear: '2026/2027', expectedAmount: 100, paidAmount: 40 }
    ],
    payment_transactions: [
      { id: 't1', studentCode: 'S000', course: 'G1', month: months[8], academicYear: '2026/2027', paymentDate: '2026-09-25', status: 'active', amount: 100 },
      { id: 't2', studentCode: 'S001', course: 'G1', month: months[8], academicYear: '2026/2027', paymentDate: '2026-09-25', status: 'active', amount: 40 },
      { id: 'cancelled', studentCode: 'S001', course: 'G1', month: months[8], academicYear: '2026/2027', paymentDate: '2026-09-25', status: 'cancelled', amount: 60 }
    ],
    settings: { coursePrices: { G1: 100, G2: 100 } }
  };
  let now = Date.parse('2026-09-25T10:00:00Z'), day = '2026-09-25', authorized = true, authorizeCount = 0, currentLoad;
  const loads = [], queries = []; let reads = 0;
  const error = Object.assign(new Error('synthetic unavailable'), { code: 'unavailable' });
  function startLoad() {
    let release;
    const gate = blocked ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
    const load = { gate, release: release || (() => {}), fail: null };
    loads.push(load); currentLoad = load; return load;
  }
  const query = conditions => ({ where: (field, op, value) => query([...conditions, [field, op, value]]), conditions });
  async function fetch(name, configure = q => q) {
    const load = name === 'students' ? startLoad() : currentLoad;
    const q = configure(query([])); queries.push({ name, conditions: q.conditions });
    const rows = structuredClone(data[name]).filter(row => q.conditions.every(([field, op, value]) => { assert.equal(op, '=='); return row[field] === value; }));
    await load.gate;
    if (load.fail === name || load.fail === 'all') throw error;
    reads += rows.length;
    return { docs: rows.map(row => ({ id: row.id, data: () => row })) };
  }
  const ctx = {
    exports: {}, CALLABLE_OPTIONS: {}, onCall: (_, handler) => handler,
    require: name => { assert.equal(name, './lib/payment-dashboard'); return { buildPaymentDashboard }; },
    buildPaymentDashboard, fetchAllCollectionDocuments: fetch,
    db: { collection: name => ({ doc: id => ({ get: async () => {
      assert.equal(name, 'settings'); assert.equal(id, 'platform');
      const load = currentLoad, settings = structuredClone(data.settings);
      await load.gate; if (load.fail === 'settings' || load.fail === 'all') throw error;
      reads++; return { data: () => settings };
    } }) }) },
    requireStaff: async () => { authorizeCount++; if (!authorized) throw Object.assign(new Error('denied'), { code: 'permission-denied' }); },
    text: (value, max) => String(value || '').slice(0, max), canonicalAcademicLabel: value => value,
    PAYMENT_MONTH_NAMES: months, cairoDateKey: () => day,
    HttpsError: class extends Error { constructor(code, message) { super(message); this.code = code; } },
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  };
  vm.createContext(ctx); vm.runInContext(baseline ? before : current, ctx);
  return {
    data, loads, queries, error, ctx,
    call: body => ctx.exports.getPaymentDashboard({ data: { month: months[8], academicYear: '2026/2027', ...body } }),
    invalidate: () => vm.runInContext('invalidatePaymentDashboardCache()', ctx),
    cached: () => vm.runInContext('paymentDashboardCache.size', ctx),
    pending: () => vm.runInContext('paymentDashboardInFlight.size', ctx),
    advance: ms => { now += ms; }, day: value => { day = value; }, authorize: value => { authorized = value; },
    get reads() { return reads; }, get authorizations() { return authorizeCount; }
  };
}

test('single cold request loads each source once with unchanged totals', async () => {
  const f = fixture(); const result = await f.call();
  assert.equal(f.loads.length, 1); assert.equal(f.reads, 8); assert.equal(f.cached(), 1); assert.equal(f.pending(), 0);
  assert.deepEqual(plain(result.totals), { expected: 300, collected: 140, remaining: 160, paid: 1, partial: 1, unpaid: 1, today: 140 });
  assert.equal(result.maxStalenessSeconds, 15);
});

test('six simultaneous identical cold requests: measured baseline 6 loads/48 reads, optimized 1 load/8 reads', async () => {
  const old = fixture({ baseline: true, blocked: true }), next = fixture({ blocked: true });
  const oldCalls = Array.from({ length: 6 }, () => old.call()), newCalls = Array.from({ length: 6 }, () => next.call());
  await tick(); assert.equal(old.loads.length, 6); assert.equal(next.loads.length, 1);
  old.loads.forEach(load => load.release()); next.loads[0].release();
  const previous = await Promise.all(oldCalls), optimized = await Promise.all(newCalls);
  assert.equal(old.reads, 48); assert.equal(next.reads, 8); assert.deepEqual(plain(optimized), plain(previous));
  assert.equal(next.authorizations, 6);
});

for (const filters of [{ month: months[9] }, { academicYear: '2027/2028' }]) test(`separate source loads for distinct scope ${JSON.stringify(filters)}`, async () => {
  const f = fixture({ blocked: true }); const calls = [f.call(), f.call(filters)]; await tick();
  assert.equal(f.loads.length, 2); f.loads.forEach(load => load.release()); const results = await Promise.all(calls);
  assert.equal(results[1].totals.collected, 0); assert.equal(f.cached(), 2);
});

test('grade, status and search share raw sources but retain independent correct projections', async () => {
  const f = fixture({ blocked: true });
  const filters = [{}, { grade: 'G2' }, { status: 'partial' }, { query: 'alice' }];
  const calls = filters.map(body => f.call(body)); await tick(); assert.equal(f.loads.length, 1); f.loads[0].release();
  const results = await Promise.all(calls);
  assert.deepEqual(results.map(result => result.totalRows), [3, 1, 1, 1]);
  const original = fixture({ baseline: true });
  for (let i = 0; i < filters.length; i++) assert.deepEqual(plain(results[i]), plain(await original.call(filters[i])));
});

test('valid hit including exact 15000ms boundary uses no new source reads; 15001ms reloads', async () => {
  const f = fixture(); const first = await f.call(); f.advance(15000);
  assert.equal((await f.call()).generatedAt, first.generatedAt); assert.equal(f.loads.length, 1);
  f.advance(1); assert.notEqual((await f.call()).generatedAt, first.generatedAt); assert.equal(f.loads.length, 2); assert.equal(f.authorizations, 3);
});

test('force bypasses a fresh resolved cache and returns refreshed prices', async () => {
  const f = fixture(); await f.call(); f.data.settings.coursePrices.G2 = 200;
  const refreshed = await f.call({ force: true }); assert.equal(refreshed.totals.expected, 400); assert.equal(f.loads.length, 2);
  assert.equal((await f.call()).totals.expected, 400);
});

test('concurrent forced refreshes coalesce; an ordinary miss can join the force load', async () => {
  const f = fixture({ blocked: true }); const calls = [f.call({ force: true }), f.call({ force: true }), f.call()]; await tick();
  assert.equal(f.loads.length, 1); f.loads[0].release(); const results = await Promise.all(calls);
  assert.deepEqual(plain(results[0]), plain(results[1])); assert.deepEqual(plain(results[1]), plain(results[2]));
});

test('older ordinary load cannot overwrite newer forced result when it completes last', async () => {
  const f = fixture({ blocked: true }); const older = f.call(); await tick(); f.data.settings.coursePrices.G2 = 200;
  const newer = f.call({ force: true }); await tick(); assert.equal(f.loads.length, 2);
  f.loads[1].release(); assert.equal((await newer).totals.expected, 400);
  f.loads[0].release(); assert.equal((await older).totals.expected, 300);
  assert.equal((await f.call()).totals.expected, 400); assert.equal(f.loads.length, 2);
});

test('older completion does not remove a still-pending newer force entry', async () => {
  const f = fixture({ blocked: true }); const older = f.call(); await tick();
  const newer = f.call({ force: true }); await tick(); f.loads[0].release(); await older;
  assert.equal(f.cached(), 0); assert.equal(f.pending(), 1);
  const joined = f.call({ force: true }); await tick(); assert.equal(f.loads.length, 2);
  f.loads[1].release(); await Promise.all([newer, joined]); assert.equal(f.pending(), 0);
});

for (const failedSource of ['students', 'monthly_payments', 'payment_transactions', 'settings']) test(`shared failure from ${failedSource} is evicted and later request retries`, async () => {
  const f = fixture({ blocked: true }); const calls = [f.call(), f.call(), f.call()];
  const resultsPromise = Promise.allSettled(calls); await tick(); f.loads[0].fail = failedSource; f.loads[0].release();
  const results = await resultsPromise; assert.ok(results.every(result => result.status === 'rejected' && result.reason === f.error));
  assert.equal(f.cached(), 0); assert.equal(f.pending(), 0);
  const retry = f.call(); await tick(); assert.equal(f.loads.length, 2); f.loads[1].release(); assert.equal((await retry).totals.collected, 140);
});

test('failed older load cannot evict a newer forced entry or cause an unhandled rejection', async () => {
  const unhandled = []; const listen = error => unhandled.push(error); process.on('unhandledRejection', listen);
  try {
    const f = fixture({ blocked: true }); const older = f.call(); const settledOld = Promise.allSettled([older]); await tick();
    const forced = f.call({ force: true }); await tick(); f.loads[0].fail = 'students'; f.loads[0].release(); await settledOld;
    assert.equal(f.pending(), 1); const joined = f.call({ force: true }); await tick(); assert.equal(f.loads.length, 2);
    f.loads[1].release(); await Promise.all([forced, joined]); await tick(); assert.deepEqual(unhandled, []);
  } finally { process.removeListener('unhandledRejection', listen); }
});

test('mutation invalidation prevents old data repopulation and does not delete new generation load', async () => {
  const f = fixture({ blocked: true }); const older = f.call(); await tick();
  f.data.monthly_payments[1].paidAmount = 100; f.invalidate(); assert.equal(f.pending(), 0); assert.equal(f.cached(), 0);
  const newer = f.call(); await tick(); f.loads[0].release(); assert.equal((await older).totals.collected, 140);
  assert.equal(f.cached(), 0); assert.equal(f.pending(), 1);
  const joined = f.call(); await tick(); assert.equal(f.loads.length, 2);
  f.loads[1].release(); assert.equal((await newer).totals.collected, 200); await joined;
  assert.equal((await f.call()).totals.collected, 200); assert.equal(f.loads.length, 2);
});

test('two consecutive financial invalidations cannot resurrect either older generation', async () => {
  const f = fixture({ blocked: true }); const a = f.call(); await tick(); f.invalidate();
  const b = f.call(); await tick(); f.invalidate(); const c = f.call(); await tick();
  f.loads[2].release(); await c; f.loads[1].release(); await b; f.loads[0].release(); await a;
  assert.equal(f.cached(), 1); assert.equal(f.pending(), 0); await f.call(); assert.equal(f.loads.length, 3);
});

test('partial and cancelled payments, rounding and totals match original calculation', async () => {
  const f = fixture(), old = fixture({ baseline: true });
  f.data.monthly_payments[1].paidAmount = 40.55; old.data.monthly_payments[1].paidAmount = 40.55;
  const actual = await f.call(), expected = await old.call(); assert.deepEqual(plain(actual), plain(expected));
  assert.equal(actual.totals.collected, 140.55); assert.equal(actual.totals.remaining, 159.45); assert.equal(actual.totals.today, 140);
  assert.equal(actual.rows.find(row => row.student.studentCode === 'S001').status, 'partial');
});

test('40-row cursor response and full totals preserve export iteration without extra source reads', async () => {
  const f = fixture({ size: 45 }); const first = await f.call(); const second = await f.call({ cursor: first.nextCursor });
  assert.equal(first.rows.length, 40); assert.equal(second.rows.length, 5); assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.rows, ...second.rows].map(row => row.key)).size, 45);
  assert.deepEqual(plain(first.totals), plain(second.totals)); assert.equal(first.totals.expected, 4500); assert.equal(f.loads.length, 1);
});

test('authorization runs on every cold, cached, forced and in-flight invocation', async () => {
  const f = fixture({ blocked: true }); const allowed = f.call(); await tick(); f.authorize(false);
  await assert.rejects(f.call(), error => error.code === 'permission-denied');
  await assert.rejects(f.call({ force: true }), error => error.code === 'permission-denied');
  assert.equal(f.loads.length, 1); f.loads[0].release(); await allowed;
  await assert.rejects(f.call(), error => error.code === 'permission-denied'); assert.equal(f.authorizations, 4);
});

test('Cairo day rollover creates another key and source query uses the captured day', async () => {
  const f = fixture({ blocked: true }); const old = f.call(); await tick(); f.day('2026-09-26');
  const next = f.call(); await tick(); f.loads.forEach(load => load.release()); await Promise.all([old, next]);
  const days = f.queries.filter(item => item.name === 'payment_transactions').map(item => item.conditions.find(([field]) => field === 'paymentDate')[2]);
  assert.deepEqual(days, ['2026-09-25', '2026-09-26']); assert.equal(f.cached(), 2);
});

test('cache retains existing clear-at-eight capacity behavior', async () => {
  const f = fixture(); for (const month of months.slice(0, 8)) await f.call({ month }); assert.equal(f.cached(), 8);
  await f.call({ month: months[8] }); assert.equal(f.cached(), 1); assert.equal(f.pending(), 0);
});

test('payment create/edit/cancel hooks invalidate generations after the existing transactions', () => {
  for (const [name, next, condition] of [
    ['createPaymentTransaction', 'editPaymentTransaction', /if \(!result\.duplicate\) invalidatePaymentDashboardCache\(\)/],
    ['editPaymentTransaction', 'cancelPaymentTransaction', /invalidatePaymentDashboardCache\(\)/],
    ['cancelPaymentTransaction', 'function motivationPeriodId', /if \(!result\.alreadyCancelled\) invalidatePaymentDashboardCache\(\)/]
  ]) {
    const code = backend.slice(backend.indexOf(`exports.${name} =`), backend.indexOf(next.startsWith('function ') ? next : `exports.${next} =`));
    assert.match(code, condition); assert.ok(code.lastIndexOf('invalidatePaymentDashboardCache()') > code.indexOf('await db.runTransaction'));
  }
});

// Reuse the established payment lifecycle fixture instead of creating a second
// financial transaction model. Its real callable transactions run in memory.
function paymentLifecycleFixture() {
  const filename = path.join(__dirname, 'payment-lifecycle.test.js');
  let helper = fs.readFileSync(filename, 'utf8').split('\ntest(')[0];
  helper = helper.replace('return {create,summary,', 'return {context,create,summary,');
  helper = helper.replace('this.paymentPeriodId=paymentPeriodId;', 'this.paymentPeriodId=paymentPeriodId;this.dashboardCacheSize=()=>paymentDashboardCache.size;this.dashboardPendingSize=()=>paymentDashboardInFlight.size;');
  const context = { require: require('node:module').createRequire(filename), structuredClone };
  vm.runInNewContext(`${helper}\nthis.makeFixture=paymentFunctions;`, context);
  return context.makeFixture();
}

for (const mutation of ['create', 'edit', 'cancel']) test(`actual ${mutation} payment transaction invalidates an already-running source load`, async () => {
  const flow = paymentLifecycleFixture();
  const existing = mutation === 'create' ? null : await flow.create('initial-fixture', months[8], 40);
  const loads = []; let active;
  flow.context.fetchAllCollectionDocuments = async (name, configure = q => q) => {
    if (name === 'students') {
      let release; const gate = new Promise(resolve => { release = resolve; });
      active = { release, gate }; loads.push(active);
    }
    const load = active, conditions = [];
    const query = { where: (field, operator, value) => { assert.equal(operator, '=='); conditions.push([field, value]); return query; } };
    configure(query);
    const rows = [...flow.documents].filter(([id, row]) => id.startsWith(`${name}/`) && conditions.every(([field, value]) => row[field] === value)).map(([id, row]) => ({ id: id.split('/')[1], row: structuredClone(row) }));
    await load.gate;
    return { docs: rows.map(({ id, row }) => ({ id, data: () => row })) };
  };
  const call = () => flow.functions.getPaymentDashboard({ data: { month: months[8], academicYear: flow.academicYear } });
  const old = call(); await tick();
  if (mutation === 'create') await flow.create('during-fetch', months[8], 40);
  if (mutation === 'edit') await flow.functions.editPaymentTransaction({ data: { transactionId: existing.id, amount: 100 } });
  if (mutation === 'cancel') await flow.functions.cancelPaymentTransaction({ data: { transactionId: existing.id, reason: 'Synthetic cancellation' } });
  assert.equal(flow.context.dashboardCacheSize(), 0); assert.equal(flow.context.dashboardPendingSize(), 0);
  const fresh = call(); await tick(); assert.equal(loads.length, 2);
  loads[0].release(); await old;
  assert.equal(flow.context.dashboardCacheSize(), 0); assert.equal(flow.context.dashboardPendingSize(), 1);
  loads[1].release(); const result = await fresh;
  assert.equal(result.totals.collected, mutation === 'cancel' ? 0 : mutation === 'edit' ? 100 : 40);
  const cached = await call(); assert.deepEqual(plain(cached), plain(result)); assert.equal(loads.length, 2);
});

test('actual requireStaff rejects missing auth, unverified email, absent claim and inactive/non-admin profiles on a warm cache', async () => {
  const f = fixture(); const originalCollection = f.ctx.db.collection;
  let profile = { active: true, role: 'admin' }, profileReads = 0;
  f.ctx.db.collection = name => name !== 'users' ? originalCollection(name) : { doc: () => ({ get: async () => {
    profileReads++; return { exists: profile !== null, data: () => profile };
  } }) };
  vm.runInContext(backend.slice(backend.indexOf('async function requireStaff(request)'), backend.indexOf('// Bootstrap is deliberately claim-only.')), f.ctx);
  const valid = { uid: 'synthetic-admin', token: { email_verified: true, admin: true } };
  const call = auth => f.ctx.exports.getPaymentDashboard({ auth, data: { month: months[8], academicYear: '2026/2027' } });
  await call(valid); await call(valid); assert.equal(profileReads, 2); assert.equal(f.loads.length, 1);
  for (const auth of [undefined, { ...valid, token: { admin: true } }, { ...valid, token: { email_verified: true } }]) {
    await assert.rejects(call(auth), error => ['unauthenticated', 'permission-denied'].includes(error.code));
  }
  for (const next of [null, { active: false, role: 'admin' }, { active: true, role: 'student' }]) {
    profile = next; await assert.rejects(call(valid), error => error.code === 'permission-denied');
  }
  assert.equal(f.loads.length, 1); assert.equal(profileReads, 5);
});
