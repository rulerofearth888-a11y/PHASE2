import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Sprout, RefreshCw, Phone, Calendar, CheckCircle2, Clock, Search } from 'lucide-react'
import { agronomyService } from '../../services/agronomyService'
import { useAuth } from '../../context/AuthContext'

// Staff view of farmers' agronomy callback bookings. The server decides what
// each role sees: admins every booking, an expert the ones made with them.
export default function AgronomyBookings() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('Scheduled')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setBookings(await agronomyService.getAllBookings())
    } catch {
      toast.error('Failed to load agronomy bookings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    window.addEventListener('sathyam:bookings-updated', load)
    return () => window.removeEventListener('sathyam:bookings-updated', load)
  }, [load])

  const complete = async (e, booking) => {
    e.preventDefault()
    setSaving(true)
    try {
      await agronomyService.completeCallback(booking.id, { callbackNotes: notes })
      toast.success('Callback marked as completed')
      setOpenId(null)
      setNotes('')
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Could not update the booking')
    } finally {
      setSaving(false)
    }
  }

  const q = search.trim().toLowerCase()
  const filtered = bookings.filter(b => {
    if (statusFilter !== 'all' && b.status !== statusFilter) return false
    if (!q) return true
    return [b.id, b.farmerName, b.farmerPhone, b.crop, b.expertName, b.topic]
      .some(v => String(v || '').toLowerCase().includes(q))
  })
  const pending = bookings.filter(b => b.status !== 'Completed').length
  const completed = bookings.length - pending

  return (
    <div className="animate-fade-in p2-staff">
      <div className="admin-hero">
        <div>
          <div className="eyebrow">Farmer services</div>
          <h1>Agronomy Bookings</h1>
          <p>
            {isAdmin ? 'Every expert callback farmers have booked.' : 'Callbacks farmers have booked with you.'}
            {' '}{pending} waiting for a call.
          </p>
        </div>
        <button type="button" className="p2-btn p2-btn--outline p2-btn--sm" onClick={load}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <div className="p2-stats">
        <button type="button" className="p2-stat is-amber" aria-pressed={statusFilter === 'Scheduled'} onClick={() => setStatusFilter('Scheduled')}>
          <span className="p2-stat-icon"><Clock size={18} /></span>
          <span className="p2-stat-value">{pending}</span>
          <span className="p2-stat-label">Waiting for call</span>
        </button>
        <button type="button" className="p2-stat is-green" aria-pressed={statusFilter === 'Completed'} onClick={() => setStatusFilter('Completed')}>
          <span className="p2-stat-icon"><CheckCircle2 size={18} /></span>
          <span className="p2-stat-value">{completed}</span>
          <span className="p2-stat-label">Completed</span>
        </button>
        <button type="button" className="p2-stat" aria-pressed={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
          <span className="p2-stat-icon"><Sprout size={18} /></span>
          <span className="p2-stat-value">{bookings.length}</span>
          <span className="p2-stat-label">All</span>
        </button>
      </div>

      <div className="p2-card p2-toolbar">
        <div className="p2-search">
          <Search size={16} />
          <input className="p2-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search farmer, phone, crop, expert…" />
        </div>
        <select className="p2-input p2-select-fit" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="Scheduled">Waiting for call</option>
          <option value="Completed">Completed</option>
          <option value="all">All</option>
        </select>
      </div>

      {loading ? (
        <p className="p2-loading">Loading bookings…</p>
      ) : filtered.length === 0 ? (
        <div className="p2-empty p2-empty--dashed">
          <div className="p2-empty-icon"><Calendar size={28} /></div>
          <p>No bookings here.</p>
        </div>
      ) : (
        <div className="p2-stack">
          {filtered.map(b => {
            const done = b.status === 'Completed'
            return (
              <div key={b.id} className={`p2-booking${done ? ' is-done' : ''}`}>
                <div className="p2-booking-top">
                  <div style={{ minWidth: 0 }}>
                    <div className="p2-booking-id">{b.id}</div>
                    <h4>{b.farmerName}</h4>
                    <div className="p2-booking-topic">
                      {b.topic} · {b.crop} · {b.acreage} acre{Number(b.acreage) === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="p2-booking-actions">
                    <span className={`p2-chip ${done ? 'p2-chip--green' : 'p2-chip--amber'}`}>
                      {done ? <CheckCircle2 size={13} /> : <Clock size={13} />} {done ? 'Completed' : 'Waiting'}
                    </span>
                    {!done && openId !== b.id && (
                      <button type="button" className="p2-btn p2-btn--primary p2-btn--sm" onClick={() => { setOpenId(b.id); setNotes('') }}>
                        Mark done
                      </button>
                    )}
                  </div>
                </div>
                <div className="p2-booking-meta">
                  <a href={`tel:+91${b.farmerPhone}`} className="p2-link"><Phone size={14} /> {b.farmerPhone}</a>
                  <span><Calendar size={14} /> {b.preferredDate || 'Any day'}{b.preferredSlot ? `, ${b.preferredSlot}` : ''}</span>
                  {isAdmin && <span>Expert: {b.expertName}</span>}
                </div>
                {b.notes && <div className="p2-quote" style={{ marginTop: 10 }}>Farmer's note: {b.notes}</div>}
                {done && (
                  <div className="p2-quote p2-quote--green">
                    Done by {b.completedBy || 'staff'}{b.completedAt ? ` on ${new Date(b.completedAt).toLocaleDateString('en-IN')}` : ''}{b.callbackNotes ? `: ${b.callbackNotes}` : ''}
                  </div>
                )}
                {openId === b.id && (
                  <form onSubmit={e => complete(e, b)} className="p2-complete">
                    <textarea className="p2-input" value={notes} onChange={e => setNotes(e.target.value)} rows={3} maxLength={2000}
                      placeholder="What did you advise? (saved with the booking)" />
                    <div className="p2-row">
                      <button type="submit" className="p2-btn p2-btn--primary p2-btn--sm" disabled={saving}>
                        {saving ? 'Saving…' : 'Save & complete'}
                      </button>
                      <button type="button" className="p2-btn p2-btn--ghost p2-btn--sm" onClick={() => setOpenId(null)}>Cancel</button>
                    </div>
                  </form>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
