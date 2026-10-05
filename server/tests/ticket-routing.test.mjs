// Support ticket routing (server/ticketRouting.js): only the Super Admin
// assigns to a store's admin, a store admin only to their own store's staff,
// and the store suggestion from the farmer's district. Run from server/: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAssignment, adminCanSeeTicket, suggestStore, ticketDistrict } from '../ticketRouting.js';

const stores = [
  { id: 'STR-1', name: 'Coimbatore Branch', location: 'Coimbatore', address: '14, Kavundampalayam, Coimbatore', status: 'active' },
  { id: 'STR-2', name: 'Salem Branch', location: 'Salem, Tamil Nadu', status: 'active' },
  { id: 'STR-3', name: 'Old Erode', location: 'Erode', status: 'inactive' },
];
const superadmin = { id: 'U0', role: 'superadmin', name: 'Owner' };
const cbeAdmin = { id: 'A1', role: 'admin', name: 'Ravi', storeId: 'STR-1', status: 'active' };
const salemAdmin = { id: 'A2', role: 'admin', name: 'Meena', storeId: 'STR-2', status: 'active' };
const hqAdmin = { id: 'A0', role: 'admin', name: 'Head office', storeId: '' };
const cbeEmployee = { id: 'E1', role: 'employee', name: 'Kumar', storeId: 'STR-1' };
const salemDelivery = { id: 'D2', role: 'delivery', name: 'Arun', storeId: 'STR-2' };
const ticket = { id: 'TCK-1', storeId: null };
const cbeTicket = { id: 'TCK-2', storeId: 'STR-1' };

test('Super Admin assigns only to an admin of the chosen store', () => {
  assert.deepEqual(checkAssignment({ actor: superadmin, ticket, staff: cbeAdmin, store: stores[0] }), { ok: true, storeId: 'STR-1' });
  const wrongStore = checkAssignment({ actor: superadmin, ticket, staff: salemAdmin, store: stores[0] });
  assert.equal(wrongStore.ok, false);
  assert.match(wrongStore.message, /Meena is not an admin of Coimbatore Branch/);
  assert.equal(checkAssignment({ actor: superadmin, ticket, staff: cbeEmployee, store: stores[0] }).ok, false);
  assert.match(checkAssignment({ actor: superadmin, ticket, staff: cbeAdmin, store: null }).message, /Choose the store/);
  assert.equal(checkAssignment({ actor: superadmin, ticket, staff: { ...cbeAdmin, storeId: 'STR-3' }, store: stores[2] }).ok, false);
  assert.equal(checkAssignment({ actor: superadmin, ticket, staff: { ...cbeAdmin, status: 'inactive' }, store: stores[0] }).ok, false);
});

test('a store admin hands only their own store tickets to their own staff', () => {
  assert.deepEqual(checkAssignment({ actor: cbeAdmin, ticket: cbeTicket, staff: cbeEmployee }), { ok: true, storeId: 'STR-1' });
  assert.equal(checkAssignment({ actor: cbeAdmin, ticket: cbeTicket, staff: salemDelivery }).ok, false);
  assert.equal(checkAssignment({ actor: cbeAdmin, ticket: { id: 'X', storeId: 'STR-2' }, staff: cbeEmployee }).status, 403);
  assert.equal(checkAssignment({ actor: cbeAdmin, ticket: cbeTicket, staff: salemAdmin }).ok, false);
  assert.equal(checkAssignment({ actor: cbeAdmin, ticket, staff: cbeEmployee }).status, 403);
});

test('admins without a store and other roles cannot assign', () => {
  assert.match(checkAssignment({ actor: hqAdmin, ticket, staff: cbeAdmin }).message, /Only the Super Admin/);
  assert.equal(checkAssignment({ actor: cbeEmployee, ticket: cbeTicket, staff: cbeEmployee }).status, 403);
  assert.equal(checkAssignment({ actor: null, ticket, staff: cbeAdmin }).status, 401);
  assert.equal(checkAssignment({ actor: superadmin, ticket: null, staff: cbeAdmin, store: stores[0] }).status, 404);
});

test('who sees which tickets', () => {
  assert.ok(adminCanSeeTicket(superadmin, ticket));
  assert.ok(adminCanSeeTicket(hqAdmin, ticket));
  assert.ok(adminCanSeeTicket(cbeAdmin, cbeTicket));
  assert.ok(!adminCanSeeTicket(cbeAdmin, ticket));
  assert.ok(!adminCanSeeTicket(salemAdmin, cbeTicket));
  assert.ok(adminCanSeeTicket(salemAdmin, { id: 'Y', storeId: 'STR-1', assignedToId: 'A2' }));
});

