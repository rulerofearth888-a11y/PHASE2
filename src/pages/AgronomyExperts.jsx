import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Sprout,
  Calendar,
  Clock,
  PhoneCall,
  CheckCircle2,
  Star,
  Award,
  BookOpen,
  Languages,
  ShieldCheck,
  User,
  ArrowRight,
  Sparkles,
  Search,
  Filter,
  LogIn,
  Layers,
  ChevronRight,
  Info
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useCheckoutActions } from '../hooks/useCheckout'
import { agronomyService } from '../services/agronomyService'
import ServicesBottomNav from '../components/common/ServicesBottomNav'

const SPECIALIZATIONS = [
  'All Specializations',
  'Crop Disease Diagnostics',
  'Soil Health Restoration',
  'Biological Pest Control',
  'Horticulture & Fertigation'
]

export default function AgronomyExperts() {
  const { user } = useAuth()
  const { showAccount } = useCheckoutActions()
  const navigate = useNavigate()

  const [experts, setExperts] = useState([])
  const [userBookings, setUserBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('experts') // 'experts' | 'my-sessions'
  const [filterSpec, setFilterSpec] = useState('All Specializations')
  const [search, setSearch] = useState('')

  // Booking Modal
  const [selectedExpert, setSelectedExpert] = useState(null)
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [showAuthPrompt, setShowAuthPrompt] = useState(false)

  // Booking Form State
  const [bookingData, setBookingData] = useState({
    crop: user?.crop || 'Paddy/Rice',
    acreage: 2,
    preferredDate: '',
    preferredSlot: '10:00 AM - 12:00 PM',
    topic: 'Pest & Disease Outbreak',
    notes: '',
    phone: user?.phone || user?.mobile || ''
  })
  const [bookingLoading, setBookingLoading] = useState(false)

  // Load Experts and user bookings
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const expertList = await agronomyService.getExperts()
      setExperts(expertList)

      if (user) {
        const bookings = await agronomyService.getUserBookings(user.id || user._id, user.phone || user.mobile)
        setUserBookings(bookings)
      }
    } catch {
      toast.error('Could not load agronomy experts')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadData()
    const onUpdate = () => loadData()
    window.addEventListener('sathyam:experts-updated', onUpdate)
    window.addEventListener('sathyam:bookings-updated', onUpdate)
    return () => {
      window.removeEventListener('sathyam:experts-updated', onUpdate)
      window.removeEventListener('sathyam:bookings-updated', onUpdate)
    }
  }, [loadData])

  // Handle click on "Book Session"
  const handleInitiateBooking = (expert) => {
    if (!user) {
      // User must have an account
      setSelectedExpert(expert)
      setShowAuthPrompt(true)
      return
    }

    setSelectedExpert(expert)
    // Default preferred date to tomorrow
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dateStr = tomorrow.toISOString().split('T')[0]

    setBookingData({
      crop: user.crop || 'Paddy/Rice',
      acreage: user.acreage || 2,
      preferredDate: dateStr,
      preferredSlot: expert.availableSlots?.[0] || '10:00 AM - 12:00 PM',
      topic: 'Pest & Disease Diagnostics',
      notes: '',
      phone: user.phone || user.mobile || ''
    })
    setShowBookingModal(true)
  }

  // Handle booking form submission
  const handleConfirmBooking = async (e) => {
    e.preventDefault()
    if (!bookingData.phone || bookingData.phone.length < 10) {
      toast.error('Please enter a valid 10-digit mobile number for the expert callback')
      return
    }

    setBookingLoading(true)
    try {
      const created = await agronomyService.bookSession({
        expertId: selectedExpert.id,
        user,
        crop: bookingData.crop,
        acreage: bookingData.acreage,
        preferredDate: bookingData.preferredDate,
        preferredSlot: bookingData.preferredSlot,
        topic: bookingData.topic,
        notes: bookingData.notes,
        phone: bookingData.phone
      })

      toast.success(`Session Booked with ${selectedExpert.name}!`, {
        description: `Expert will call you back on ${bookingData.preferredDate} (${bookingData.preferredSlot}) at ${bookingData.phone}.`
      })

      setShowBookingModal(false)
      await loadData()
      setActiveTab('my-sessions')
    } catch (err) {
      toast.error(err.message || 'Booking failed')
    } finally {
      setBookingLoading(false)
    }
  }

  // Trigger login modal
  const handleOpenLogin = (e) => {
    setShowAuthPrompt(false)
    showAccount(e)
  }

  // Filtered experts
  const filteredExperts = experts.filter(exp => {
    if (filterSpec !== 'All Specializations' && !exp.specialization?.toLowerCase().includes(filterSpec.toLowerCase().slice(0, 10))) {
      return false
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      const match =
        exp.name.toLowerCase().includes(q) ||
        exp.specialization.toLowerCase().includes(q) ||
        exp.cropsExpertise?.some(c => c.toLowerCase().includes(q)) ||
        exp.languages?.some(l => l.toLowerCase().includes(q))
      if (!match) return false
    }
    return true
  })

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px 60px' }}>
      {/* Hero Banner */}
      <div className="p2-hero"
        style={{
          background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)',
          borderRadius: 20,
          '--p2-hero-pad': '40px 32px',
          color: '#fff',
          boxShadow: '0 12px 30px rgba(6, 78, 59, 0.25)',
          marginBottom: 32,
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div className="p2-hero-inner" style={{ position: 'relative', zIndex: 2, maxWidth: 740 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)', padding: '6px 14px', borderRadius: 30, fontSize: '0.8rem', fontWeight: 700, marginBottom: 16 }}>
            <Sparkles size={15} color="#34d399" /> CERTIFIED AGRICULTURAL SCIENTISTS &amp; AGRONOMISTS
          </div>

          <h1 className="p2-hero-title" style={{ '--p2-title-size': '2.4rem', fontWeight: 800, margin: '0 0 12px', lineHeight: 1.2 }}>
            Book a 1-on-1 Session with Our Agronomy Experts
          </h1>

          <p className="p2-hero-text" style={{ '--p2-text-size': '1.05rem', color: '#d1fae5', margin: '0 0 24px', lineHeight: 1.6 }}>
            Have crop diseases, pest outbreaks, or soil nutrition doubts? Schedule a personalized callback with Sathyam Agro Mart's certified agronomists. Free for registered farmers.
          </p>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.2)', padding: '8px 14px', borderRadius: 8, fontSize: '0.88rem' }}>
              <PhoneCall size={18} color="#34d399" /> Expert Calls You Back
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.2)', padding: '8px 14px', borderRadius: 8, fontSize: '0.88rem' }}>
              <Sprout size={18} color="#34d399" /> 100% Scientific Crop Plan
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.2)', padding: '8px 14px', borderRadius: 8, fontSize: '0.88rem' }}>
              <ShieldCheck size={18} color="#34d399" /> Zero Advisory Fee
            </div>
          </div>
        </div>

        {/* Decorative Badge */}
        <div
          style={{
            position: 'absolute',
            right: 40,
            bottom: -20,
            opacity: 0.15,
            pointerEvents: 'none'
          }}
        >
          <Sprout size={280} color="#fff" />
        </div>
      </div>

      {/* Tabs Row: Directory vs My Scheduled Consultations */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, borderBottom: '2px solid #e2e8f0', paddingBottom: 12, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={() => setActiveTab('experts')}
            style={{
              background: activeTab === 'experts' ? '#047857' : 'transparent',
              color: activeTab === 'experts' ? '#fff' : '#64748b',
              border: 'none',
              padding: '8px 20px',
              borderRadius: 8,
              fontSize: '0.92rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            👨‍🌾 Available Agronomists ({experts.length})
          </button>

          <button
            type="button"
            onClick={() => {
              if (!user) {
                setShowAuthPrompt(true)
                return
              }
              setActiveTab('my-sessions')
            }}
            style={{
              background: activeTab === 'my-sessions' ? '#047857' : 'transparent',
              color: activeTab === 'my-sessions' ? '#fff' : '#64748b',
              border: 'none',
              padding: '8px 20px',
              borderRadius: 8,
              fontSize: '0.92rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease'
            }}
          >
            📅 My Scheduled Sessions
            {userBookings.length > 0 && (
              <span style={{ background: '#ecfdf5', color: '#047857', padding: '1px 8px', borderRadius: 10, fontSize: '0.75rem', fontWeight: 800 }}>
                {userBookings.length}
              </span>
            )}
          </button>
        </div>

        {/* Link to Soil test page */}
        <Link
          to="/soil-test-report"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: '#047857',
            fontWeight: 700,
            fontSize: '0.88rem',
            textDecoration: 'none'
          }}
        >
          🧪 Have a Soil Test Report? Upload it here <ChevronRight size={16} />
        </Link>
      </div>

      {activeTab === 'experts' ? (
        <div>
          {/* Filters & Search */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 24, background: '#fff', padding: '14px 18px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
            <div style={{ position: 'relative', flex: '1 1 260px' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search expert by name, crop, or language (Tamil, Hindi, English)..."
                style={{ width: '100%', padding: '9px 12px 9px 36px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
              />
            </div>

            <select
              value={filterSpec}
              onChange={e => setFilterSpec(e.target.value)}
              style={{ padding: '9px 14px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem', background: '#fff', minWidth: 200 }}
            >
              {SPECIALIZATIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {!loading && filteredExperts.length === 0 && (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#64748b', background: '#fff', border: '1px dashed #cbd5e1', borderRadius: 12 }}>
              {experts.length === 0
                ? 'Our agronomy experts will be listed here soon.'
                : 'No experts match your search.'}
            </div>
          )}

          {/* Experts Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(360px, 100%), 1fr))', gap: 24 }}>
            {filteredExperts.map(expert => (
              <div
                key={expert.id}
                style={{
                  background: '#fff',
                  borderRadius: 16,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                }}
              >
                <div>
                  {/* Top Profile Header */}
                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 16 }}>
                    <div style={{ position: 'relative' }}>
                      {expert.avatar ? (
                        <img
                          src={expert.avatar}
                          alt={expert.name}
                          style={{ width: 68, height: 68, borderRadius: '50%', objectFit: 'cover', border: '3px solid #d1fae5' }}
                        />
                      ) : (
                        <div
                          aria-hidden="true"
                          style={{ width: 68, height: 68, borderRadius: '50%', border: '3px solid #d1fae5', background: '#ecfdf5', color: '#047857', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.4rem' }}
                        >
                          {(expert.name || '?').trim().charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div
                        title="Verified Agronomy Expert"
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          right: 0,
                          background: '#16a34a',
                          color: '#fff',
                          borderRadius: '50%',
                          width: 22,
                          height: 22,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '2px solid #fff'
                        }}
                      >
                        <CheckCircle2 size={13} />
                      </div>
                    </div>

                    <div style={{ flex: 1 }}>
                      <h3 style={{ margin: '0 0 2px', fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                        {expert.name}
                      </h3>
                      <div style={{ fontSize: '0.78rem', color: '#047857', fontWeight: 700, marginBottom: 4 }}>
                        {expert.qualification}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
                        {expert.rating ? (
                          <>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#d97706', fontWeight: 700 }}>
                              <Star size={13} fill="#f59e0b" color="#f59e0b" /> {expert.rating}
                            </span>
                            <span style={{ color: '#94a3b8' }}>({expert.reviewsCount} reviews)</span>
                          </>
                        ) : null}
                        {expert.rating && expert.experienceYears ? <span style={{ color: '#cbd5e1' }}>•</span> : null}
                        {expert.experienceYears ? <span style={{ color: '#64748b' }}>{expert.experienceYears}+ Yrs Exp</span> : null}
                      </div>
                    </div>
                  </div>

                  {/* Specialization & Bio */}
                  <div style={{ marginBottom: 14 }}>
                    <span style={{ display: 'inline-block', background: '#ecfdf5', color: '#065f46', fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20, marginBottom: 8, border: '1px solid #a7f3d0' }}>
                      🌿 {expert.specialization}
                    </span>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', lineHeight: 1.5 }}>
                      {expert.bio}
                    </p>
                  </div>

                  {/* Crops & Languages chips */}
                  <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12, marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: '#64748b', marginBottom: 6 }}>
                      <Languages size={14} /> Languages: <strong>{expert.languages?.join(', ')}</strong>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {expert.cropsExpertise?.map(crop => (
                        <span key={crop} style={{ background: '#f8fafc', color: '#475569', fontSize: '0.72rem', padding: '2px 8px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                          🌾 {crop}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card Action & Timing */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    <div style={{ fontWeight: 600, color: '#334155' }}>🕒 {expert.availableDays}</div>
                    <div>Callback Slots: 10 AM - 6 PM</div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleInitiateBooking(expert)}
                    style={{
                      background: 'linear-gradient(135deg, #047857, #065f46)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 8,
                      padding: '10px 16px',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: '0 4px 10px rgba(4, 120, 87, 0.25)'
                    }}
                  >
                    <PhoneCall size={15} /> Book Session
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* My Scheduled Consultations Tab */
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: '0 0 16px' }}>
            Your Consultation Callbacks
          </h2>

          {userBookings.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
              <Calendar size={44} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
              <h3>No Sessions Booked Yet</h3>
              <p style={{ fontSize: '0.85rem', margin: '4px 0 16px' }}>
                Select an agronomist above and book your free callback session.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('experts')}
                style={{ background: '#047857', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}
              >
                Browse Experts
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {userBookings.map(b => (
                <div
                  key={b.id}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    padding: '18px 20px',
                    background: b.status === 'Completed' ? '#f8fafc' : '#f0fdf4',
                    borderLeft: `4px solid ${b.status === 'Completed' ? '#64748b' : '#16a34a'}`
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#047857' }}>
                        {b.id} · Scheduled Consultation
                      </div>
                      <h4 style={{ margin: '2px 0 0', fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                        {b.expertName}
                      </h4>
                    </div>

                    <span style={{
                      padding: '4px 12px',
                      borderRadius: 20,
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      background: b.status === 'Completed' ? '#e2e8f0' : '#dcfce7',
                      color: b.status === 'Completed' ? '#475569' : '#15803d'
                    }}>
                      {b.status === 'Completed' ? '✅ Callback Completed' : '⏰ Callback Scheduled'}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, fontSize: '0.82rem', color: '#475569', marginBottom: 10 }}>
                    <div>📅 Date: <strong>{b.preferredDate}</strong></div>
                    <div>🕒 Time Slot: <strong>{b.preferredSlot}</strong></div>
                    <div>📱 Contact: <strong>{b.farmerPhone}</strong></div>
                    <div>🌾 Crop: <strong>{b.crop} ({b.acreage} Acres)</strong></div>
                  </div>

                  <div style={{ fontSize: '0.85rem', color: '#334155', background: '#fff', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <span style={{ fontWeight: 700, color: '#047857' }}>Query / Topic: </span>
                    {b.topic} — {b.notes || 'No extra notes.'}
                  </div>

                  {b.callbackNotes && (
                    <div style={{ marginTop: 10, fontSize: '0.85rem', background: '#ecfdf5', padding: '10px 14px', borderRadius: 8, border: '1px solid #a7f3d0', color: '#065f46' }}>
                      <strong>📝 Expert Follow-up Recommendation: </strong>
                      {b.callbackNotes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Other Pages Bottom Navigation */}
      <ServicesBottomNav />

      {/* AUTH REQUIRED MODAL PROMPT */}
      {showAuthPrompt && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16
          }}
          onClick={() => setShowAuthPrompt(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 18,
              maxWidth: 480,
              width: '100%',
              padding: '28px 28px',
              boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
              textAlign: 'center'
            }}
          >
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#047857' }}>
              <User size={30} />
            </div>

            <h3 style={{ margin: '0 0 8px', fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
              Account Required to Book Expert
            </h3>

            <p style={{ margin: '0 0 20px', fontSize: '0.88rem', color: '#64748b', lineHeight: 1.5 }}>
              To ensure our Agronomy Experts can review your previous orders, crop history, and maintain your callback records, you must have an active farmer account in our portal.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                onClick={handleOpenLogin}
                style={{
                  background: 'linear-gradient(135deg, #047857, #065f46)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '12px 20px',
                  fontWeight: 700,
                  fontSize: '0.92rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 4px 12px rgba(4, 120, 87, 0.3)'
                }}
              >
                <LogIn size={18} /> Sign In / Create Account
              </button>

              <button
                type="button"
                onClick={() => setShowAuthPrompt(false)}
                style={{
                  background: '#f1f5f9',
                  color: '#475569',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 20px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Continue Browsing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOOKING MODAL (FOR LOGGED-IN USERS) */}
      {showBookingModal && selectedExpert && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16
          }}
          onClick={() => setShowBookingModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 18,
              maxWidth: 580,
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '28px 28px',
              boxShadow: '0 25px 50px rgba(0,0,0,0.25)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                  📞 Book Session with {selectedExpert.name}
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#047857', fontWeight: 600 }}>
                  {selectedExpert.specialization} · Free Callback
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBookingModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleConfirmBooking}>
              {/* Phone confirmation */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Callback Phone Number *
                </label>
                <input
                  type="tel"
                  required
                  value={bookingData.phone}
                  onChange={e => setBookingData({ ...bookingData, phone: e.target.value })}
                  placeholder="Enter 10-digit mobile number"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                />
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  The agronomist will call this number during your chosen time slot.
                </span>
              </div>

              {/* Date & Slot */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Preferred Date *
                  </label>
                  <input
                    type="date"
                    required
                    min={new Date().toISOString().split('T')[0]}
                    value={bookingData.preferredDate}
                    onChange={e => setBookingData({ ...bookingData, preferredDate: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Preferred Time Window *
                  </label>
                  <select
                    value={bookingData.preferredSlot}
                    onChange={e => setBookingData({ ...bookingData, preferredSlot: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                  >
                    {selectedExpert.availableSlots?.map(slot => (
                      <option key={slot} value={slot}>{slot}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Crop & Acreage */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Crop Type *
                  </label>
                  <input
                    type="text"
                    required
                    value={bookingData.crop}
                    onChange={e => setBookingData({ ...bookingData, crop: e.target.value })}
                    placeholder="e.g. Paddy, Cotton, Tomato"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Field Size (Acres)
                  </label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={bookingData.acreage}
                    onChange={e => setBookingData({ ...bookingData, acreage: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                  />
                </div>
              </div>

              {/* Topic */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Consultation Subject / Symptom *
                </label>
                <select
                  value={bookingData.topic}
                  onChange={e => setBookingData({ ...bookingData, topic: e.target.value })}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.88rem' }}
                >
                  <option value="Pest & Disease Outbreak">Pest &amp; Disease Outbreak (Blast, Leaf Curl, Whitefly)</option>
                  <option value="Soil Health & Alkalinity">Soil Health, High Salinity / Alkalinity Correction</option>
                  <option value="Bio-Fertilizer Schedule">Bio-Fertilizer &amp; Organic Nutrition Schedule</option>
                  <option value="Flower Drop & Yield Booster">Flower Drop Prevention &amp; Yield Optimization</option>
                  <option value="General Crop Guidance">General Crop Maintenance</option>
                </select>
              </div>

              {/* Description */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Detailed Description (Optional)
                </label>
                <textarea
                  rows={3}
                  value={bookingData.notes}
                  onChange={e => setBookingData({ ...bookingData, notes: e.target.value })}
                  placeholder="Describe leaf symptoms, days after sowing, or chemicals previously applied..."
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.85rem', fontFamily: 'inherit' }}
                />
              </div>

              {/* Modal Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowBookingModal(false)}
                  style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bookingLoading}
                  style={{
                    background: 'linear-gradient(135deg, #047857, #065f46)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '9px 22px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(4, 120, 87, 0.3)'
                  }}
                >
                  {bookingLoading ? 'Booking...' : 'Confirm Callback Booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
