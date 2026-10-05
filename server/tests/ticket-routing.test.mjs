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
