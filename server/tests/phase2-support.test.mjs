// Phase 2 support features: tickets, agronomy experts/bookings and soil
// reports. Who can see and change what is decided by the signed-in account,
// never by ids or roles sent in the request body.
// Run from server/: npm test

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, {
  NODE_ENV: 'test',
  MONGODB_URI: '',
  OTP_HASH_SECRET: 'test-secret',
  AUTH_TOKEN_SECRET: 'test-secret',
  ORDER_WHATSAPP_MESSAGES: 'off',
});

const { db } = await import('../db.js');
const { default: app } = await import('../server.js');
const { signToken } = await import('../security.js');

console.log = () => {};
console.warn = () => {};
console.error = () => {};

const people = [
  { id: 'U-ADMIN', name: 'Asha', role: 'admin', status: 'active', password: 'h' },
  { id: 'U-NOTIX', name: 'Nila', role: 'admin', status: 'active', password: 'h', permissions: ['orders'] },
  { id: 'U-SUPER', name: 'Owner', role: 'superadmin', status: 'active', password: 'h' },
  { id: 'U-SADMIN', name: 'Meena', role: 'admin', status: 'active', password: 'h', storeId: 'STR-A' },
  { id: 'U-EMP', name: 'Karthik', role: 'employee', status: 'active', password: 'h', storeId: 'STR-A' },
  { id: 'U-EMP2', name: 'Priya', role: 'employee', status: 'active', password: 'h' },
  { id: 'U-VAN', name: 'Ravi', role: 'delivery', status: 'active', password: 'h' },
  { id: 'U-F1', name: 'Farmer One', role: 'farmer', status: 'active', password: 'h', phone: '9000000001' },
  { id: 'U-F2', name: 'Farmer Two', role: 'farmer', status: 'active', password: 'h', phone: '9000000002' },
];
const byId = new Map(people.map((u) => [u.id, u]));
const token = (id) => signToken(id, 'h');

const tickets = new Map();
const bookings = new Map();
const soil = new Map();
const staffProfiles = [
  { ...byId.get('U-EMP'), isAgronomyExpert: true, aadharNumber: '1234 5678 9012', bankAccountNumber: '000111222',
    profile: { profilePhoto: '/p.jpg', specialization: 'Paddy', panNumber: 'ABCDE1234F' } },
  { ...byId.get('U-EMP2'), profile: null },
];
const clone = (x) => (x ? JSON.parse(JSON.stringify(x)) : null);

Object.assign(db, {
  kvGet: async () => null,
  kvSet: async (k, v) => v,
  kvGetMany: async () => new Map(),
  kvClaimSlot: async () => 0,
  kvIncrement: async () => 1,
  getUserById: async (id) => byId.get(id) ?? null,
  getStoreById: async (id) => (id === 'STR-A' ? { id: 'STR-A', name: 'Coimbatore Branch', location: 'Coimbatore', status: 'active' } : null),
  getTickets: async () => [...tickets.values()].map(clone),
  getTicketById: async (id) => clone(tickets.get(id)),
  addTicket: async (t) => { tickets.set(t.id, clone(t)); return clone(t); },
  updateTicket: async (id, u) => { const t = tickets.get(id); if (!t) return null; Object.assign(t, u); return clone(t); },
  addTicketReply: async (id, r) => { const t = tickets.get(id); if (!t) return null; t.replies.push(r); return clone(t); },
  getAgronomyExperts: async () => staffProfiles.filter((s) => s.isAgronomyExpert).map(clone),
  setEmployeeAgronomyExpert: async () => true,
  addAgronomyBooking: async (b) => { bookings.set(b.id, clone(b)); return clone(b); },
  getAgronomyBookings: async (f = {}) => [...bookings.values()]
    .filter((b) => (!f.userId || b.userId === f.userId) && (!f.expertId || b.expertId === f.expertId)).map(clone),
  getAgronomyBookingById: async (id) => clone(bookings.get(id)),
  updateAgronomyBooking: async (id, u) => { const b = bookings.get(id); Object.assign(b, u); return clone(b); },
  addSoilReport: async (r) => { soil.set(r.id, clone(r)); return clone(r); },
  getSoilReports: async () => [...soil.values()].map(clone),
  getSoilReportById: async (id) => clone(soil.get(id)),
  updateSoilReport: async (id, u) => { const r = soil.get(id); Object.assign(r, u); return clone(r); },
});

