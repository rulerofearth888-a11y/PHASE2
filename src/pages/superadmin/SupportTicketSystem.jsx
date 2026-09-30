import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { toast } from 'sonner'
import {
  Ticket,
  Search,
  Filter,
  UserCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Send,
  User,
  ShieldAlert,
  Building,
  RefreshCw,
  Phone,
  Mail,
  Package,
  Calendar,
  Layers,
  ChevronDown
} from 'lucide-react'
import { ticketService } from '../../services/ticketService'
import { useAuth } from '../../context/AuthContext'

// Fallback staff list if API is unreachable
const DEFAULT_STAFF = [
  { id: 'USR-0002', name: 'Store Admin - Coimbatore HQ', role: 'admin', designation: 'General Store Admin' },
  { id: 'USR-0004', name: 'Branch Admin - Madurai', role: 'admin', designation: 'Regional Admin' },
  { id: 'USR-0003', name: 'Dr. K. Senthil Kumar', role: 'employee', designation: 'Senior Agronomist (Plant Pathology)' },
  { id: 'u6', name: 'Dr. Priya Sharma', role: 'employee', designation: 'Agronomist & Soil Chemist' },
  { id: 'u7', name: 'Arun Kumar', role: 'employee', designation: 'Horticulture & Fertigation Specialist' },
  { id: 'u3', name: 'Muthuvel K', role: 'employee', designation: 'Quality Control Lead' }
]

