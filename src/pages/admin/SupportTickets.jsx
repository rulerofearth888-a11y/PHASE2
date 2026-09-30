import { useState, useEffect, useCallback } from 'react'
import { MessageSquare, Clock, User, AlertCircle, CheckCircle, Hourglass, X, UserCheck, Send, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import axios from 'axios'
import { ticketService } from '../../services/ticketService'
import { useAuth } from '../../context/AuthContext'

const DEFAULT_EMPLOYEES = [
  { id: 'USR-0003', name: 'Dr. K. Senthil Kumar', designation: 'Senior Agronomist' },
  { id: 'u6', name: 'Dr. Priya Sharma', designation: 'Agronomist & Soil Chemist' },
  { id: 'u7', name: 'Arun Kumar', designation: 'Horticulture Specialist' },
  { id: 'u3', name: 'Muthuvel K', designation: 'Quality Control Lead' }
]

export default function SupportTickets() {
  const { user } = useAuth()
  const [tickets, setTickets] = useState([])
  const [employees, setEmployees] = useState(DEFAULT_EMPLOYEES)
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Assignment & reply
  const [assigneeId, setAssigneeId] = useState('')
  const [replyText, setReplyText] = useState('')
  const [submittingReply, setSubmittingReply] = useState(false)

  // Load employees
  const loadEmployees = useCallback(async () => {
    try {
      const res = await axios.get('/api/admin/staff-profiles').catch(() => null)
      if (res?.data?.data && Array.isArray(res.data.data)) {
        const emps = res.data.data
          .filter(u => u.role === 'employee')
          .map(u => ({
            id: u.id || u._id,
            name: u.name,
            designation: u.profile?.designation || 'Operations Staff'
          }))
        if (emps.length) setEmployees(emps)
      }
    } catch {}
  }, [])

  // Load tickets
  const loadTickets = useCallback(async () => {
    setLoading(true)
    try {
      const list = await ticketService.getTickets({ role: 'admin' })
      setTickets(list)
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
  }, [selectedTicket])

  useEffect(() => {
    loadEmployees()
    loadTickets()

    const onUpdate = () => loadTickets()
    window.addEventListener('sathyam:tickets-updated', onUpdate)
    return () => window.removeEventListener('sathyam:tickets-updated', onUpdate)
  }, [loadEmployees, loadTickets])

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

  // Admin assign ticket to employee
  const handleAssignToEmployee = async () => {
    if (!selectedTicket || !assigneeId) return
    const emp = employees.find(e => e.id === assigneeId)
    if (!emp) return

    try {
      const updated = await ticketService.assignTicket(selectedTicket.id, {
        assignedToId: emp.id,
        assignedToName: emp.name,
        assignedRole: 'employee',
        assignedBy: user?.name || 'Store Admin'
      })
      toast.success(`Assigned ticket to ${emp.name}`)
      setSelectedTicket(updated)
      setAssigneeId('')
      await loadTickets()
    } catch {
      toast.error('Could not assign employee')
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
    { label: 'Total Tickets', value: tickets.length, icon: '🎫', color: 'blue' },
    { label: 'Resolved', value: tickets.filter(t => (t.status || '').toLowerCase() === 'resolved').length, icon: '✅', color: 'green' },
    { label: 'In Progress', value: tickets.filter(t => (t.status || '').toLowerCase() === 'in progress').length, icon: '⏳', color: 'yellow' },
    { label: 'Unassigned', value: tickets.filter(t => !t.assignedToId || t.assignedToName === 'Unassigned').length, icon: '⚠️', color: 'orange' },
  ]

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <div className="eyebrow">Support Center</div>
          <h1>🎫 Support Tickets &amp; Order Disputes</h1>
          <p>Monitor grievances raised from customer orders, reassign to agronomists, and track real-time resolution</p>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        {stats.map(stat => (
          <div key={stat.label} className={`stat-card ${stat.color}`}>
            <div className={`stat-icon ${stat.color}`}>{stat.icon}</div>
            <div className="stat-value">{stat.value}</div>
            <div className="stat-label">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search by ticket ID, order ID, farmer name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="form-input"
          style={{ flex: 1, minWidth: '240px' }}
        />

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="filter-select">
          <option value="all">All Status</option>
          <option value="resolved">Resolved</option>
          <option value="in-progress">In Progress</option>
          <option value="pending">Pending / Open</option>
          <option value="rejected">Rejected</option>
        </select>

        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="filter-select">
          <option value="all">All Priority</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Tickets Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedTicket ? '1fr 440px' : '1fr', gap: '20px', alignItems: 'start' }}>
        <div>
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              <h3>No tickets found</h3>
              <p>Adjust your filters or search criteria</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filtered.map(ticket => {
                const statusInfo = getStatusColor(ticket.status)
                const isSelected = selectedTicket?.id === ticket.id
                return (
                  <div
                    key={ticket.id}
                    className="card"
                    onClick={() => setSelectedTicket(ticket)}
                    style={{
                      cursor: 'pointer',
                      borderLeft: isSelected ? '4px solid var(--brand-500)' : '4px solid transparent',
                      background: isSelected ? 'rgba(94,99,255,0.05)' : 'rgba(255,255,255,0.8)',
                      padding: '16px 20px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '6px' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--brand-600)' }}>
                            {ticket.id}
                          </span>
                          {ticket.orderId && (
                            <span style={{ fontSize: '0.72rem', background: '#f1f5f9', color: '#475569', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                              Order: {ticket.orderId}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                          {ticket.subject || ticket.title}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px', lineHeight: '1.4' }}>
                          {ticket.description}
                        </div>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '0.78rem', alignItems: 'center' }}>
                          <span style={{ color: 'var(--text-muted)' }}>👤 {ticket.farmerName || ticket.reporter}</span>
                          <span style={{ color: 'var(--text-muted)' }}>📅 {new Date(ticket.createdAt || ticket.createdDate).toLocaleDateString('en-IN')}</span>
                          <span style={{ background: statusInfo.bg, color: statusInfo.color, padding: '2px 8px', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>
                            {(ticket.status || 'PENDING').toUpperCase()}
                          </span>
                          <span style={{ background: `${getPriorityColor(ticket.priority)}20`, color: getPriorityColor(ticket.priority), padding: '2px 8px', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>
                            {(ticket.priority || 'MEDIUM').toUpperCase()}
                          </span>
                          {ticket.assignedToName && ticket.assignedToName !== 'Unassigned' && (
                            <span style={{ color: '#0284c7', fontWeight: 600 }}>
                              👨‍🌾 Assigned: {ticket.assignedToName}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Ticket Details Panel */}
        {selectedTicket && (
          <div className="card" style={{ position: 'sticky', top: '100px', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
            <div className="card-header" style={{ flexDirection: 'column', alignItems: 'flex-start', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--brand-600)' }}>
                  {selectedTicket.id}
                </span>
                {selectedTicket.orderId && (
                  <span style={{ fontSize: '0.75rem', background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                    Order: {selectedTicket.orderId}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, marginTop: 4 }}>
                {selectedTicket.subject || selectedTicket.title}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Category & Reporter */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.85rem' }}>
                <div>
                  <span className="muted" style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700 }}>Reporter</span>
                  <strong>{selectedTicket.farmerName || selectedTicket.reporter}</strong>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>📱 {selectedTicket.phone || selectedTicket.reporterMobile}</div>
                </div>
                <div>
                  <span className="muted" style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700 }}>Category</span>
                  <strong>{selectedTicket.category}</strong>
                </div>
              </div>

              {/* ASSIGN TO EMPLOYEE (Admin Action) */}
              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <UserCheck size={14} /> Assign / Delegate to Employee
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 8 }}>
                  Currently Assigned: <strong>{selectedTicket.assignedToName || 'Unassigned'}</strong>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select
                    value={assigneeId}
                    onChange={e => setAssigneeId(e.target.value)}
                    style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.8rem', background: '#fff' }}
                  >
                    <option value="">-- Choose Employee --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.designation})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAssignToEmployee}
                    disabled={!assigneeId}
                    style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Assign
                  </button>
                </div>
              </div>

              {/* Status Update Buttons */}
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Update Status
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                  {['Pending', 'In Progress', 'Resolved', 'Rejected'].map(status => {
                    const isCur = (selectedTicket.status || '').toLowerCase() === status.toLowerCase()
                    return (
                      <button
                        key={status}
                        onClick={() => handleStatusUpdate(selectedTicket.id, status)}
                        style={{
                          background: isCur ? 'var(--brand-500)' : '#fff',
                          border: `1.5px solid ${isCur ? 'var(--brand-500)' : '#e2e8f0'}`,
                          color: isCur ? '#fff' : '#64748b',
                          padding: '6px 4px',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {status}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Discussion Thread */}
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Message Thread
                </div>
                <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, background: '#fafafa', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  {selectedTicket.replies?.map((rep, idx) => (
                    <div key={rep.id || idx} style={{ fontSize: '0.8rem', background: '#fff', padding: '8px 10px', borderRadius: 6, border: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', marginBottom: 2 }}>
                        <strong>{rep.senderName}</strong>
                        <span>{rep.time}</span>
                      </div>
                      <div style={{ color: '#1e293b' }}>{rep.text}</div>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleAddReply} style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <input
                    type="text"
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Reply as Admin..."
                    style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                  />
                  <button
                    type="submit"
                    disabled={submittingReply || !replyText.trim()}
                    style={{ background: 'var(--brand-600)', color: '#fff', border: 'none', borderRadius: 6, padding: '0 12px', cursor: 'pointer', fontWeight: 700 }}
                  >
                    Send
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