let server;
let base;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.closeAllConnections(); server.close(); });

async function call(id, method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (id) headers.Authorization = `Bearer ${token(id)}`;
  const res = await fetch(`${base}${path}`, { method, headers, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test('tickets: signed-out visitors cannot list them', async () => {
  assert.equal((await call(null, 'GET', '/api/tickets')).status, 401);
});

test('tickets: identity comes from the account, not the body', async () => {
  const r = await call('U-F1', 'POST', '/api/tickets', {
    id: 'TCK-HIJACK', userId: 'U-F2', subject: 'Leaves yellowing', description: 'Help', phone: '9000000001',
  });
  assert.equal(r.status, 200);
  assert.notEqual(r.body.data.id, 'TCK-HIJACK');
  assert.equal(r.body.data.userId, 'U-F1');
  assert.equal(r.body.data.replies[0].senderRole, 'farmer');
});

test('tickets: a farmer sees only their own; admins see all', async () => {
  await call('U-F2', 'POST', '/api/tickets', { subject: 'Late delivery', description: 'Order late' });
  const f1 = await call('U-F1', 'GET', '/api/tickets');
  assert.ok(f1.body.data.length >= 1);
  assert.ok(f1.body.data.every((t) => t.userId === 'U-F1'));
  const admin = await call('U-ADMIN', 'GET', '/api/tickets');
  assert.ok(admin.body.data.some((t) => t.userId === 'U-F2'));
});

test('tickets: a farmer cannot read or reply to another farmer\'s ticket', async () => {
  const other = [...tickets.values()].find((t) => t.userId === 'U-F2');
  assert.equal((await call('U-F1', 'POST', `/api/tickets/${other.id}/replies`, { text: 'hi', senderRole: 'admin' })).status, 404);
  assert.equal((await call(null, 'POST', `/api/tickets/${other.id}/replies`, { text: 'hi' })).status, 401);
});

test('tickets: a reply\'s sender is the signed-in account', async () => {
  const own = [...tickets.values()].find((t) => t.userId === 'U-F1');
  const r = await call('U-F1', 'POST', `/api/tickets/${own.id}/replies`, { text: 'more info', senderName: 'Admin', senderRole: 'admin' });
  assert.equal(r.status, 200);
  const last = r.body.data.replies.at(-1);
  assert.equal(last.senderRole, 'farmer');
  assert.equal(last.senderName, 'Farmer One');
});

test('tickets: Super Admin assigns to the store admin, who hands it to their own staff; farmers cannot change status', async () => {
  const t = [...tickets.values()].find((x) => x.userId === 'U-F2');
  const assign = (who, body) => call(who, 'PUT', `/api/tickets/${t.id}/assign`, body);
  assert.equal((await assign('U-EMP', { assignedToId: 'U-EMP' })).status, 403);
  // Only the Super Admin sends a ticket to a store; a head-office admin cannot.
  assert.equal((await assign('U-ADMIN', { assignedToId: 'U-SADMIN', storeId: 'STR-A' })).status, 403);
  assert.equal((await assign('U-SUPER', { assignedToId: 'U-SADMIN' })).status, 400);              // no store chosen
  assert.equal((await assign('U-SUPER', { assignedToId: 'U-EMP', storeId: 'STR-A' })).status, 400); // not an admin
  assert.equal((await assign('U-SUPER', { assignedToId: 'U-ADMIN', storeId: 'STR-A' })).status, 400); // not this store's admin
  const toStore = await assign('U-SUPER', { assignedToId: 'U-SADMIN', storeId: 'STR-A', assignedToName: 'Spoofed' });
  assert.equal(toStore.status, 200);
  assert.equal(toStore.body.data.assignedToName, 'Meena');
  assert.equal(toStore.body.data.storeId, 'STR-A');
  // The store admin hands it on, but only inside their own store.
  assert.equal((await assign('U-SADMIN', { assignedToId: 'U-VAN' })).status, 400);
  const ok = await assign('U-SADMIN', { assignedToId: 'U-EMP', assignedToName: 'Spoofed' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.assignedToName, 'Karthik');
  assert.equal(ok.body.data.storeId, 'STR-A');
  assert.equal((await call('U-F2', 'PUT', `/api/tickets/${t.id}/status`, { status: 'Resolved' })).status, 403);
  assert.equal((await call('U-ADMIN', 'PUT', `/api/tickets/${t.id}/status`, { status: 'Bogus' })).status, 400);
});

test('tickets: another employee and delivery staff do not see an assigned ticket', async () => {
  const t = [...tickets.values()].find((x) => x.assignedToId === 'U-EMP');
  const emp2 = await call('U-EMP2', 'GET', '/api/tickets');
  assert.ok(!emp2.body.data.some((x) => x.id === t.id));
  const van = await call('U-VAN', 'GET', '/api/tickets');
  assert.equal(van.body.data.length, 0);
});

test('tickets: an admin without the support module is refused', async () => {
  assert.equal((await call('U-NOTIX', 'GET', '/api/tickets')).status, 403);
});

test('experts: the public directory never includes KYC, bank or contact details', async () => {
  const r = await call(null, 'GET', '/api/agronomy-experts');
  assert.equal(r.status, 200);
  assert.equal(r.body.data.length, 1);
  const text = JSON.stringify(r.body.data);
  for (const secret of ['1234 5678 9012', '000111222', 'ABCDE1234F', 'aadhar', 'bank', 'pan', 'phone', 'password']) {
    assert.ok(!text.includes(secret), `leaked ${secret}`);
  }
  assert.equal(r.body.data[0].name, 'Karthik');
});

test('bookings: sign-in required, tied to the account, visible to owner and expert only', async () => {
  assert.equal((await call(null, 'POST', '/api/agronomy-bookings', { expertId: 'U-EMP' })).status, 401);
  assert.equal((await call('U-F1', 'POST', '/api/agronomy-bookings', { expertId: 'U-EMP2', phone: '9000000001' })).status, 400);
  const r = await call('U-F1', 'POST', '/api/agronomy-bookings', { expertId: 'U-EMP', userId: 'U-F2', phone: '9000000001', crop: 'Paddy' });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.userId, 'U-F1');
  assert.equal((await call('U-F2', 'GET', '/api/agronomy-bookings')).body.data.length, 0);
  assert.equal((await call('U-EMP', 'GET', '/api/agronomy-bookings')).body.data.length, 1);
  assert.equal((await call('U-EMP2', 'PUT', `/api/agronomy-bookings/${r.body.data.id}/complete`, { callbackNotes: 'x' })).status, 404);
  const done = await call('U-EMP', 'PUT', `/api/agronomy-bookings/${r.body.data.id}/complete`, { callbackNotes: 'Called' });
  assert.equal(done.body.data.status, 'Completed');
});

test('soil reports: stored on the server, farmers see their own, staff what is assigned to them', async () => {
  assert.equal((await call(null, 'POST', '/api/soil-reports', { ph: 7 })).status, 401);
  const r = await call('U-F1', 'POST', '/api/soil-reports', { userId: 'U-F2', ph: '8.2', nitrogen: 215, crop: 'Paddy/Rice', status: 'Completed' });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.userId, 'U-F1');
  assert.equal(r.body.data.status, 'Pending Review');
  assert.equal(r.body.data.ph, 8.2);
  const id = r.body.data.id;

  assert.equal((await call('U-F2', 'GET', '/api/soil-reports')).body.data.length, 0);
  assert.equal((await call('U-F1', 'GET', '/api/soil-reports')).body.data.length, 1);
  assert.equal((await call('U-EMP', 'GET', '/api/soil-reports')).body.data.length, 0);
  assert.equal((await call('U-EMP', 'PUT', `/api/soil-reports/${id}/status`, { status: 'Completed' })).status, 404);

  const a = await call('U-ADMIN', 'PUT', `/api/soil-reports/${id}/assign`, { staffId: 'U-EMP', staffName: 'Spoofed' });
  assert.equal(a.body.data.assignedToName, 'Karthik');
  assert.equal(a.body.data.status, 'Under Agronomist Analysis');
  assert.equal((await call('U-EMP', 'GET', '/api/soil-reports')).body.data.length, 1);
  const s = await call('U-EMP', 'PUT', `/api/soil-reports/${id}/status`, { status: 'Prescription Issued', agronomistNotes: 'Apply gypsum' });
  assert.equal(s.body.data.status, 'Prescription Issued');
  assert.equal((await call('U-F1', 'PUT', `/api/soil-reports/${id}/status`, { status: 'Completed' })).status, 403);
});
