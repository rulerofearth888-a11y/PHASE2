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
