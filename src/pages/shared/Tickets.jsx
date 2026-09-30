import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Ticket, User, CheckCircle2, Clock, AlertTriangle, RefreshCw, Send, Filter, Search } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { ticketService } from '../../services/ticketService'

export default function Tickets() {
  const { user } = useAuth()
  const [tickets, setTickets] = useState([])
  const [filterMode, setFilterMode] = useState('assigned_to_me') // 'assigned_to_me' | 'all'
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [replyText, setReplyText] = useState({})
  const [loading, setLoading] = useState(true)

  const loadTickets = useCallback(async () => {
    setLoading(true)
    try {
      const list = await ticketService.getTickets({
        role: user?.role || 'employee',
        userId: user?.id || user?._id
      })
      setTickets(list)
    } catch {
      toast.error('Failed to load tickets')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadTickets()
    const onUpdate = () => loadTickets()
    window.addEventListener('sathyam:tickets-updated', onUpdate)
    return () => window.removeEventListener('sathyam:tickets-updated', onUpdate)
  }, [loadTickets])

  const addReply = async (id) => {
    const text = replyText[id]
    if (!text?.trim()) return

    try {
      await ticketService.addReply(id, {
        senderName: user?.name || 'Assigned Agronomist',
        senderRole: 'employee',
        text: text.trim()
      })
      setReplyText(r => ({ ...r, [id]: '' }))
      toast.success('Reply submitted to customer and Super Admin')
      await loadTickets()
    } catch {
      toast.error('Could not send reply')
    }
  }

  const updateStatus = async (id, status) => {
    try {
      await ticketService.updateTicketStatus(id, status, user?.name || 'Employee')
      toast.success(`Ticket marked as ${status}`)
      await loadTickets()
    } catch {
      toast.error('Could not update status')
    }
  }

  const filteredTickets = tickets.filter(ticket => {
    const currentUserId = user?.id || user?._id

    // Filter by assigned to me vs all
    if (filterMode === 'assigned_to_me') {
      const isAssignedToMe = ticket.assignedToId === currentUserId ||
        (ticket.assignedToName && user?.name && ticket.assignedToName.toLowerCase().includes(user.name.toLowerCase().split(' ')[0]))
      if (!isAssignedToMe) return false
    }

    // Status filter
    if (statusFilter !== 'all') {
      const s = (ticket.status || '').toLowerCase()
      if (statusFilter === 'open' && s !== 'open' && s !== 'pending') return false
      if (statusFilter === 'progress' && s !== 'in progress') return false
      if (statusFilter === 'resolved' && s !== 'resolved' && s !== 'closed') return false
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase()
      const match =
        ticket.id.toLowerCase().includes(q) ||
        (ticket.orderId && ticket.orderId.toLowerCase().includes(q)) ||
        (ticket.farmerName && ticket.farmerName.toLowerCase().includes(q)) ||
        (ticket.subject && ticket.subject.toLowerCase().includes(q)) ||
        (ticket.category && ticket.category.toLowerCase().includes(q))
      if (!match) return false
    }

    return true
  })

  return (
    <div className="animate-fade-in" style={{ padding: '8px 0 32px' }}>
      <div className="page-header" style={{ marginBottom: 18 }}>
        <div>
          <div className="eyebrow">Employee Operational Desk</div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Ticket size={26} color="#16a34a" /> Assigned Support Tickets
          </h1>
          <p>
            Monitor and resolve farmer tickets delegated to you by Super Admin and Store Managers.
          </p>
        </div>

        <button
          type="button"
          onClick={loadTickets}
          className="btn btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Queue
        </button>
      </div>

      {/* Filter and Tab Bar */}
      <div style={{ background: '#fff', padding: '14px 18px', borderRadius: 10, border: '1px solid #e2e8f0', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
        {/* Assignment tab */}
        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 6, padding: 2 }}>
          <button
            type="button"
            onClick={() => setFilterMode('assigned_to_me')}
            style={{
              padding: '6px 14px',
              borderRadius: 5,
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: filterMode === 'assigned_to_me' ? '#16a34a' : 'transparent',
              color: filterMode === 'assigned_to_me' ? '#fff' : '#64748b'
            }}
          >
            Assigned to Me ({tickets.filter(t => t.assignedToId === (user?.id || user?._id) || (ticketService && t.assignedRole === 'employee')).length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            style={{
              padding: '6px 14px',
              borderRadius: 5,
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: filterMode === 'all' ? '#16a34a' : 'transparent',
              color: filterMode === 'all' ? '#fff' : '#64748b'
            }}
          >
            All Operational Tickets ({tickets.length})
          </button>
        </div>

        {/* Status Dropdown */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem', background: '#fff' }}
        >
          <option value="all">All Statuses</option>
          <option value="open">Open / Pending</option>
          <option value="progress">In Progress</option>
          <option value="resolved">Resolved</option>
        </select>

        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search ticket ID, order ID, farmer..."
            style={{ width: '100%', padding: '7px 12px 7px 32px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
          />
        </div>
      </div>

      {/* Tickets List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading support tickets...</div>
        ) : filteredTickets.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <Ticket size={36} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
            <h3 style={{ margin: '0 0 6px', color: '#475569' }}>No tickets found in this queue</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
              {filterMode === 'assigned_to_me'
                ? 'Super Admin has not assigned any tickets to your account yet.'
                : 'No tickets match the search/filter criteria.'}
            </p>
          </div>
        ) : (
          filteredTickets.map(ticket => (
            <div key={ticket.id} className="card" style={{ padding: '20px', borderLeft: '4px solid #16a34a' }}>
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <strong style={{ color: 'var(--brand-600)', fontSize: '0.95rem' }}>{ticket.id}</strong>
                  {ticket.orderId && (
                    <span style={{ fontSize: '0.75rem', background: '#f1f5f9', color: '#334155', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                      Order: {ticket.orderId}
                    </span>
                  )}
                  <span className={`badge ${ticket.priority === 'High' || ticket.priority === 'Urgent' ? 'badge-red' : ticket.priority === 'Medium' ? 'badge-yellow' : 'badge-gray'}`}>
                    {ticket.priority?.toUpperCase()}
                  </span>
                  <span className={`badge ${ticket.status === 'Open' || ticket.status === 'Pending' ? 'badge-orange' : ticket.status === 'In Progress' ? 'badge-blue' : 'badge-green'}`}>
                    {ticket.status?.toUpperCase()}
                  </span>
                </div>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  📅 {new Date(ticket.createdAt || ticket.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>

              {/* Subject & Reporter */}
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#0f172a', marginBottom: '6px' }}>
                {ticket.subject || ticket.issue}
              </div>

              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.82rem', color: '#64748b', marginBottom: '12px' }}>
                <span>👤 Farmer: <strong>{ticket.farmerName || ticket.farmer}</strong></span>
                {ticket.phone && <span>📱 {ticket.phone}</span>}
                {ticket.crop && <span>🌾 Crop: <strong>{ticket.crop}</strong></span>}
                {ticket.category && <span>📂 Category: <strong>{ticket.category}</strong></span>}
                {ticket.assignedToName && (
                  <span style={{ color: '#0284c7' }}>
                    👨‍🌾 Handler: <strong>{ticket.assignedToName}</strong>
                  </span>
                )}
              </div>

              {/* Problem Description */}
              {ticket.description && (
                <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 8, fontSize: '0.88rem', color: '#334155', lineHeight: 1.5, marginBottom: '14px', border: '1px solid #e2e8f0' }}>
                  {ticket.description}
                </div>
              )}

              {/* Replies History */}
              {ticket.replies && ticket.replies.length > 0 && (
                <div style={{ marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ticket.replies.map((r, i) => (
                    <div
                      key={r.id || i}
                      style={{
                        background: r.senderRole === 'employee' ? 'rgba(34,197,94,0.08)' : '#f8fafc',
                        border: '1px solid rgba(0,0,0,0.06)',
                        borderRadius: 'var(--radius-md)',
                        padding: '10px 14px',
                        fontSize: '0.84rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, fontSize: '0.72rem', color: '#64748b' }}>
                        <strong>{r.senderName || (typeof r === 'string' ? 'Note' : 'Message')}</strong>
                        <span>{r.time || ''}</span>
                      </div>
                      <div style={{ color: '#1e293b' }}>
                        {typeof r === 'string' ? r : r.text}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Employee Actions: Status Updater & Reply */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Mark Status:</span>
                  <button
                    type="button"
                    onClick={() => updateStatus(ticket.id, 'In Progress')}
                    style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: 4, border: '1px solid #3b82f6', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', fontWeight: 600 }}
                  >
                    In Progress
                  </button>
                  <button
                    type="button"
                    onClick={() => updateStatus(ticket.id, 'Resolved')}
                    style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: 4, border: '1px solid #22c55e', background: '#f0fdf4', color: '#15803d', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Resolved
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 8, flex: '1 1 340px', justifyContent: 'flex-end' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Type advisory reply or resolution note..."
                    value={replyText[ticket.id] || ''}
                    onChange={e => setReplyText({ ...replyText, [ticket.id]: e.target.value })}
                    style={{ flex: 1, padding: '7px 12px', fontSize: '0.85rem' }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => addReply(ticket.id)}
                    style={{ padding: '7px 16px', fontSize: '0.85rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <Send size={14} /> Reply
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
