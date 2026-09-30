import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { toast } from 'sonner'
import { useAuth } from '../context/AuthContext'
import ServicesBottomNav from '../components/common/ServicesBottomNav'

// Order status for the signed-in customer; the server only ever returns their
// own orders. Replaces public/order-status.html, which now redirects here.
// Styles: index.css, "ORDER STATUS".

// Checkout queues "Order placed" (js/toast.js toast.flash) before redirecting here.
const FLASH_KEY = 'sbt-flash'

function showCarriedOverMessages() {
  let queued = []
  try {
    queued = JSON.parse(sessionStorage.getItem(FLASH_KEY) || '[]')
    sessionStorage.removeItem(FLASH_KEY)
  } catch {
    return
  }
  queued.forEach(({ message, type, description, duration }) => {
    const show = typeof toast[type] === 'function' ? toast[type] : toast
    show(message, { description, duration })
  })
}

const statusClass = status =>
  /deliver(ed)?$/i.test(status) ? 'is-delivered'
    : /cancel/i.test(status) ? 'is-cancelled'
      : /transit|shipped|out for/i.test(status) ? 'is-transit'
        : ''

function OrderCard({ order }) {
  const status = order.deliveryStatus || order.status || 'Confirmed'
  const items = Array.isArray(order.items) && order.items.length
    ? order.items.map(item => `${item.name || 'Product'} x${item.qty || 1}`).join(', ')
    : 'Crop inputs'
  const expected = order.expectedDeliveryDate
    ? new Date(order.expectedDeliveryDate).toLocaleDateString('en-IN')
    : 'To be updated'
  const total = Number(order.total)

  return (
    <div className="order-row">
      <div className="order-card-head">
        <span className="order-card-id">{order.id}</span>
        <span className={`order-badge ${statusClass(status)}`}>{status}</span>
      </div>
      <div className="order-card-meta">
        <div className="muted"><i className="fa-solid fa-box" aria-hidden="true"></i> {items}</div>
        {total > 0 && <div className="muted"><i className="fa-solid fa-indian-rupee-sign" aria-hidden="true"></i> ₹{total.toLocaleString('en-IN')}</div>}
        <div className="muted"><i className="fa-regular fa-calendar" aria-hidden="true"></i> Expected: {expected}</div>
        {order.address && <div className="muted"><i className="fa-solid fa-location-dot" aria-hidden="true"></i> Delivering to: {order.address}</div>}
      </div>
      {order.otp && status !== 'Delivered' && (
        <div className="order-card-otp">
          <i className="fa-solid fa-key" aria-hidden="true"></i> Delivery OTP (share only with the delivery agent): <strong>{order.otp}</strong>
        </div>
      )}
      <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <Link
          to={`/support-tickets?orderId=${encodeURIComponent(order.id)}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '0.8rem',
            fontWeight: 700,
            color: '#16a34a',
            background: 'rgba(22, 163, 74, 0.08)',
            border: '1px solid rgba(22, 163, 74, 0.25)',
            padding: '6px 14px',
            borderRadius: 6,
            textDecoration: 'none',
            transition: 'all 0.15s ease'
          }}
        >
          <i className="fa-solid fa-ticket" aria-hidden="true"></i> Raise Support Ticket
        </Link>
      </div>
    </div>
  )
}

export default function OrderStatus() {
  const { user, loading: sessionLoading } = useAuth()
  const [orders, setOrders] = useState([])
  const [state, setState] = useState('loading') // loading | ready | error | expired

  useEffect(() => {
    showCarriedOverMessages()
  }, [])

  const loadOrders = useCallback(() => {
    setState('loading')
    axios.get('/api/orders')
      .then(({ data }) => {
        setOrders(Array.isArray(data?.data) ? data.data : [])
        setState('ready')
      })
      .catch(err => {
        // A 401 also signs the visitor out (AuthContext), which shows the sign-in message.
        setState(err?.response?.status === 401 ? 'expired' : 'error')
      })
  }, [])

  useEffect(() => {
    if (user) loadOrders()
  }, [user?.id, loadOrders])

  let intro
  let body
  if (sessionLoading || (user && state === 'loading')) {
    intro = 'Loading your registered orders...'
    body = <p className="muted">Loading...</p>
  } else if (!user) {
    intro = state === 'expired'
      ? 'Your session has expired. Please sign in again.'
      : 'Sign in to see the orders linked to your account.'
    body = <p className="muted"><Link to="/">Go to the store</Link> and sign in from the account menu.</p>
  } else if (state === 'error') {
    intro = 'Order service is unavailable.'
    body = (
      <>
        <p className="muted">Please try again shortly.</p>
        <button type="button" className="retry-button" onClick={loadOrders}>Retry</button>
      </>
    )
  } else {
    intro = `Orders for ${user.name || user.phone || 'your account'}`
    body = orders.length
      ? orders.map(order => <OrderCard key={order.id} order={order} />)
      : <p className="muted">No orders found for this account yet.</p>
  }

  return (
    <div className="sb-orders-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0 }}>Order status</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>{intro}</p>
        </div>
        <Link
          to="/support-tickets"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'linear-gradient(135deg, #16a34a, #059669)',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: '0.85rem',
            fontWeight: 700,
            textDecoration: 'none',
            boxShadow: '0 2px 8px rgba(22, 163, 74, 0.2)'
          }}
        >
          <i className="fa-solid fa-headset" aria-hidden="true"></i> Support Tickets Desk
        </Link>
      </div>
      <section className="status-card" aria-live="polite">{body}</section>
      <ServicesBottomNav />
    </div>
  )
}
