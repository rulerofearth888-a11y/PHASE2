import { useState, useEffect, useCallback, useRef } from 'react'
import { MessageSquare, Clock, User, AlertCircle, CheckCircle, Hourglass, X, UserCheck, Send, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { ticketService } from '../../services/ticketService'
import { useAuth } from '../../context/AuthContext'
import TicketAssignControls from '../../components/tickets/TicketAssignControls'

export default function SupportTickets() {
  const { user } = useAuth()
  const [tickets, setTickets] = useState([])
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Assignment & reply
  const [replyText, setReplyText] = useState('')
  const [submittingReply, setSubmittingReply] = useState(false)

  // Load tickets
  // Read the selection through a ref so loadTickets stays stable; depending
  // on selectedTicket re-ran the load effect after every refresh, forever.
  const selectedRef = useRef(null)
  useEffect(() => { selectedRef.current = selectedTicket }, [selectedTicket])

  const loadTickets = useCallback(async () => {
    setLoading(true)
    try {
      const list = await ticketService.getTickets()
      setTickets(list)
      const selectedTicket = selectedRef.current
      if (list.length > 0 && !selectedTicket) {
        setSelectedTicket(list[0])
      } else if (selectedTicket) {
        const refreshed = list.find(t => t.id === selectedTicket.id)
        if (refreshed) setSelectedTicket(refreshed)
      }
    } catch {
      toast.error('Failed to load tickets')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTickets()

    const onUpdate = () => loadTickets()
    window.addEventListener('sathyam:tickets-updated', onUpdate)
    return () => window.removeEventListener('sathyam:tickets-updated', onUpdate)
  }, [loadTickets])

  const filtered = tickets.filter(t => {
    const status = (t.status || 'open').toLowerCase()
    const priority = (t.priority || 'medium').toLowerCase()

    const statusMatch =
      filterStatus === 'all' ||
      (filterStatus === 'resolved' && (status === 'resolved' || status === 'closed')) ||
      (filterStatus === 'in-progress' && status === 'in progress') ||
      (filterStatus === 'pending' && (status === 'pending' || status === 'open')) ||
      (filterStatus === 'rejected' && status === 'rejected')

    const priorityMatch = filterPriority === 'all' || priority === filterPriority

    const q = search.toLowerCase()
    const searchMatch =
      search === '' ||
      t.subject?.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q) ||
      (t.orderId && t.orderId.toLowerCase().includes(q)) ||
      (t.farmerName && t.farmerName.toLowerCase().includes(q))

    return statusMatch && priorityMatch && searchMatch
  })

  const getStatusColor = (status) => {
    const s = (status || 'pending').toLowerCase()
    const colors = {
      'resolved': { bg: 'rgba(93, 193, 149, 0.12)', color: '#2d9a66', icon: CheckCircle },
      'closed': { bg: 'rgba(93, 193, 149, 0.12)', color: '#2d9a66', icon: CheckCircle },
      'pending': { bg: 'rgba(245, 200, 107, 0.12)', color: '#c8942e', icon: Clock },
      'open': { bg: 'rgba(245, 200, 107, 0.12)', color: '#c8942e', icon: Clock },
      'in progress': { bg: 'rgba(94, 99, 255, 0.12)', color: '#3f46d1', icon: Hourglass },
      'rejected': { bg: 'rgba(239, 68, 68, 0.12)', color: '#ef6d6d', icon: X },
    }
    return colors[s] || colors['pending']
  }

  const getPriorityColor = (priority) => {
    const p = (priority || 'medium').toLowerCase()
    const colors = {
      'urgent': '#ef4444',
      'high': '#ef6d6d',
      'medium': '#f5c86b',
      'low': '#52c6c1',
    }
    return colors[p] || '#f5c86b'
  }

  const handleStatusUpdate = async (ticketId, newStatus) => {
    try {
      const updated = await ticketService.updateTicketStatus(ticketId, newStatus, user?.name || 'Admin')
      toast.success(`Ticket marked as ${newStatus}`)
      setSelectedTicket(updated)
      await loadTickets()
    } catch {
      toast.error('Failed to update status')
    }
  }

  // Admin add reply
  const handleAddReply = async (e) => {
    e.preventDefault()
    if (!replyText.trim() || !selectedTicket) return

    setSubmittingReply(true)
    try {
      const updated = await ticketService.addReply(selectedTicket.id, {
        senderName: user?.name || 'Store Admin',
        senderRole: 'admin',
        text: replyText.trim()
      })
      setReplyText('')
      setSelectedTicket(updated)
      toast.success('Reply recorded')
    } catch {
      toast.error('Failed to post reply')
    } finally {
      setSubmittingReply(false)
    }
  }

  const stats = [
    { label: 'Total Tickets', value: tickets.length, icon: <MessageSquare size={18} />, tone: '', filter: 'all' },
    { label: 'Resolved', value: tickets.filter(t => (t.status || '').toLowerCase() === 'resolved').length, icon: <CheckCircle size={18} />, tone: 'is-green', filter: 'resolved' },
    { label: 'In Progress', value: tickets.filter(t => (t.status || '').toLowerCase() === 'in progress').length, icon: <Hourglass size={18} />, tone: 'is-blue', filter: 'in-progress' },
    { label: 'Unassigned', value: tickets.filter(t => !t.assignedToId || t.assignedToName === 'Unassigned').length, icon: <AlertCircle size={18} />, tone: 'is-amber', filter: null },
  ]
  const statusChip = s => {
    const k = (s || 'pending').toLowerCase()
    return k === 'resolved' || k === 'closed' ? 'p2-chip--green' : k === 'in progress' ? 'p2-chip--blue' : k === 'rejected' ? 'p2-chip--red' : 'p2-chip--amber'
  }
  const priorityChip = p => {
    const k = (p || 'medium').toLowerCase()
    return k === 'urgent' || k === 'high' ? 'p2-chip--red' : k === 'medium' ? 'p2-chip--amber' : ''
  }

  return (
    <div className="animate-fade-in p2-staff">
      <div className="page-header">
        <div>
          <div className="eyebrow">Support Center</div>
          <h1>🎫 Support Tickets &amp; Order Disputes</h1>
          <p>Monitor grievances raised from customer orders, reassign to agronomists, and track real-time resolution</p>
        </div>
        <button type="button" className="p2-btn p2-btn--outline p2-btn--sm" onClick={loadTickets}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Stats (tap to filter) */}
      <div className="p2-stats p2-stats--4">
        {stats.map(stat => (
          <button
            key={stat.label}
            type="button"
            className={`p2-stat ${stat.tone}`}
            aria-pressed={stat.filter !== null && filterStatus === stat.filter}
            onClick={() => stat.filter !== null && setFilterStatus(stat.filter)}
          >
            <span className="p2-stat-icon">{stat.icon}</span>
            <span className="p2-stat-value">{stat.value}</span>
            <span className="p2-stat-label">{stat.label}</span>
          </button>
        ))}
      </div>

      <div className="p2-split">
        {/* Ticket queue */}
        <div className="p2-card p2-queue">
          <div className="p2-queue-head">
            <div className="p2-search">
              <MessageSquare size={16} />
              <input
                type="text"
                className="p2-input"
                placeholder="Search by ticket ID, order ID, farmer name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="p2-grid-2 p2-grid-2--always">
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="p2-input">
                <option value="all">All Status</option>
                <option value="resolved">Resolved</option>
                <option value="in-progress">In Progress</option>
                <option value="pending">Pending / Open</option>
                <option value="rejected">Rejected</option>
              </select>
              <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="p2-input">
                <option value="all">All Priority</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div className="p2-queue-list">
            {loading && tickets.length === 0 ? (
              <div className="p2-loading">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="p2-empty">
                <div className="p2-empty-icon"><MessageSquare size={28} /></div>
                <h3>No tickets found</h3>
                <p>Adjust your filters or search criteria</p>
              </div>
            ) : (
              filtered.map(ticket => (
                <button
                  key={ticket.id}
                  type="button"
                  className="p2-list-item"
                  aria-current={selectedTicket?.id === ticket.id}
                  onClick={() => setSelectedTicket(ticket)}
                >
                  <span className="p2-list-top">
                    <span className="p2-list-id">{ticket.id}</span>
                    <span className="p2-list-chips">
                      <span className={`p2-chip ${priorityChip(ticket.priority)}`}>{(ticket.priority || 'MEDIUM').toUpperCase()}</span>
                      <span className={`p2-chip ${statusChip(ticket.status)}`}>{(ticket.status || 'PENDING').toUpperCase()}</span>
                    </span>
                  </span>
                  <span className="p2-list-title">{ticket.subject || ticket.title}</span>
                  <span className="p2-list-desc">{ticket.description}</span>
                  <span className="p2-list-meta">
                    <span><User size={13} /> {ticket.farmerName || ticket.reporter}</span>
                    <span><Clock size={13} /> {new Date(ticket.createdAt || ticket.createdDate).toLocaleDateString('en-IN')}</span>
                  </span>
                  {ticket.orderId && (
                    <span className="p2-list-assigned p2-list-order">Order: {ticket.orderId}</span>
                  )}
                  {ticket.assignedToName && ticket.assignedToName !== 'Unassigned' && (
                    <span className="p2-list-assigned">
                      <UserCheck size={12} /> Assigned: {ticket.assignedToName}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Ticket Details Panel */}
        {selectedTicket ? (
          <div className="p2-card p2-thread">
            <div className="p2-thread-head">
              <div className="p2-thread-ids">
                <span className="p2-thread-id">{selectedTicket.id}</span>
                {selectedTicket.orderId && <span className="p2-chip p2-chip--line">Order: {selectedTicket.orderId}</span>}
                <span className={`p2-chip ${statusChip(selectedTicket.status)}`}>{(selectedTicket.status || 'PENDING').toUpperCase()}</span>
              </div>
              <h2>{selectedTicket.subject || selectedTicket.title}</h2>

              <dl className="p2-meta-grid">
                <div>
                  <dt>Reporter</dt>
                  <dd>{selectedTicket.farmerName || selectedTicket.reporter}</dd>
                  <a href={`tel:+91${selectedTicket.phone || selectedTicket.reporterMobile}`} className="p2-link" style={{ fontSize: '0.8rem' }}>📱 {selectedTicket.phone || selectedTicket.reporterMobile}</a>
                </div>
                <div>
                  <dt>Category</dt>
                  <dd>{selectedTicket.category}</dd>
                </div>
              </dl>
            </div>

            <div className="p2-detail-pad p2-stack">
              {/* ASSIGN TO EMPLOYEE (Admin Action) */}
              <div className="p2-form-box">
                <div className="p2-label p2-inline-icon" style={{ textTransform: 'uppercase', fontSize: '0.72rem' }}>
                  <UserCheck size={14} /> Hand to your store's staff
                </div>
                <div className="p2-hint" style={{ margin: '4px 0 10px' }}>
                  Store: <strong>{selectedTicket.storeName || 'Not assigned to a store yet'}</strong> · Currently assigned: <strong>{selectedTicket.assignedToName || 'Unassigned'}</strong>
                </div>
                {/* Own store's staff only; tickets reach a store from the Super Admin. */}
                <TicketAssignControls ticket={selectedTicket} compact onAssigned={updated => { if (updated) setSelectedTicket(updated); loadTickets() }} />
              </div>

              {/* Status Update Buttons */}
              <div>
                <div className="p2-label" style={{ textTransform: 'uppercase', fontSize: '0.72rem', marginBottom: 8 }}>
                  Update Status
                </div>
                <div className="p2-tabs p2-tabs--fill" role="group">
                  {['Pending', 'In Progress', 'Resolved', 'Rejected'].map(status => (
                    <button
                      key={status}
                      type="button"
                      className="p2-tab"
                      aria-selected={(selectedTicket.status || '').toLowerCase() === status.toLowerCase()}
                      onClick={() => handleStatusUpdate(selectedTicket.id, status)}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              {/* Discussion Thread */}
              <div>
                <div className="p2-label" style={{ textTransform: 'uppercase', fontSize: '0.72rem', marginBottom: 8 }}>
                  Message Thread
                </div>
                <div className="p2-messages p2-messages--compact">
                  {selectedTicket.replies?.map((rep, idx) => (
                    rep.senderRole === 'system' ? (
                      <div key={rep.id || idx} className="p2-sys">{rep.text} · {rep.time}</div>
                    ) : (
                      <div key={rep.id || idx} className={`p2-msg${rep.senderRole === 'farmer' ? '' : ' p2-msg--me'}`}>
                        <div className="p2-msg-who"><strong>{rep.senderName}</strong><span>· {rep.time}</span></div>
                        <div className="p2-bubble">{rep.text}</div>
                      </div>
                    )
                  ))}
                </div>

                <form onSubmit={handleAddReply} className="p2-reply p2-reply--flat">
                  <input
                    type="text"
                    className="p2-input"
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Reply as Admin..."
                  />
                  <button type="submit" className="p2-btn p2-btn--primary" disabled={submittingReply || !replyText.trim()}>
                    <Send size={15} /> Send
                  </button>
                </form>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