test('suggested store from the farmer district, none when no store covers it', () => {
  assert.equal(ticketDistrict({ addressDetails: { district: 'Coimbatore' } }), 'Coimbatore');
  assert.equal(ticketDistrict(null), '');
  assert.equal(suggestStore('Coimbatore', stores)?.id, 'STR-1');
  assert.equal(suggestStore('salem', stores)?.id, 'STR-2');
  assert.equal(suggestStore('Erode', stores), null);          // inactive store
  assert.equal(suggestStore('Madurai', stores), null);        // no store there
  assert.equal(suggestStore('Sale', stores), null);           // whole words only
  assert.equal(suggestStore('', stores), null);
});

import { rankStores, haversineKm, ticketPlace } from '../ticketRouting.js';
import { createGeocoder, geocodeKey, geocodeParams } from '../geocode.js';

const CBE = { lat: 11.0168, lng: 76.9558 };   // Coimbatore
const SALEM = { lat: 11.6643, lng: 78.146 };
const TIRUPPUR = { lat: 11.1085, lng: 77.3411 };

test('distance and nearest-first store order', () => {
  const km = haversineKm(CBE, SALEM);
  assert.ok(km > 140 && km < 160, `Coimbatore-Salem ~150 km, got ${km}`);
  const ranked = rankStores(TIRUPPUR, [
    { id: 'S', name: 'Salem', geo: SALEM },
    { id: 'C', name: 'Coimbatore', geo: CBE },
    { id: 'X', name: 'No map point' },
    { id: 'Z', name: 'Closed', geo: TIRUPPUR, status: 'inactive' },
  ]);
  assert.deepEqual(ranked.map(s => s.id), ['C', 'S', 'X']);   // inactive left out, unknown last
  assert.ok(ranked[0].distanceKm >= 40 && ranked[0].distanceKm <= 50);
  assert.equal(ranked[2].distanceKm, null);
  assert.deepEqual(rankStores(null, [{ id: 'A' }, { id: 'B' }]).map(s => s.id), ['A', 'B']);
});

test('where the farmer is: GPS pin first, then the address, then the profile', () => {
  const withPin = ticketPlace({ addressDetails: { geo: { lat: 11, lng: 77 }, pincode: '641030', district: 'Coimbatore', state: 'Tamil Nadu', area: 'Kavundampalayam' } });
  assert.deepEqual(withPin.geo, { lat: 11, lng: 77 });
  assert.equal(withPin.label, 'Kavundampalayam, Coimbatore, 641030');
  assert.equal(ticketPlace({ addressDetails: { pincode: '636001', district: 'Salem' } }).geo, null);
  assert.equal(ticketPlace(null, { village: 'Avinashi', district: 'Tiruppur', state: 'Tamil Nadu' }).text, 'Avinashi');
  assert.equal(ticketPlace(null, null), null);
});

test('geocoder: pincode lookups, cached once, misses remembered, failures not', async () => {
  assert.equal(geocodeKey({ pincode: '641 030' }), 'pin:641030');
  assert.equal(geocodeParams({ pincode: '641030', state: 'Tamil Nadu' }).get('postalcode'), '641030');
  assert.equal(geocodeParams({ district: 'Salem', state: 'Tamil Nadu' }).get('q'), 'Salem, Tamil Nadu, India');
  assert.equal(geocodeParams({}), null);

  const kv = new Map();
  let calls = 0;
  const fakeFetch = async url => {
    calls += 1;
    if (url.includes('postalcode=641030')) return { ok: true, json: async () => [{ lat: '11.0168', lon: '76.9558' }] };
    if (url.includes('postalcode=999999')) return { ok: true, json: async () => [] };
    return { ok: false, json: async () => ({}) };
  };
  const geocode = createGeocoder({ kvGet: async k => kv.get(k) ?? null, kvSet: async (k, v) => kv.set(k, v), fetchImpl: fakeFetch, minGapMs: 0 });
  assert.deepEqual(await geocode({ pincode: '641030' }), CBE);
  assert.deepEqual(await geocode({ pincode: '641030' }), CBE);
  assert.equal(calls, 1);                                   // second time from the cache
  assert.equal(await geocode({ pincode: '999999' }), null);
  assert.equal(await geocode({ pincode: '999999' }), null);
  assert.equal(calls, 2);                                   // a miss is remembered
  assert.equal(await geocode({ district: 'Nowhere' }), null);
  assert.equal(await geocode({ district: 'Nowhere' }), null);
  assert.equal(calls, 4);                                   // a service error is retried later
  const offline = createGeocoder({ fetchImpl: async () => { throw new Error('offline'); }, minGapMs: 0 });
  assert.equal(await offline({ pincode: '641030' }), null);
});
