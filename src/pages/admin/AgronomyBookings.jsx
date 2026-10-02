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

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sprout size={24} color="#059669" /> Agronomy Bookings
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748b' }}>
            {isAdmin ? 'Every expert callback farmers have booked.' : 'Callbacks farmers have booked with you.'}
            {' '}{pending} waiting for a call.
          </p>
        </div>
        <button type="button" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #cbd5e1', padding: '8px 14px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 10, top: 11 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search farmer, phone, crop, expert…"
            style={{ width: '100%', padding: '9px 10px 9px 32px', border: '1px solid #cbd5e1', borderRadius: 8, boxSizing: 'border-box' }} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '9px 10px', border: '1px solid #cbd5e1', borderRadius: 8 }}>
          <option value="Scheduled">Waiting for call</option>
          <option value="Completed">Completed</option>
          <option value="all">All</option>
        </select>
      </div>

      {loading ? (
        <p style={{ color: '#64748b' }}>Loading bookings…</p>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', background: '#f8fafc', borderRadius: 12, color: '#64748b' }}>
          No bookings here.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {filtered.map(b => {
            const done = b.status === 'Completed'
            return (
              <div key={b.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, color: '#0f172a' }}>{b.farmerName} <span style={{ fontWeight: 500, color: '#94a3b8', fontSize: '0.8rem' }}>{b.id}</span></div>
                    <div style={{ fontSize: '0.85rem', color: '#334155', marginTop: 4 }}>
                      {b.topic} · {b.crop} · {b.acreage} acre{Number(b.acreage) === 1 ? '' : 's'}
                    </div>
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.8rem', color: '#64748b', marginTop: 6 }}>
                      <a href={`tel:+91${b.farmerPhone}`} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#059669', fontWeight: 700 }}><Phone size={13} /> {b.farmerPhone}</a>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={13} /> {b.preferredDate || 'Any day'}{b.preferredSlot ? `, ${b.preferredSlot}` : ''}</span>
                      {isAdmin && <span>Expert: {b.expertName}</span>}
                    </div>
                    {b.notes && <p style={{ margin: '8px 0 0', fontSize: '0.82rem', color: '#475569' }}>Farmer's note: {b.notes}</p>}
                    {done && (
                      <p style={{ margin: '8px 0 0', fontSize: '0.82rem', color: '#475569' }}>
                        Done by {b.completedBy || 'staff'}{b.completedAt ? ` on ${new Date(b.completedAt).toLocaleDateString('en-IN')}` : ''}{b.callbackNotes ? `: ${b.callbackNotes}` : ''}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: done ? '#dcfce7' : '#fef3c7', color: done ? '#166534' : '#92400e' }}>
                      {done ? <CheckCircle2 size={13} /> : <Clock size={13} />} {done ? 'Completed' : 'Waiting'}
                    </span>
                    {!done && openId !== b.id && (
                      <button type="button" onClick={() => { setOpenId(b.id); setNotes('') }}
                        style={{ background: '#059669', color: '#fff', border: 0, borderRadius: 8, padding: '6px 12px', fontWeight: 700, cursor: 'pointer' }}>
                        Mark done
                      </button>
                    )}
                  </div>
                </div>
                {openId === b.id && (
                  <form onSubmit={e => complete(e, b)} style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} maxLength={2000}
                      placeholder="What did you advise? (saved with the booking)"
                      style={{ padding: 10, border: '1px solid #cbd5e1', borderRadius: 8, fontFamily: 'inherit' }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="submit" disabled={saving} style={{ background: '#059669', color: '#fff', border: 0, borderRadius: 8, padding: '8px 14px', fontWeight: 700, cursor: 'pointer' }}>
                        {saving ? 'Saving…' : 'Save & complete'}
                      </button>
                      <button type="button" onClick={() => setOpenId(null)} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' }}>Cancel</button>
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
