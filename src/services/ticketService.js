import axios from 'axios'

const STORAGE_KEY = 'sathyam_support_tickets_v1'

const DEFAULT_TICKETS = [
  {
    id: 'TCK-901',
    orderId: 'SAM-ORD-8821',
    userId: 'USR-1001',
    farmerName: 'Rameshwar Patel',
    phone: '9876543210',
    email: 'rameshwar@example.com',
    crop: 'Paddy/Rice',
    category: 'Product Quality',
    priority: 'High',
    subject: 'BlastShield bottle seal broken and leakage during transit',
    description: 'Received the package yesterday for order SAM-ORD-8821. One of the 500g BlastShield bottles had a cracked lid and ~100g leaked out into the cardboard carton.',
    status: 'In Progress',
    assignedToId: 'USR-0003',
    assignedToName: 'Dr. K. Senthil',
    assignedRole: 'employee',
    assignedAt: '2026-08-30T10:15:00.000Z',
    createdAt: '2026-08-29T11:00:00.000Z',
    updatedAt: '2026-08-30T11:45:00.000Z',
    resolvedAt: null,
    orderItems: [{ name: 'Sathyam Agro Mart BlastShield 75 WP', qty: 2, price: 680 }],
    replies: [
      {
        id: 'rep-1',
        senderName: 'Rameshwar Patel',
        senderRole: 'farmer',
        text: 'Received defective packaging with cracked cap. Please provide replacement bottle.',
        time: '29 Aug 2026, 11:00 AM',
        createdAt: '2026-08-29T11:00:00.000Z'
      },
      {
        id: 'rep-2',
        senderName: 'Dr. K. Senthil',
        senderRole: 'employee',
        text: 'Hello Rameshwar ji, we deeply apologize for the transit damage. I have requested our logistics team to dispatch a fresh sealed 500g replacement bottle today via Express courier at zero cost.',
        time: '30 Aug 2026, 11:45 AM',
        createdAt: '2026-08-30T11:45:00.000Z'
      }
    ]
  },
  {
    id: 'TCK-902',
    orderId: 'SAM-ORD-8822',
    userId: 'USR-1007',
    farmerName: 'Gurpreet Singh',
    phone: '9814077889',
    email: 'gurpreet.farm@example.com',
    crop: 'Cotton',
    category: 'Delivery Delay',
    priority: 'Medium',
    subject: 'FlyKill Ultra delivery delayed by 3 days in Karnal',
    description: 'Order placed on 26th Aug for urgent whitefly control. Tracking has been stuck at regional hub for 3 days.',
    status: 'Pending',
    assignedToId: 'USR-0002',
    assignedToName: 'Store Admin - Headquarters',
    assignedRole: 'admin',
    assignedAt: '2026-08-30T14:00:00.000Z',
    createdAt: '2026-08-30T13:30:00.000Z',
    updatedAt: '2026-08-30T14:00:00.000Z',
    resolvedAt: null,
    orderItems: [{ name: 'Sathyam Agro Mart FlyKill Ultra', qty: 3, price: 840 }],
    replies: [
      {
        id: 'rep-3',
        senderName: 'Gurpreet Singh',
        senderRole: 'farmer',
        text: 'Pest infestation is spreading fast. Need this delivery expedited immediately.',
        time: '30 Aug 2026, 01:30 PM',
        createdAt: '2026-08-30T13:30:00.000Z'
      }
    ]
  },
  {
    id: 'TCK-903',
    orderId: 'SAM-ORD-8819',
    userId: 'USR-1001',
    farmerName: 'Rameshwar Patel',
    phone: '9876543210',
    email: 'rameshwar@example.com',
    crop: 'Paddy/Rice',
    category: 'Agronomy Advisory',
    priority: 'Low',
    subject: 'Mixing compatibility query for RootVigor Gold with Neem oil',
    description: 'Can I tank-mix RootVigor Gold with 10000 PPM cold pressed Neem oil for foliar spray on 30-day paddy?',
    status: 'Resolved',
    assignedToId: 'USR-0003',
    assignedToName: 'Dr. K. Senthil',
    assignedRole: 'employee',
    assignedAt: '2026-08-28T09:30:00.000Z',
    createdAt: '2026-08-28T09:00:00.000Z',
    updatedAt: '2026-08-28T14:10:00.000Z',
    resolvedAt: '2026-08-28T14:10:00.000Z',
    orderItems: [{ name: 'Sathyam Agro Mart RootVigor Gold', qty: 1, price: 990 }],
    replies: [
      {
        id: 'rep-4',
        senderName: 'Rameshwar Patel',
        senderRole: 'farmer',
        text: 'Can I tank-mix RootVigor Gold with 10000 PPM Neem oil?',
        time: '28 Aug 2026, 09:00 AM',
        createdAt: '2026-08-28T09:00:00.000Z'
      },
      {
        id: 'rep-5',
        senderName: 'Dr. K. Senthil',
        senderRole: 'employee',
        text: 'Yes! RootVigor Gold is 100% organically compatible with pure cold-pressed Neem oil. Maintain spray water pH between 6.0 and 7.0 for optimal foliar absorption.',
        time: '28 Aug 2026, 02:10 PM',
        createdAt: '2026-08-28T14:10:00.000Z'
      }
    ]
  }
]