export default function SupportTicketSystem() {
  const { user } = useAuth()
  const [tickets, setTickets] = useState([])
  const [staffList, setStaffList] = useState(DEFAULT_STAFF)
  const [loading, setLoading] = useState(true)
  const [selectedTicket, setSelectedTicket] = useState(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [search, setSearch] = useState('')

  // Assignment Modal / Controls
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [assigning, setAssigning] = useState(false)

  // Reply state
  const [adminReply, setAdminReply] = useState('')
  const [sendingReply, setSendingReply] = useState(false)

  // Load staff profiles from backend
  const loadStaff = useCallback(async () => {
    try {
      const res = await axios.get('/api/admin/staff-profiles').catch(() => null)
      if (res?.data?.data && Array.isArray(res.data.data) && res.data.data.length > 0) {
        const mapped = res.data.data.map(s => ({
          id: s.id || s._id,
          name: s.name,
          role: s.role,
          designation: s.profile?.designation || (s.role === 'admin' ? 'Store Administrator' : 'Operations Employee')
        }))
        setStaffList(mapped)
      }
    } catch {}
  }, [])

  // Load tickets
  const loadTickets = useCallback(async () => {
    setLoading(true)
    try {
      const list = await ticketService.getTickets({ role: 'superadmin' })
      setTickets(list)
      if (list.length > 0 && !selectedTicket) {
        setSelectedTicket(list[0])
      } else if (selectedTicket) {
        const refreshed = list.find(t => t.id === selectedTicket.id)
        if (refreshed) setSelectedTicket(refreshed)
      }
    } catch (err) {
      toast.error('Failed to load support tickets')
    } finally {
      setLoading(false)
    }
  }, [selectedTicket])

  useEffect(() => {
    loadStaff()
    loadTickets()

    const handleUpdate = () => loadTickets()
    window.addEventListener('sathyam:tickets-updated', handleUpdate)
    return () => window.removeEventListener('sathyam:tickets-updated', handleUpdate)
  }, [loadStaff, loadTickets])

  // Perform Assignment
  const handleAssignTicket = async () => {
    if (!selectedTicket || !selectedStaffId) {
      toast.error('Please select a staff member to assign this ticket')
      return
    }

    const targetStaff = staffList.find(s => s.id === selectedStaffId)
    if (!targetStaff) return

    setAssigning(true)
    try {
      const updated = await ticketService.assignTicket(selectedTicket.id, {
        assignedToId: targetStaff.id,
        assignedToName: targetStaff.name,
        assignedRole: targetStaff.role,
        assignedBy: 'Super Admin'
      })

      toast.success(`Ticket ${selectedTicket.id} assigned to ${targetStaff.name} (${targetStaff.role})!`, {
        description: `This ticket will now be monitored by ${targetStaff.name} and store admins.`
      })

      setSelectedTicket(updated)
      setShowAssignModal(false)
      setSelectedStaffId('')
      await loadTickets()
    } catch {
      toast.error('Failed to assign ticket')
    } finally {
      setAssigning(false)
    }
  }

  // Update Status
  const handleStatusChange = async (newStatus) => {
    if (!selectedTicket) return
    try {
      const updated = await ticketService.updateTicketStatus(selectedTicket.id, newStatus, 'Super Admin')
      toast.success(`Status updated to ${newStatus}`)
      setSelectedTicket(updated)
      await loadTickets()
    } catch {
      toast.error('Could not update status')
    }
  }

  // Reply as Super Admin
  const handleSendReply = async (e) => {
    e.preventDefault()
    if (!adminReply.trim() || !selectedTicket) return

    setSendingReply(true)
    try {
      const updated = await ticketService.addReply(selectedTicket.id, {
        senderName: 'Super Admin Executive Desk',
        senderRole: 'superadmin',
        text: adminReply.trim()
      })
      setAdminReply('')
      setSelectedTicket(updated)
      toast.success('Reply broadcasted to ticket thread')
    } catch {
      toast.error('Failed to send reply')
    } finally {
      setSendingReply(false)
    }
  }

  // Computed KPI Metrics
  const totalCount = tickets.length
  const openCount = tickets.filter(t => t.status === 'Open' || t.status === 'Pending').length
  const progressCount = tickets.filter(t => t.status === 'In Progress').length
  const resolvedCount = tickets.filter(t => t.status === 'Resolved' || t.status === 'Closed').length
  const unassignedCount = tickets.filter(t => !t.assignedToId || t.assignedToName === 'Unassigned').length
  const urgentCount = tickets.filter(t => t.priority === 'Urgent' || t.priority === 'High').length

  // Filtered tickets
  const filteredTickets = tickets.filter(t => {
    // Status
    if (statusFilter !== 'all') {
      if (statusFilter === 'open' && t.status !== 'Open' && t.status !== 'Pending') return false
      if (statusFilter === 'progress' && t.status !== 'In Progress') return false
      if (statusFilter === 'resolved' && t.status !== 'Resolved' && t.status !== 'Closed') return false
    }

    // Priority
    if (priorityFilter !== 'all' && t.priority?.toLowerCase() !== priorityFilter.toLowerCase()) return false

    // Assignee
    if (assigneeFilter === 'unassigned') {
      if (t.assignedToId && t.assignedToName !== 'Unassigned') return false
    } else if (assigneeFilter === 'admin') {
      if (t.assignedRole !== 'admin') return false
    } else if (assigneeFilter === 'employee') {
      if (t.assignedRole !== 'employee') return false
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      const match =
        t.id.toLowerCase().includes(q) ||
        (t.orderId && t.orderId.toLowerCase().includes(q)) ||
        (t.farmerName && t.farmerName.toLowerCase().includes(q)) ||
        (t.phone && t.phone.includes(q)) ||
        (t.subject && t.subject.toLowerCase().includes(q)) ||
        (t.category && t.category.toLowerCase().includes(q)) ||
        (t.assignedToName && t.assignedToName.toLowerCase().includes(q))
      if (!match) return false
    }

    return true
  })

  return (
    <div className="animate-fade-in" style={{ padding: '4px 0 32px' }}>
      {/* Top Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626', fontWeight: 700 }}>
            <ShieldAlert size={14} /> ENTERPRISE SURVEILLANCE &amp; SUPPORT
          </div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '4px 0', color: '#0f172a' }}>
            🎫 Central Support Ticket System
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>
            Real-time monitoring of all customer order grievances, quality issues, and agronomic advisory tickets. Direct Super Admin assignment to Admins &amp; Employees.
          </p>
        </div>

        <button
          type="button"
          onClick={loadTickets}
          className="btn btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Live Feed
        </button>
      </div>

      {/* KPI Monitoring Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Tickets</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>{totalCount}</div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>All-time customer requests</div>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 12, border: '1px solid #fecdd3', borderLeft: '4px solid #f43f5e', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#e11d48', textTransform: 'uppercase' }}>Unassigned Tickets</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#e11d48', margin: '4px 0' }}>{unassignedCount}</div>
          <div style={{ fontSize: '0.75rem', color: '#f43f5e' }}>Require Super Admin delegation</div>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 12, border: '1px solid #fed7aa', borderLeft: '4px solid #f97316', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#c2410c', textTransform: 'uppercase' }}>Open / Pending</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ea580c', margin: '4px 0' }}>{openCount}</div>
          <div style={{ fontSize: '0.75rem', color: '#9a3412' }}>Awaiting initial triage</div>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 12, border: '1px solid #bfdbfe', borderLeft: '4px solid #3b82f6', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase' }}>In Progress</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#2563eb', margin: '4px 0' }}>{progressCount}</div>
          <div style={{ fontSize: '0.75rem', color: '#1e40af' }}>Under active staff handling</div>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 12, border: '1px solid #bbf7d0', borderLeft: '4px solid #22c55e', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase' }}>Resolved &amp; Closed</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#16a34a', margin: '4px 0' }}>{resolvedCount}</div>
          <div style={{ fontSize: '0.75rem', color: '#166534' }}>{totalCount ? Math.round((resolvedCount / totalCount) * 100) : 0}% resolution rate</div>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 12, border: '1px solid #fed7aa', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase' }}>High &amp; Urgent Priority</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#d97706', margin: '4px 0' }}>{urgentCount}</div>
          <div style={{ fontSize: '0.75rem', color: '#b45309' }}>Requires rapid escalation</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20, background: '#fff', padding: '14px 18px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <Search size={16} style={{ position: 'absolute', left: 10, top: 11, color: '#94a3b8' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by ticket ID, order ID, farmer name, mobile..."
            style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
          />
        </div>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem', background: '#fff', minWidth: 140 }}
        >
          <option value="all">All Statuses</option>
          <option value="open">Open / Pending</option>
          <option value="progress">In Progress</option>
          <option value="resolved">Resolved / Closed</option>
        </select>

        <select
          value={priorityFilter}
          onChange={e => setPriorityFilter(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem', background: '#fff', minWidth: 140 }}
        >
          <option value="all">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <select
          value={assigneeFilter}
          onChange={e => setAssigneeFilter(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem', background: '#fff', minWidth: 170 }}
        >
          <option value="all">All Assignments</option>
          <option value="unassigned">⚠️ Unassigned Only</option>
          <option value="admin">Assigned to Admin</option>
          <option value="employee">Assigned to Employee</option>
        </select>
      </div>

      {/* Main Content Grid: Tickets Table / Queue + Inspection Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedTicket ? '1fr 450px' : '1fr', gap: 20, alignItems: 'start' }}>
        {/* Tickets Table Card */}
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.95rem', color: '#1e293b' }}>
              Support Queue ({filteredTickets.length} tickets)
            </strong>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
              Super Admin View: Company-Wide Visibility
            </span>
          </div>

          {filteredTickets.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
              <Ticket size={40} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ margin: 0, color: '#475569' }}>No tickets match your filter criteria</h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>Adjust search or filters above</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '12px 16px' }}>Ticket &amp; Order</th>
                    <th style={{ padding: '12px 16px' }}>Reporter / Farmer</th>
                    <th style={{ padding: '12px 16px' }}>Subject &amp; Category</th>
                    <th style={{ padding: '12px 16px' }}>Priority</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                    <th style={{ padding: '12px 16px' }}>Assigned To</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map(t => {
                    const isSelected = selectedTicket?.id === t.id
                    const isUnassigned = !t.assignedToId || t.assignedToName === 'Unassigned'

                    return (
                      <tr
                        key={t.id}
                        onClick={() => setSelectedTicket(t)}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: isSelected ? 'rgba(94, 99, 255, 0.06)' : isUnassigned ? '#fff9f9' : '#fff',
                          cursor: 'pointer',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <strong style={{ color: '#5e63ff', display: 'block' }}>{t.id}</strong>
                          {t.orderId && (
                            <span style={{ fontSize: '0.72rem', background: '#f1f5f9', color: '#475569', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                              {t.orderId}
                            </span>
                          )}
                        </td>

                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600, color: '#1e293b' }}>{t.farmerName}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>📱 {t.phone || '—'}</div>
                        </td>

                        <td style={{ padding: '12px 16px', maxWidth: 220 }}>
                          <div style={{ fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {t.subject}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {t.category} {t.crop ? `· ${t.crop}` : ''}
                          </div>
                        </td>

                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            background: t.priority === 'Urgent' || t.priority === 'High' ? '#fee2e2' : t.priority === 'Medium' ? '#fef3c7' : '#f1f5f9',
                            color: t.priority === 'Urgent' || t.priority === 'High' ? '#b91c1c' : t.priority === 'Medium' ? '#b45309' : '#475569'
                          }}>
                            {t.priority?.toUpperCase()}
                          </span>
                        </td>

                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            background: t.status === 'Resolved' ? '#dcfce7' : t.status === 'In Progress' ? '#dbeafe' : '#fef9c3',
                            color: t.status === 'Resolved' ? '#15803d' : t.status === 'In Progress' ? '#1d4ed8' : '#a16207'
                          }}>
                            {t.status?.toUpperCase()}
                          </span>
                        </td>

                        <td style={{ padding: '12px 16px' }}>
                          {isUnassigned ? (
                            <span style={{ color: '#e11d48', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, background: '#ffe4e6', padding: '2px 8px', borderRadius: 4 }}>
                              ⚠️ Unassigned
                            </span>
                          ) : (
                            <div>
                              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0369a1' }}>
                                {t.assignedToName}
                              </div>
                              <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'capitalize' }}>
                                ({t.assignedRole})
                              </span>
                            </div>
                          )}
                        </td>

                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedTicket(t)
                              setShowAssignModal(true)
                            }}
                            style={{
                              background: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              borderRadius: 6,
                              padding: '5px 10px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              color: '#334155',
                              cursor: 'pointer'
                            }}
                          >
                            Assign ▾
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Column: Ticket Inspection & Super Admin Action Console */}
        {selectedTicket && (
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', position: 'sticky', top: 90, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#5e63ff' }}>
                  {selectedTicket.id}
                </span>
                <span style={{ fontSize: '0.75rem', background: '#e2e8f0', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                  Order: {selectedTicket.orderId || 'Direct'}
                </span>
              </div>
              <h3 style={{ margin: '0 0 6px', fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                {selectedTicket.subject}
              </h3>
              <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                Raised by <strong>{selectedTicket.farmerName}</strong> (📱 {selectedTicket.phone})
              </div>
            </div>

            {/* SUPER ADMIN ASSIGNMENT BOX */}
            <div style={{ padding: '16px 20px', background: 'linear-gradient(135deg, #f5f3ff, #faf5ff)', borderBottom: '1px solid #e9d5ff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <UserCheck size={16} /> Super Admin Delegation
                </div>
                {selectedTicket.assignedToName && selectedTicket.assignedToName !== 'Unassigned' && (
                  <span style={{ fontSize: '0.75rem', background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                    Active Assignment
                  </span>
                )}
              </div>

              <div style={{ fontSize: '0.82rem', color: '#4b5563', marginBottom: 12 }}>
                Current Handler:{' '}
                <strong>
                  {selectedTicket.assignedToName && selectedTicket.assignedToName !== 'Unassigned'
                    ? `${selectedTicket.assignedToName} (${selectedTicket.assignedRole?.toUpperCase()})`
                    : 'Not assigned to any staff member'}
                </strong>
              </div>

              {/* Assignment Form Controls */}
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={selectedStaffId}
                  onChange={e => setSelectedStaffId(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid #c084fc',
                    fontSize: '0.82rem',
                    background: '#fff'
                  }}
                >
                  <option value="">-- Choose Admin or Employee --</option>
                  <optgroup label="Store Administrators">
                    {staffList.filter(s => s.role === 'admin').map(s => (
                      <option key={s.id} value={s.id}>
                        👑 {s.name} ({s.designation})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Agronomy & Operations Employees">
                    {staffList.filter(s => s.role === 'employee').map(s => (
                      <option key={s.id} value={s.id}>
                        👨‍🌾 {s.name} ({s.designation})
                      </option>
                    ))}
                  </optgroup>
                </select>

                <button
                  type="button"
                  onClick={handleAssignTicket}
                  disabled={!selectedStaffId || assigning}
                  style={{
                    background: '#7c3aed',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 14px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {assigning ? 'Assigning...' : 'Assign'}
                </button>
              </div>
            </div>

            {/* Quick Status Setter */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>
                Update Ticket Status
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['Pending', 'In Progress', 'Resolved', 'Closed'].map(st => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleStatusChange(st)}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      borderRadius: 6,
                      cursor: 'pointer',
                      border: selectedTicket.status === st ? '2px solid #5e63ff' : '1px solid #e2e8f0',
                      background: selectedTicket.status === st ? 'rgba(94, 99, 255, 0.1)' : '#fff',
                      color: selectedTicket.status === st ? '#5e63ff' : '#475569'
                    }}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Discussion Thread */}
            <div style={{ padding: '16px 20px', background: '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 12 }}>
                Live Message Stream ({selectedTicket.replies?.length || 0})
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 250, overflowY: 'auto' }}>
                {selectedTicket.replies?.map((rep, idx) => (
                  <div
                    key={rep.id || idx}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      fontSize: '0.82rem',
                      background: rep.senderRole === 'system' ? '#f1f5f9' : rep.senderRole === 'farmer' ? '#ecfdf5' : '#fff',
                      border: '1px solid #e2e8f0'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.72rem', color: '#64748b' }}>
                      <strong>{rep.senderName} ({rep.senderRole?.toUpperCase()})</strong>
                      <span>{rep.time}</span>
                    </div>
                    <div style={{ color: '#1e293b', whiteSpace: 'pre-wrap' }}>
                      {rep.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Super Admin Direct Message / Reply */}
            <form onSubmit={handleSendReply} style={{ padding: '14px 20px', background: '#fff', display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={adminReply}
                onChange={e => setAdminReply(e.target.value)}
                placeholder="Post reply or executive note to ticket thread..."
                style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
              />
              <button
                type="submit"
                disabled={sendingReply || !adminReply.trim()}
                style={{
                  background: '#5e63ff',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '0 14px',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer'
                }}
              >
                Send
              </button>
            </form>
          </div>
        )}
      </div>

      {/* QUICK ASSIGN MODAL */}
      {showAssignModal && selectedTicket && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16
          }}
          onClick={() => setShowAssignModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 14,
              maxWidth: 480,
              width: '100%',
              padding: '24px 24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
            }}
          >
            <h3 style={{ margin: '0 0 6px', fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
              Assign Ticket {selectedTicket.id}
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.82rem', color: '#64748b' }}>
              Select an Admin or Employee to take ownership. They will be notified and can monitor this ticket in their portal.
            </p>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                Assign to Personnel:
              </label>
              <select
                value={selectedStaffId}
                onChange={e => setSelectedStaffId(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
              >
                <option value="">-- Choose Staff Member --</option>
                <optgroup label="Admins">
                  {staffList.filter(s => s.role === 'admin').map(s => (
                    <option key={s.id} value={s.id}>
                      👑 {s.name} ({s.designation})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Employees (Agronomists &amp; QC)">
                  {staffList.filter(s => s.role === 'employee').map(s => (
                    <option key={s.id} value={s.id}>
                      👨‍🌾 {s.name} ({s.designation})
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAssignTicket}
                disabled={!selectedStaffId || assigning}
                style={{
                  background: '#7c3aed',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 18px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {assigning ? 'Confirming...' : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
