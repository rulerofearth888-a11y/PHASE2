import axios from 'axios'

// Support tickets live on the server (/api/tickets). The server decides who
// sees what from the signed-in account: admins every ticket, employees their
// own plus the unassigned queue, farmers only their own tickets.

function notifyUpdated(ticket) {
  window.dispatchEvent(new CustomEvent('sathyam:tickets-updated', { detail: ticket }))
}

function unwrap(res, fallbackMessage) {
  if (!res?.data?.success) throw new Error(res?.data?.message || fallbackMessage)
  return res.data.data
}

export const ticketService = {
  // Filtering by role happens on the server; the arguments are kept so the
  // pages' calls stay unchanged.
  async getTickets() {
    const res = await axios.get('/api/tickets')
    const list = unwrap(res, 'Unable to fetch tickets')
    return Array.isArray(list) ? list : []
  },

  // Create a new support ticket, optionally linked to one of the farmer's orders
  async createTicket({ orderId, farmerName, phone, crop, category, priority = 'Medium', subject, description, orderItems = [] }) {
    const res = await axios.post('/api/tickets', { orderId, farmerName, phone, crop, category, priority, subject, description, orderItems })
    const ticket = unwrap(res, 'Failed to submit support ticket')
    notifyUpdated(ticket)
    return ticket
  },

  // Super Admin assigns to an admin of the ticket's store (storeId); a store
  // admin hands it to their own staff. Rules: server/ticketRouting.js.
  async assignTicket(ticketId, { assignedToId, storeId }) {
    const res = await axios.put(`/api/tickets/${encodeURIComponent(ticketId)}/assign`, { assignedToId, storeId })
    const ticket = unwrap(res, 'Could not assign ticket')
    notifyUpdated(ticket)
    return ticket
  },

  // Status: Open, In Progress, Pending, Resolved, Closed, Rejected
  async updateTicketStatus(ticketId, status) {
    const res = await axios.put(`/api/tickets/${encodeURIComponent(ticketId)}/status`, { status })
    const ticket = unwrap(res, 'Could not update status')
    notifyUpdated(ticket)
    return ticket
  },

  // Sender name and role come from the signed-in account on the server
  async addReply(ticketId, { text }) {
    const res = await axios.post(`/api/tickets/${encodeURIComponent(ticketId)}/replies`, { text })
    const ticket = unwrap(res, 'Could not send reply')
    notifyUpdated(ticket)
    return ticket
  }
}