function readStoredTickets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_TICKETS))
      return DEFAULT_TICKETS
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_TICKETS
  } catch {
    return DEFAULT_TICKETS
  }
}

function writeStoredTickets(tickets) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets))
    window.dispatchEvent(new CustomEvent('sathyam:tickets-updated', { detail: tickets }))
  } catch (err) {
    console.error('Failed to save tickets in localStorage', err)
  }
}

export const ticketService = {
  // Get all tickets with role-based filtering
  async getTickets({ role, userId, phone, assignedToId } = {}) {
    try {
      // First try fetching from backend
      const res = await axios.get('/api/tickets', { params: { role, userId, phone, assignedToId } }).catch(() => null)
      if (res?.data?.success && Array.isArray(res.data.data) && res.data.data.length > 0) {
        // Merge with local storage
        const local = readStoredTickets()
        const backendMap = new Map(res.data.data.map(t => [t.id, t]))
        const merged = [...res.data.data]
        local.forEach(lt => {
          if (!backendMap.has(lt.id)) merged.push(lt)
        })
        writeStoredTickets(merged)
        return this.filterTickets(merged, { role, userId, phone, assignedToId })
      }
    } catch {
      // Fallback to local
    }

    const tickets = readStoredTickets()
    return this.filterTickets(tickets, { role, userId, phone, assignedToId })
  },

  filterTickets(tickets, { role, userId, phone, assignedToId } = {}) {
    return tickets.filter(ticket => {
      // Super admin sees every single ticket in the system
      if (role === 'superadmin') return true

      // Admin sees company-wide or store tickets
      if (role === 'admin') return true

      // If filtering by specific employee assigned
      if (assignedToId) {
        return ticket.assignedToId === assignedToId
      }

      // Employee sees tickets assigned to them or unassigned
      if (role === 'employee') {
        if (!userId) return true
        return ticket.assignedToId === userId || !ticket.assignedToId
      }

      // Customer sees tickets matched by their userId or phone
      if (userId && ticket.userId === userId) return true
      if (phone && ticket.phone && ticket.phone.includes(phone.slice(-10))) return true

      return true
    })
  },

  // Create a new support ticket linked to an order (no time limit on previous orders)
  async createTicket({
    orderId,
    userId,
    farmerName,
    phone,
    email,
    crop,
    category,
    priority = 'Medium',
    subject,
    description,
    orderItems = [],
    attachment = null
  }) {
    const tickets = readStoredTickets()
    const newId = `TCK-${Math.floor(100 + Math.random() * 900)}`
    const now = new Date().toISOString()
    const formattedTime = new Date().toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

    const newTicket = {
      id: newId,
      orderId: orderId || 'MANUAL-ORDER',
      userId: userId || `USR-${Math.floor(1000 + Math.random() * 9000)}`,
      farmerName: farmerName || 'Farmer Customer',
      phone: phone || '',
      email: email || '',
      crop: crop || 'All Crops',
      category: category || 'Product Quality',
      priority: priority || 'Medium',
      subject: subject || 'Support Query',
      description: description || '',
      status: 'Open',
      assignedToId: null,
      assignedToName: 'Unassigned',
      assignedRole: null,
      assignedAt: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      orderItems: Array.isArray(orderItems) ? orderItems : [],
      attachment,
      replies: [
        {
          id: `rep-${Date.now()}`,
          senderName: farmerName || 'Farmer',
          senderRole: 'farmer',
          text: description,
          time: formattedTime,
          createdAt: now
        }
      ]
    }

    const updatedList = [newTicket, ...tickets]
    writeStoredTickets(updatedList)

    // Sync to backend if available
    try {
      await axios.post('/api/tickets', newTicket).catch(() => null)
    } catch (e) {
      // Backend sync error silently handled
    }

    return newTicket
  },

  // Super Admin & Admin assign support ticket to Admin or Employee
  async assignTicket(ticketId, { assignedToId, assignedToName, assignedRole, assignedBy = 'Super Admin' }) {
    const tickets = readStoredTickets()
    const now = new Date().toISOString()
    const formattedTime = new Date().toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })

    const updated = tickets.map(ticket => {
      if (ticket.id === ticketId) {
        const nextReplies = [
          ...ticket.replies,
          {
            id: `rep-${Date.now()}`,
            senderName: 'System Broadcast',
            senderRole: 'system',
            text: `Ticket assigned to ${assignedToName} (${assignedRole?.toUpperCase()}) by ${assignedBy}.`,
            time: formattedTime,
            createdAt: now
          }
        ]

        return {
          ...ticket,
          assignedToId,
          assignedToName,
          assignedRole,
          assignedAt: now,
          status: ticket.status === 'Open' ? 'In Progress' : ticket.status,
          updatedAt: now,
          replies: nextReplies
        }
      }
      return ticket
    })

    writeStoredTickets(updated)

    // Backend sync
    try {
      await axios.put(`/api/tickets/${ticketId}/assign`, {
        assignedToId,
        assignedToName,
        assignedRole,
        assignedBy
      }).catch(() => null)
    } catch (e) {
      // Silently catch
    }

    return updated.find(t => t.id === ticketId)
  },

  // Update status (Pending, In Progress, Resolved, Rejected/Closed)
  async updateTicketStatus(ticketId, status, actor = 'Staff') {
    const tickets = readStoredTickets()
    const now = new Date().toISOString()
    const formattedTime = new Date().toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })

    const updated = tickets.map(ticket => {
      if (ticket.id === ticketId) {
        const nextReplies = [
          ...ticket.replies,
          {
            id: `rep-${Date.now()}`,
            senderName: 'Status Update',
            senderRole: 'system',
            text: `Status changed to ${status.toUpperCase()} by ${actor}.`,
            time: formattedTime,
            createdAt: now
          }
        ]

        return {
          ...ticket,
          status,
          resolvedAt: status.toLowerCase() === 'resolved' ? now : ticket.resolvedAt,
          updatedAt: now,
          replies: nextReplies
        }
      }
      return ticket
    })

    writeStoredTickets(updated)

    // Backend sync
    try {
      await axios.put(`/api/tickets/${ticketId}/status`, { status, actor }).catch(() => null)
    } catch (e) {}

    return updated.find(t => t.id === ticketId)
  },

  // Add conversation message/reply to ticket
  async addReply(ticketId, { senderName, senderRole, text }) {
    const tickets = readStoredTickets()
    const now = new Date().toISOString()
    const formattedTime = new Date().toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

    const newReply = {
      id: `rep-${Date.now()}`,
      senderName,
      senderRole,
      text,
      time: formattedTime,
      createdAt: now
    }

    const updated = tickets.map(ticket => {
      if (ticket.id === ticketId) {
        return {
          ...ticket,
          updatedAt: now,
          status: senderRole !== 'farmer' && ticket.status === 'Open' ? 'In Progress' : ticket.status,
          replies: [...ticket.replies, newReply]
        }
      }
      return ticket
    })

    writeStoredTickets(updated)

    // Backend sync
    try {
      await axios.post(`/api/tickets/${ticketId}/replies`, newReply).catch(() => null)
    } catch (e) {}

    return updated.find(t => t.id === ticketId)
  }
}
