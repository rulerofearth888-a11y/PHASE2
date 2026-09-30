import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import axios from 'axios'
import { toast } from 'sonner'
import {
  Ticket,
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  User,
  Package,
  Send,
  Search,
  ArrowLeft,
  LifeBuoy,
  FileText,
  Calendar,
  MessageSquare,
  Sparkles,
  RefreshCw
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ticketService } from '../services/ticketService'
import ServicesBottomNav from '../components/common/ServicesBottomNav'

const CATEGORIES = [
  'Product Quality',
  'Delivery Delay',
  'Damaged / Leaking Package',
  'Wrong Item Delivered',
  'Agronomy Advisory & Spray Doubt',
  'Billing & Refund',
  'Other Query'
]

export default function SupportTicketsCustomer() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  // Pre-selected orderId from query string (e.g. /support-tickets?orderId=SAM-ORD-8821)
  const queryParams = new URLSearchParams(location.search)
  const initialOrderId = queryParams.get('orderId') || ''

  const [tickets, setTickets] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedTicket, setSelectedTicket] = useState(null)
  const selectedTicketRef = useRef(null)

  // New ticket modal/form state
  const [showModal, setShowModal] = useState(Boolean(initialOrderId))
  const [newTicket, setNewTicket] = useState({
    orderId: initialOrderId,
    category: 'Product Quality',
    priority: 'Medium',
    crop: user?.crop || 'Paddy/Rice',
    subject: '',
    description: '',
    attachment: null
  })
  const [submitting, setSubmitting] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)

  // Load orders for the customer
  const loadOrders = useCallback(async () => {
    try {
      const res = await axios.get('/api/orders')
      setOrders(Array.isArray(res?.data?.data) ? res.data.data : [])
    } catch {
      // Ignored
    }
  }, [])

  // Keep a ref in sync with state so loadTickets can read it without being a dep
  useEffect(() => { selectedTicketRef.current = selectedTicket }, [selectedTicket])

  // Load tickets — intentionally only depends on `user`, not `selectedTicket`,
  // to avoid an infinite loop (setSelectedTicket → dep change → re-run → loop).
  const loadTickets = useCallback(async () => {
    setLoading(true)
    try {
      const list = await ticketService.getTickets({
        role: user?.role || 'farmer',
        userId: user?.id || user?._id,
        phone: user?.phone || user?.mobile
      })
      setTickets(list)
      const current = selectedTicketRef.current
      if (list.length > 0 && !current) {
        setSelectedTicket(list[0])
      } else if (current) {
        const refreshed = list.find(t => t.id === current.id)
        if (refreshed) setSelectedTicket(refreshed)
      }
    } catch {
      toast.error('Unable to fetch tickets')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadOrders()
    loadTickets()

    const handleUpdate = () => loadTickets()
    window.addEventListener('sathyam:tickets-updated', handleUpdate)
    return () => window.removeEventListener('sathyam:tickets-updated', handleUpdate)
  }, [loadOrders, loadTickets])

  // If initialOrderId came through url, prefill it
  useEffect(() => {
    if (initialOrderId) {
      setNewTicket(prev => ({ ...prev, orderId: initialOrderId }))
      setShowModal(true)
    }
  }, [initialOrderId])

  // Handle new ticket submission
  const handleSubmitTicket = async (e) => {
    e.preventDefault()
    if (!newTicket.subject.trim() || !newTicket.description.trim()) {
      toast.error('Please enter a subject and problem description')
      return
    }

    setSubmitting(true)
    try {
      const chosenOrder = orders.find(o => o.id === newTicket.orderId)
      const created = await ticketService.createTicket({
        orderId: newTicket.orderId || '',
        farmerName: user?.name || '',
        phone: user?.phone || '',
        crop: newTicket.crop,
        category: newTicket.category,
        priority: newTicket.priority,
        subject: newTicket.subject,
        description: newTicket.description,
        orderItems: chosenOrder?.items || []
      })

      toast.success(`Support Ticket ${created.id} raised successfully!`, {
        description: 'Super Admin and our Agronomy Team have been notified.'
      })

      setShowModal(false)
      setNewTicket({
        orderId: '',
        category: 'Product Quality',
        priority: 'Medium',
        crop: user?.crop || 'Paddy/Rice',
        subject: '',
        description: '',
        attachment: null
      })
      await loadTickets()
      setSelectedTicket(created)
    } catch (err) {
      toast.error('Failed to submit support ticket')
    } finally {
      setSubmitting(false)
    }
  }

  // Handle customer reply
  const handleSendReply = async (e) => {
    e.preventDefault()
    if (!replyText.trim() || !selectedTicket) return

    setSendingReply(true)
    try {
      const updated = await ticketService.addReply(selectedTicket.id, {
        senderName: user?.name || 'Farmer Customer',
        senderRole: 'farmer',
        text: replyText.trim()
      })
      setReplyText('')
      setSelectedTicket(updated)
      toast.success('Your message has been added to the ticket thread')
    } catch {
      toast.error('Could not send reply')
    } finally {
      setSendingReply(false)
    }
  }

  // Filtered tickets
  const filtered = tickets.filter(t => {
    const matchesFilter =
      activeFilter === 'all' ||
      (activeFilter === 'open' && (t.status === 'Open' || t.status === 'Pending')) ||
      (activeFilter === 'progress' && t.status === 'In Progress') ||
      (activeFilter === 'resolved' && (t.status === 'Resolved' || t.status === 'Closed'))

    const q = search.toLowerCase().trim()
    const matchesSearch =
      !q ||
      t.id.toLowerCase().includes(q) ||
      (t.orderId && t.orderId.toLowerCase().includes(q)) ||
      (t.subject && t.subject.toLowerCase().includes(q)) ||
      (t.category && t.category.toLowerCase().includes(q))

    return matchesFilter && matchesSearch
  })

  const getStatusBadge = (status) => {
    switch (status?.toLowerCase()) {
      case 'resolved':
      case 'closed':
        return <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={12} /> Resolved</span>
      case 'in progress':
        return <span className="badge badge-blue" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><RefreshCw size={12} /> In Progress</span>
      case 'pending':
      case 'open':
      default:
        return <span className="badge badge-yellow" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> Open</span>
    }
  }

  const getPriorityBadge = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'urgent':
      case 'high':
        return <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700 }}>HIGH</span>
      case 'medium':
        return <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700 }}>MEDIUM</span>
      default:
        return <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700 }}>LOW</span>
    }
  }

  return (
    <div className="sb-orders-page" style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 16px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Link to="/orders" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--brand-600)', fontSize: '0.85rem', fontWeight: 600 }}>
              <ArrowLeft size={16} /> Back to Orders
            </Link>
          </div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Ticket size={28} color="#16a34a" /> Order Support Tickets
          </h1>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: '0.9rem' }}>
            Raise issues for any previous order with no time limit. Direct resolution overseen by Super Admin &amp; Agronomy Experts.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowModal(true)}
            style={{
              background: 'linear-gradient(135deg, #16a34a, #059669)',
              color: '#fff',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              borderRadius: 8,
              fontWeight: 700,
              boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <PlusCircle size={18} /> Raise Support Ticket
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #ecfdf5, #f0fdf4)',
        border: '1px solid #bbf7d0',
        borderRadius: 12,
        padding: '14px 18px',
        marginBottom: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
            <LifeBuoy size={20} />
          </div>
          <div>
            <strong style={{ color: '#14532d', fontSize: '0.92rem' }}>No Expiry or Time Limit on Order Queries</strong>
            <div style={{ color: '#166534', fontSize: '0.82rem' }}>
              Whether your order was delivered yesterday or months ago, our team investigates quality, delivery, and dosage questions thoroughly.
            </div>
          </div>
        </div>
        <Link
          to="/agronomy-experts"
          style={{
            background: '#fff',
            color: '#16a34a',
            border: '1px solid #86efac',
            padding: '6px 14px',
            borderRadius: 20,
            fontSize: '0.8rem',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <Sparkles size={14} /> Need Field Expert Callback?
        </Link>
      </div>

      {/* Main Grid: Ticket List + Selected Ticket Thread */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 24, alignItems: 'start' }}>
        {/* Left Column: Tickets Queue */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          {/* Filters & Search */}
          <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {[
                { key: 'all', label: 'All' },
                { key: 'open', label: 'Open' },
                { key: 'progress', label: 'In Progress' },
                { key: 'resolved', label: 'Resolved' }
              ].map(f => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setActiveFilter(f.key)}
                  style={{
                    flex: 1,
                    padding: '6px 0',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    background: activeFilter === f.key ? '#16a34a' : '#f1f5f9',
                    color: activeFilter === f.key ? '#fff' : '#64748b',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search ticket ID, order ID, or topic..."
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 32px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: '0.82rem'
                }}
              />
            </div>
          </div>

          {/* Ticket Cards List */}
          <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>Loading your tickets...</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <Ticket size={36} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
                <h4 style={{ margin: '0 0 6px', color: '#475569' }}>No support tickets found</h4>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#94a3b8' }}>
                  {search ? 'Try adjusting your search criteria' : 'You have not raised any support requests yet.'}
                </p>
                <button
                  type="button"
                  onClick={() => setShowModal(true)}
                  style={{
                    marginTop: 14,
                    background: '#16a34a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 16px',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Raise Ticket for an Order
                </button>
              </div>
            ) : (
              filtered.map(t => {
                const isSelected = selectedTicket?.id === t.id
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTicket(t)}
                    style={{
                      padding: '14px 16px',
                      borderBottom: '1px solid #f1f5f9',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(22, 163, 74, 0.06)' : '#fff',
                      borderLeft: isSelected ? '4px solid #16a34a' : '4px solid transparent',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <strong style={{ color: '#16a34a', fontSize: '0.85rem' }}>{t.id}</strong>
                        {t.orderId && (
                          <span style={{ fontSize: '0.72rem', background: '#f1f5f9', color: '#475569', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                            {t.orderId}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {getPriorityBadge(t.priority)}
                        {getStatusBadge(t.status)}
                      </div>
                    </div>

                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.subject}
                    </div>

                    <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>📂 {t.category}</span>
                      <span>📅 {new Date(t.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                    </div>

                    {t.assignedToName && t.assignedToName !== 'Unassigned' && (
                      <div style={{ marginTop: 6, fontSize: '0.74rem', color: '#0369a1', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <User size={12} /> Assigned: <strong>{t.assignedToName}</strong>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right Column: Selected Ticket Details & Conversation */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          {selectedTicket ? (
            <div>
              {/* Ticket Details Header */}
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#16a34a' }}>{selectedTicket.id}</span>
                      {selectedTicket.orderId && (
                        <span style={{ fontSize: '0.8rem', background: '#e2e8f0', color: '#334155', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                          Order #{selectedTicket.orderId}
                        </span>
                      )}
                      {getPriorityBadge(selectedTicket.priority)}
                    </div>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                      {selectedTicket.subject}
                    </h2>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    {getStatusBadge(selectedTicket.status)}
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 4 }}>
                      Opened {new Date(selectedTicket.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                </div>

                {/* Meta details strip */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 14, padding: '12px 14px', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.82rem' }}>
                  <div>
                    <span className="muted" style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700 }}>Category</span>
                    <strong>{selectedTicket.category}</strong>
                  </div>
                  <div>
                    <span className="muted" style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700 }}>Crop Involved</span>
                    <strong>{selectedTicket.crop || 'General Farm'}</strong>
                  </div>
                  <div>
                    <span className="muted" style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700 }}>Handled By</span>
                    <strong style={{ color: selectedTicket.assignedToName && selectedTicket.assignedToName !== 'Unassigned' ? '#0284c7' : '#94a3b8' }}>
                      {selectedTicket.assignedToName && selectedTicket.assignedToName !== 'Unassigned' ? `${selectedTicket.assignedToName} (${selectedTicket.assignedRole || 'Staff'})` : 'Super Admin Triage Desk'}
                    </strong>
                  </div>
                  {selectedTicket.resolvedAt && (
                    <div>
                      <span className="muted" style={{ display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700 }}>Resolution Date</span>
                      <strong style={{ color: '#16a34a' }}>{new Date(selectedTicket.resolvedAt).toLocaleDateString('en-IN')}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Conversation Messages Thread */}
              <div style={{ padding: '24px', maxHeight: '420px', overflowY: 'auto', background: '#fafafa', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontSize: '0.78rem', textAlign: 'center', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
                  — Conversation History &amp; Support Updates —
                </div>

                {selectedTicket.replies?.map((reply, i) => {
                  const isFarmer = reply.senderRole === 'farmer'
                  const isSystem = reply.senderRole === 'system'

                  if (isSystem) {
                    return (
                      <div key={reply.id || i} style={{ textAlign: 'center', margin: '4px 0' }}>
                        <span style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.75rem', padding: '4px 12px', borderRadius: 20 }}>
                          🔔 {reply.text} · {reply.time}
                        </span>
                      </div>
                    )
                  }

                  return (
                    <div
                      key={reply.id || i}
                      style={{
                        alignSelf: isFarmer ? 'flex-end' : 'flex-start',
                        maxWidth: '82%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: isFarmer ? 'flex-end' : 'flex-start'
                      }}
                    >
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <strong>{isFarmer ? 'You (Customer)' : `👨‍🌾 ${reply.senderName}`}</strong>
                        <span>· {reply.time}</span>
                      </div>
                      <div
                        style={{
                          background: isFarmer ? '#16a34a' : '#fff',
                          color: isFarmer ? '#fff' : '#1e293b',
                          padding: '12px 16px',
                          borderRadius: isFarmer ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                          border: isFarmer ? 'none' : '1px solid #e2e8f0',
                          fontSize: '0.88rem',
                          lineHeight: 1.5,
                          whiteSpace: 'pre-wrap'
                        }}
                      >
                        {reply.text}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Reply Box */}
              {selectedTicket.status !== 'Resolved' && selectedTicket.status !== 'Closed' ? (
                <form onSubmit={handleSendReply} style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', background: '#fff', display: 'flex', gap: 10 }}>
                  <textarea
                    rows={2}
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Type additional details, response, or question for the agronomist..."
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: '0.88rem',
                      fontFamily: 'inherit',
                      resize: 'none'
                    }}
                  />
                  <button
                    type="submit"
                    disabled={sendingReply || !replyText.trim()}
                    style={{
                      background: '#16a34a',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '0 20px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      opacity: !replyText.trim() ? 0.6 : 1
                    }}
                  >
                    <Send size={16} /> Send
                  </button>
                </form>
              ) : (
                <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                  ✅ This support ticket has been marked as <strong>Resolved</strong>. If you still need help, feel free to raise a new ticket.
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
              <LifeBuoy size={48} color="#cbd5e1" style={{ margin: '0 auto 16px' }} />
              <h3>Select a ticket from the left</h3>
              <p style={{ fontSize: '0.85rem' }}>View the full response history or message our agronomists directly.</p>
            </div>
          )}
        </div>
      </div>

      {/* Other Pages Bottom Navigation */}
      <ServicesBottomNav />

      {/* MODAL: Raise New Support Ticket */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 16,
              maxWidth: 640,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
              padding: '24px 28px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                  🎫 Raise Order Support Ticket
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                  Link your ticket to any past order. Super Admin and Agronomists will monitor and resolve it.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmitTicket}>
              {/* Order selector (No time limit) */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Select Previous Order * (No time limit on past orders)
                </label>
                <select
                  value={newTicket.orderId}
                  onChange={e => setNewTicket(p => ({ ...p, orderId: e.target.value }))}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                >
                  <option value="">-- Choose an Order --</option>
                  {orders.map(ord => (
                    <option key={ord.id} value={ord.id}>
                      {ord.id} — {ord.status || 'Confirmed'} (₹{Number(ord.total || 0).toLocaleString('en-IN')}) {ord.createdAt ? `· ${ord.createdAt.slice(0, 10)}` : ''}
                    </option>
                  ))}
                  <option value="OTHER-OFFLINE-ORDER">Other / Offline Counter Purchase</option>
                </select>
                <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 4 }}>
                  💡 You can raise a ticket for ANY past order, irrespective of when it was placed.
                </div>
              </div>

              {/* Category & Priority Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    Issue Category *
                  </label>
                  <select
                    value={newTicket.category}
                    onChange={e => setNewTicket(p => ({ ...p, category: e.target.value }))}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                    Severity / Priority
                  </label>
                  <select
                    value={newTicket.priority}
                    onChange={e => setNewTicket(p => ({ ...p, priority: e.target.value }))}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                  >
                    <option value="Low">Low - General query</option>
                    <option value="Medium">Medium - Standard order query</option>
                    <option value="High">High - Damaged goods or delay</option>
                    <option value="Urgent">Urgent - Crop disease outbreak / active loss</option>
                  </select>
                </div>
              </div>

              {/* Crop & Area */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Target Crop
                </label>
                <input
                  type="text"
                  placeholder="e.g. Paddy, Cotton, Tomato, Sugarcane"
                  value={newTicket.crop}
                  onChange={e => setNewTicket(p => ({ ...p, crop: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                />
              </div>

              {/* Subject */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Ticket Subject / Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Broken seal on BlastShield bottle / Delivery delayed"
                  value={newTicket.subject}
                  onChange={e => setNewTicket(p => ({ ...p, subject: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                />
              </div>

              {/* Detailed Description */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Describe the Issue in Detail *
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Please describe symptoms, order package state, batch number if visible, or any agronomy questions..."
                  value={newTicket.description}
                  onChange={e => setNewTicket(p => ({ ...p, description: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.88rem', fontFamily: 'inherit' }}
                />
              </div>

              {/* Modal Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    background: 'linear-gradient(135deg, #16a34a, #059669)',
                    color: '#fff',
                    padding: '10px 24px',
                    borderRadius: 8,
                    border: 'none',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(22, 163, 74, 0.25)'
                  }}
                >
                  {submitting ? 'Submitting...' : 'Submit Support Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
