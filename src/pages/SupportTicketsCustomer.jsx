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
        return <span className="p2-chip p2-chip--green"><CheckCircle2 size={12} /> Resolved</span>
      case 'in progress':
        return <span className="p2-chip p2-chip--blue"><RefreshCw size={12} /> In Progress</span>
      case 'pending':
      case 'open':
      default:
        return <span className="p2-chip p2-chip--amber"><Clock size={12} /> Open</span>
    }
  }

  const getPriorityBadge = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'urgent':
      case 'high':
        return <span className="p2-chip p2-chip--red">HIGH</span>
      case 'medium':
        return <span className="p2-chip p2-chip--amber">MEDIUM</span>
      default:
        return <span className="p2-chip">LOW</span>
    }
  }

  const assigned = selectedTicket?.assignedToName && selectedTicket.assignedToName !== 'Unassigned'

  return (
    <div className="p2-page">
      {/* Hero */}
      <section className="p2-hero p2-hero--row">
        <Ticket className="p2-hero-art" aria-hidden="true" />
        <div className="p2-hero-inner">
          <div className="p2-hero-copy">
            <Link to="/orders" className="p2-hero-back">
              <ArrowLeft size={16} /> Back to Orders
            </Link>
            <h1 className="p2-hero-title">Order Support Tickets</h1>
            <p className="p2-hero-text">
              Raise issues for any previous order with no time limit. Direct resolution overseen by Super Admin &amp; Agronomy Experts.
            </p>
          </div>
          <div className="p2-hero-actions">
            <button type="button" className="p2-btn p2-btn--light" onClick={() => setShowModal(true)}>
              <PlusCircle size={18} /> Raise Support Ticket
            </button>
          </div>
        </div>
      </section>

      {/* Info Banner */}
      <div className="p2-note">
        <div className="p2-note-body">
          <div className="p2-note-icon"><LifeBuoy size={20} /></div>
          <div>
            <strong>No Expiry or Time Limit on Order Queries</strong>
            <p>
              Whether your order was delivered yesterday or months ago, our team investigates quality, delivery, and dosage questions thoroughly.
            </p>
          </div>
        </div>
        <Link to="/agronomy-experts" className="p2-btn p2-btn--outline p2-btn--sm">
          <Sparkles size={14} /> Need Field Expert Callback?
        </Link>
      </div>

      {/* Main Grid: Ticket List + Selected Ticket Thread */}
      <div className="p2-split">
        {/* Left Column: Tickets Queue */}
        <div className="p2-card p2-queue">
          <div className="p2-queue-head">
            <div className="p2-tabs p2-tabs--fill" role="tablist">
              {[
                { key: 'all', label: 'All' },
                { key: 'open', label: 'Open' },
                { key: 'progress', label: 'In Progress' },
                { key: 'resolved', label: 'Resolved' }
              ].map(f => (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={activeFilter === f.key}
                  className="p2-tab"
                  onClick={() => setActiveFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="p2-search">
              <Search size={16} />
              <input
                type="text"
                className="p2-input"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search ticket ID, order ID, or topic..."
              />
            </div>
          </div>

          {/* Ticket Cards List */}
          <div className="p2-queue-list">
            {loading ? (
              <div className="p2-loading">Loading your tickets...</div>
            ) : filtered.length === 0 ? (
              <div className="p2-empty">
                <div className="p2-empty-icon"><Ticket size={28} /></div>
                <h4>No support tickets found</h4>
                <p>
                  {search ? 'Try adjusting your search criteria' : 'You have not raised any support requests yet.'}
                </p>
                <button type="button" className="p2-btn p2-btn--primary p2-btn--sm" onClick={() => setShowModal(true)}>
                  Raise Ticket for an Order
                </button>
              </div>
            ) : (
              filtered.map(t => (
                <button
                  key={t.id}
                  type="button"
                  className="p2-list-item"
                  aria-current={selectedTicket?.id === t.id}
                  onClick={() => setSelectedTicket(t)}
                >
                  <span className="p2-list-top">
                    <span className="p2-list-id">{t.id}</span>
                    <span className="p2-list-chips">
                      {getPriorityBadge(t.priority)}
                      {getStatusBadge(t.status)}
                    </span>
                  </span>
                  <span className="p2-list-title">{t.subject}</span>
                  <span className="p2-list-meta">
                    <span><FileText size={13} /> {t.category}</span>
                    <span><Calendar size={13} /> {new Date(t.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                  </span>
                  {t.orderId && (
                    <span className="p2-list-assigned p2-list-order">
                      <Package size={12} /> {t.orderId}
                    </span>
                  )}
                  {t.assignedToName && t.assignedToName !== 'Unassigned' && (
                    <span className="p2-list-assigned">
                      <User size={12} /> Assigned: <strong>{t.assignedToName}</strong>
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Selected Ticket Details & Conversation */}
        <div className="p2-card p2-thread">
          {selectedTicket ? (
            <div>
              {/* Ticket Details Header */}
              <div className="p2-thread-head">
                <div className="p2-thread-top">
                  <div>
                    <div className="p2-thread-ids">
                      <span className="p2-thread-id">{selectedTicket.id}</span>
                      {selectedTicket.orderId && (
                        <span className="p2-chip p2-chip--line">Order #{selectedTicket.orderId}</span>
                      )}
                      {getPriorityBadge(selectedTicket.priority)}
                    </div>
                    <h2>{selectedTicket.subject}</h2>
                  </div>

                  <div className="p2-thread-status">
                    {getStatusBadge(selectedTicket.status)}
                    <span>
                      Opened {new Date(selectedTicket.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>

                {/* Meta details strip */}
                <dl className="p2-meta-grid">
                  <div>
                    <dt>Category</dt>
                    <dd>{selectedTicket.category}</dd>
                  </div>
                  <div>
                    <dt>Crop Involved</dt>
                    <dd>{selectedTicket.crop || 'General Farm'}</dd>
                  </div>
                  <div>
                    <dt>Handled By</dt>
                    <dd className={assigned ? 'is-assigned' : 'is-pending'}>
                      {assigned ? `${selectedTicket.assignedToName} (${selectedTicket.assignedRole || 'Staff'})` : 'Super Admin Triage Desk'}
                    </dd>
                  </div>
                  {selectedTicket.resolvedAt && (
                    <div>
                      <dt>Resolution Date</dt>
                      <dd className="is-done">{new Date(selectedTicket.resolvedAt).toLocaleDateString('en-IN')}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Conversation Messages Thread */}
              <div className="p2-messages">
                <div className="p2-messages-label">
                  — Conversation History &amp; Support Updates —
                </div>

                {selectedTicket.replies?.map((reply, i) => {
                  const isFarmer = reply.senderRole === 'farmer'
                  if (reply.senderRole === 'system') {
                    return (
                      <div key={reply.id || i} className="p2-sys">
                        🔔 {reply.text} · {reply.time}
                      </div>
                    )
                  }
                  return (
                    <div key={reply.id || i} className={`p2-msg${isFarmer ? ' p2-msg--me' : ''}`}>
                      <div className="p2-msg-who">
                        <strong>{isFarmer ? 'You (Customer)' : `👨‍🌾 ${reply.senderName}`}</strong>
                        <span>· {reply.time}</span>
                      </div>
                      <div className="p2-bubble">{reply.text}</div>
                    </div>
                  )
                })}
              </div>

              {/* Reply Box */}
              {selectedTicket.status !== 'Resolved' && selectedTicket.status !== 'Closed' ? (
                <form onSubmit={handleSendReply} className="p2-reply">
                  <textarea
                    rows={2}
                    className="p2-input"
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Type additional details, response, or question for the agronomist..."
                  />
                  <button type="submit" className="p2-btn p2-btn--primary" disabled={sendingReply || !replyText.trim()}>
                    <Send size={16} /> Send
                  </button>
                </form>
              ) : (
                <div className="p2-reply-done">
                  ✅ This support ticket has been marked as <strong>Resolved</strong>. If you still need help, feel free to raise a new ticket.
                </div>
              )}
            </div>
          ) : (
            <div className="p2-empty">
              <div className="p2-empty-icon"><MessageSquare size={28} /></div>
              <h3>Select a ticket from the left</h3>
              <p>View the full response history or message our agronomists directly.</p>
            </div>
          )}
        </div>
      </div>

      {/* Other Pages Bottom Navigation */}
      <ServicesBottomNav />

      {/* MODAL: Raise New Support Ticket */}
      {showModal && (
        <div className="p2-backdrop" onClick={() => setShowModal(false)}>
          <div className="p2-modal" role="dialog" aria-modal="true" aria-labelledby="p2-ticket-title" onClick={e => e.stopPropagation()}>
            <div className="p2-modal-head">
              <div>
                <h3 id="p2-ticket-title">🎫 Raise Order Support Ticket</h3>
                <p>Link your ticket to any past order. Super Admin and Agronomists will monitor and resolve it.</p>
              </div>
              <button type="button" className="p2-close" aria-label="Close" onClick={() => setShowModal(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmitTicket}>
              <div className="p2-modal-body">
                {/* Order selector (No time limit) */}
                <div className="p2-field">
                  <label className="p2-label">
                    Select Previous Order * (No time limit on past orders)
                  </label>
                  <select
                    className="p2-input"
                    value={newTicket.orderId}
                    onChange={e => setNewTicket(p => ({ ...p, orderId: e.target.value }))}
                    required
                  >
                    <option value="">-- Choose an Order --</option>
                    {orders.map(ord => (
                      <option key={ord.id} value={ord.id}>
                        {ord.id} — {ord.status || 'Confirmed'} (₹{Number(ord.total || 0).toLocaleString('en-IN')}) {ord.createdAt ? `· ${ord.createdAt.slice(0, 10)}` : ''}
                      </option>
                    ))}
                    <option value="OTHER-OFFLINE-ORDER">Other / Offline Counter Purchase</option>
                  </select>
                  <span className="p2-hint">
                    💡 You can raise a ticket for ANY past order, irrespective of when it was placed.
                  </span>
                </div>

                {/* Category & Priority Grid */}
                <div className="p2-grid-2">
                  <div className="p2-field">
                    <label className="p2-label">Issue Category *</label>
                    <select
                      className="p2-input"
                      value={newTicket.category}
                      onChange={e => setNewTicket(p => ({ ...p, category: e.target.value }))}
                    >
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  <div className="p2-field">
                    <label className="p2-label">Severity / Priority</label>
                    <select
                      className="p2-input"
                      value={newTicket.priority}
                      onChange={e => setNewTicket(p => ({ ...p, priority: e.target.value }))}
                    >
                      <option value="Low">Low - General query</option>
                      <option value="Medium">Medium - Standard order query</option>
                      <option value="High">High - Damaged goods or delay</option>
                      <option value="Urgent">Urgent - Crop disease outbreak / active loss</option>
                    </select>
                  </div>
                </div>

                {/* Crop */}
                <div className="p2-field">
                  <label className="p2-label">Target Crop</label>
                  <input
                    type="text"
                    className="p2-input"
                    placeholder="e.g. Paddy, Cotton, Tomato, Sugarcane"
                    value={newTicket.crop}
                    onChange={e => setNewTicket(p => ({ ...p, crop: e.target.value }))}
                  />
                </div>

                {/* Subject */}
                <div className="p2-field">
                  <label className="p2-label">Ticket Subject / Title *</label>
                  <input
                    type="text"
                    className="p2-input"
                    required
                    placeholder="e.g. Broken seal on bottle / Delivery delayed"
                    value={newTicket.subject}
                    onChange={e => setNewTicket(p => ({ ...p, subject: e.target.value }))}
                  />
                </div>

                {/* Detailed Description */}
                <div className="p2-field">
                  <label className="p2-label">Describe the Issue in Detail *</label>
                  <textarea
                    className="p2-input"
                    required
                    rows={4}
                    placeholder="Please describe symptoms, order package state, batch number if visible, or any agronomy questions..."
                    value={newTicket.description}
                    onChange={e => setNewTicket(p => ({ ...p, description: e.target.value }))}
                  />
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="p2-modal-foot">
                <button type="button" className="p2-btn p2-btn--ghost" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="p2-btn p2-btn--primary" disabled={submitting}>
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
