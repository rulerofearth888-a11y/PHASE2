// Who may assign a support ticket to whom, and which store a ticket belongs
// to. Pure functions (no database), tested in tests/ticket-routing.test.mjs.
//
// The rules (client, 2026-10-05):
// - Only the Super Admin assigns a ticket to an admin, and only to an admin
//   of the store the ticket is filed under. The Super Admin chooses that
//   store; the system suggests one from the farmer's delivery district when a
//   store covers it (many districts have no store, so it is only a
//   suggestion).
// - A store admin may hand a ticket of their own store to that store's own
//   staff (employee, delivery, billing) - never to another store.
// - A store admin sees their own store's tickets (and any assigned to them);
//   an admin with no store (the original head-office account) sees every
//   ticket, as before. Super Admin sees everything.

export const STORE_STAFF_ROLES = ['employee', 'delivery', 'billing'];

const norm = value => String(value || '').toLowerCase().replace(/[^a-z0-9஀-௿ಀ-೿ఀ-౿ऀ-ॿ]+/g, ' ').trim();

// The farmer's delivery district for a ticket, from its order (structured
// addressDetails first, then the free-text address).
export function ticketDistrict(order) {
  if (!order) return '';
  const details = order.addressDetails || order.deliveryAddress || order.shippingAddress || {};
  return String(details.district || order.district || '').trim();
}

// The active store whose location or address names the district, or null.
// Whole-word match, so "Salem" does not match "Salempur".
export function suggestStore(district, stores) {
  const d = norm(district);
  if (!d) return null;
  const re = new RegExp(`(^| )${d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`);
  return (stores || []).find(store =>
    store && (store.status || 'active') === 'active' && (re.test(norm(store.location)) || re.test(norm(store.address)))
  ) || null;
}

// Whether `actor` may assign `ticket` to `staff` under `storeId`.
// Returns { ok: true, storeId } or { ok: false, status, message }.
export function checkAssignment({ actor, ticket, staff, store }) {
  const deny = (status, message) => ({ ok: false, status, message });
  if (!actor) return deny(401, 'Please sign in to continue.');
  if (!ticket) return deny(404, 'Ticket not found');
  if (!staff || staff.status === 'inactive' || staff.status === 'suspended') return deny(400, 'Choose an active staff member to assign.');

  if (actor.role === 'superadmin') {
    if (!store) return deny(400, 'Choose the store this ticket belongs to.');
    if ((store.status || 'active') !== 'active') return deny(400, 'That store is not active.');
    if (staff.role !== 'admin') return deny(400, 'Tickets go to a store admin. Choose an admin of the selected store.');
    if (staff.storeId !== store.id) return deny(400, `${staff.name} is not an admin of ${store.name}.`);
    return { ok: true, storeId: store.id };
  }

  if (actor.role === 'admin') {
    if (!actor.storeId) return deny(403, 'Only the Super Admin assigns tickets to stores.');
    if (ticket.storeId !== actor.storeId) return deny(403, 'This ticket belongs to another store.');
    if (!STORE_STAFF_ROLES.includes(staff.role)) return deny(400, 'Hand the ticket to an employee, delivery or billing member of your store.');
    if (staff.storeId !== actor.storeId) return deny(400, `${staff.name} is not in your store.`);
    return { ok: true, storeId: actor.storeId };
  }

  return deny(403, 'You do not have permission for this action.');
}

// Admins: Super Admin and head-office admins (no store) see every ticket; a
// store admin sees their store's tickets and any assigned to them.
export function adminCanSeeTicket(user, ticket) {
  if (user.role === 'superadmin') return true;
  if (user.role !== 'admin') return false;
  if (!user.storeId) return true;
  return ticket.storeId === user.storeId || ticket.assignedToId === user.id;
}

// ---- Nearest store (client, 2026-10-05) ----
// The store picked for a ticket is the active store nearest the farmer's
// delivery location; the Super Admin can still choose another.

// Where the farmer is, for a ticket: the order's delivery address (its GPS
// point when "Use my current location" was used, else pincode / district /
// state), or - for a ticket with no order - the farmer's profile.
export function ticketPlace(order, user) {
  const a = order?.addressDetails;
  if (a) {
    const geo = a.geo && Number.isFinite(a.geo.lat) && Number.isFinite(a.geo.lng) ? { lat: a.geo.lat, lng: a.geo.lng } : null;
    return { geo, pincode: a.pincode || '', taluk: a.taluk || '', district: a.district || '', state: a.state || '', label: [a.area, a.district, a.pincode].filter(Boolean).join(', ') };
  }
  if (user) {
    return { geo: null, pincode: user.pincode || '', district: user.district || '', state: user.state || '', text: user.village || '', label: [user.village, user.district].filter(Boolean).join(', ') };
  }
  return null;
}

// Great-circle distance in km.
export function haversineKm(a, b) {
  if (!a || !b) return null;
  const rad = d => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Active stores with their distance from `point`, nearest first; stores with
// no known position go last (distanceKm null), in their original order.
export function rankStores(point, stores) {
  const active = (stores || []).filter(s => s && (s.status || 'active') === 'active');
  const withDist = active.map((s, i) => ({ store: s, i, km: point && s.geo ? haversineKm(point, s.geo) : null }));
  withDist.sort((x, y) => (x.km == null) - (y.km == null) || (x.km ?? 0) - (y.km ?? 0) || x.i - y.i);
  return withDist.map(({ store, km }) => ({ ...store, distanceKm: km == null ? null : Math.round(km) }));
}
