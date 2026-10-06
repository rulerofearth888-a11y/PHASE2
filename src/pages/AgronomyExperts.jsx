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
    <div className="p2-page">
      {/* Hero Banner */}
      <section className="p2-hero">
        <Sprout className="p2-hero-art" aria-hidden="true" />
        <div className="p2-hero-inner">
          <div className="p2-eyebrow">
            <Sparkles size={14} /> CERTIFIED AGRICULTURAL SCIENTISTS &amp; AGRONOMISTS
          </div>

          <h1 className="p2-hero-title">
            Book a 1-on-1 Session with Our Agronomy Experts
          </h1>

          <p className="p2-hero-text">
            Have crop diseases, pest outbreaks, or soil nutrition doubts? Schedule a personalized callback with Sathyam Agro Mart's certified agronomists. Free for registered farmers.
          </p>

          <div className="p2-hero-perks">
            <span className="p2-perk"><PhoneCall size={16} /> Expert Calls You Back</span>
            <span className="p2-perk"><Sprout size={16} /> 100% Scientific Crop Plan</span>
            <span className="p2-perk"><ShieldCheck size={16} /> Zero Advisory Fee</span>
          </div>
        </div>
      </section>

      {/* Tabs Row: Directory vs My Scheduled Consultations */}
      <div className="p2-tabbar">
        <div className="p2-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className="p2-tab"
            aria-selected={activeTab === 'experts'}
            onClick={() => setActiveTab('experts')}
          >
            👨‍🌾 Available Agronomists ({experts.length})
          </button>

          <button
            type="button"
            role="tab"
            className="p2-tab"
            aria-selected={activeTab === 'my-sessions'}
            onClick={() => {
              if (!user) {
                setShowAuthPrompt(true)
                return
              }
              setActiveTab('my-sessions')
            }}
          >
            📅 My Scheduled Sessions
            {userBookings.length > 0 && <span className="p2-count">{userBookings.length}</span>}
          </button>
        </div>

        {/* Link to Soil test page */}
        <Link to="/soil-test-report" className="p2-link">
          🧪 Have a Soil Test Report? Upload it here <ChevronRight size={16} />
        </Link>
      </div>

      {activeTab === 'experts' ? (
        <div>
          {/* Filters & Search */}
          <div className="p2-card p2-toolbar">
            <div className="p2-search">
              <Search size={16} />
              <input
                type="text"
                className="p2-input"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search expert by name, crop, or language (Tamil, Hindi, English)..."
              />
            </div>

            <select className="p2-input" value={filterSpec} onChange={e => setFilterSpec(e.target.value)}>
              {SPECIALIZATIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {!loading && filteredExperts.length === 0 && (
            <div className="p2-empty p2-empty--dashed">
              <div className="p2-empty-icon"><User size={28} /></div>
              <p>
                {experts.length === 0
                  ? 'Our agronomy experts will be listed here soon.'
                  : 'No experts match your search.'}
              </p>
            </div>
          )}

          {/* Experts Grid */}
          <div className="p2-expert-grid">
            {filteredExperts.map(expert => (
              <article key={expert.id} className="p2-card p2-expert">
                <div>
                  {/* Top Profile Header */}
                  <div className="p2-expert-top">
                    <div className="p2-avatar">
                      {expert.avatar ? (
                        <img src={expert.avatar} alt={expert.name} />
                      ) : (
                        <div className="p2-avatar-initial" aria-hidden="true">
                          {(expert.name || '?').trim().charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="p2-avatar-badge" title="Verified Agronomy Expert">
                        <CheckCircle2 size={13} />
                      </span>
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <h3>{expert.name}</h3>
                      <div className="p2-expert-qual">{expert.qualification}</div>
                      <div className="p2-expert-stats">
                        {expert.rating ? (
                          <>
                            <span className="p2-star">
                              <Star size={13} fill="#f59e0b" color="#f59e0b" /> {expert.rating}
                            </span>
                            <span>({expert.reviewsCount} reviews)</span>
                          </>
                        ) : null}
                        {expert.rating && expert.experienceYears ? <span>•</span> : null}
                        {expert.experienceYears ? <span>{expert.experienceYears}+ Yrs Exp</span> : null}
                      </div>
                    </div>
                  </div>

                  {/* Specialization & Bio */}
                  <span className="p2-chip p2-chip--green">🌿 {expert.specialization}</span>
                  {expert.bio && <p className="p2-expert-bio">{expert.bio}</p>}

                  {/* Crops & Languages chips */}
                  <div className="p2-expert-tags">
                    <div className="p2-expert-langs">
                      <Languages size={14} /> Languages: <strong>{expert.languages?.join(', ')}</strong>
                    </div>
                    <div className="p2-chip-row">
                      {expert.cropsExpertise?.map(crop => (
                        <span key={crop} className="p2-chip p2-chip--line">🌾 {crop}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card Action & Timing */}
                <div className="p2-expert-foot">
                  <div className="p2-expert-hours">
                    <strong>🕒 {expert.availableDays}</strong>
                    <div>Callback Slots: 10 AM - 6 PM</div>
                  </div>

                  <button type="button" className="p2-btn p2-btn--primary" onClick={() => handleInitiateBooking(expert)}>
                    <PhoneCall size={15} /> Book Session
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        /* My Scheduled Consultations Tab */
        <div className="p2-card p2-card-pad">
          <h2 className="p2-card-title" style={{ marginBottom: 16 }}>
            Your Consultation Callbacks
          </h2>

          {userBookings.length === 0 ? (
            <div className="p2-empty">
              <div className="p2-empty-icon"><Calendar size={28} /></div>
              <h3>No Sessions Booked Yet</h3>
              <p>Select an agronomist above and book your free callback session.</p>
              <button type="button" className="p2-btn p2-btn--primary p2-btn--sm" onClick={() => setActiveTab('experts')}>
                Browse Experts
              </button>
            </div>
          ) : (
            <div className="p2-stack">
              {userBookings.map(b => (
                <div key={b.id} className={`p2-booking${b.status === 'Completed' ? ' is-done' : ''}`}>
                  <div className="p2-booking-top">
                    <div>
                      <div className="p2-booking-id">{b.id} · Scheduled Consultation</div>
                      <h4>{b.expertName}</h4>
                    </div>
                    <span className={`p2-chip ${b.status === 'Completed' ? '' : 'p2-chip--green'}`}>
                      {b.status === 'Completed' ? '✅ Callback Completed' : '⏰ Callback Scheduled'}
                    </span>
                  </div>

                  <dl className="p2-facts">
                    <div><dt>📅 Date:</dt><dd>{b.preferredDate}</dd></div>
                    <div><dt>🕒 Time Slot:</dt><dd>{b.preferredSlot}</dd></div>
                    <div><dt>📱 Contact:</dt><dd>{b.farmerPhone}</dd></div>
                    <div><dt>🌾 Crop:</dt><dd>{b.crop} ({b.acreage} Acres)</dd></div>
                  </dl>

                  <div className="p2-quote">
                    <b>Query / Topic: </b>
                    {b.topic} — {b.notes || 'No extra notes.'}
                  </div>

                  {b.callbackNotes && (
                    <div className="p2-quote p2-quote--green">
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
        <div className="p2-backdrop" onClick={() => setShowAuthPrompt(false)}>
          <div className="p2-modal p2-modal--narrow p2-modal--center" role="dialog" aria-modal="true" aria-labelledby="p2-auth-title" onClick={e => e.stopPropagation()}>
            <div className="p2-modal-body">
              <div className="p2-empty-icon"><User size={28} /></div>
              <h3 id="p2-auth-title" className="p2-card-title" style={{ fontSize: '1.3rem', marginBottom: 8 }}>
                Account Required to Book Expert
              </h3>
              <p className="p2-card-sub">
                To ensure our Agronomy Experts can review your previous orders, crop history, and maintain your callback records, you must have an active farmer account in our portal.
              </p>
            </div>
            <div className="p2-modal-foot" style={{ flexDirection: 'column' }}>
              <button type="button" className="p2-btn p2-btn--primary p2-btn--block" onClick={handleOpenLogin}>
                <LogIn size={18} /> Sign In / Create Account
              </button>
              <button type="button" className="p2-btn p2-btn--ghost p2-btn--block" onClick={() => setShowAuthPrompt(false)}>
                Continue Browsing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOOKING MODAL (FOR LOGGED-IN USERS) */}
      {showBookingModal && selectedExpert && (
        <div className="p2-backdrop" onClick={() => setShowBookingModal(false)}>
          <div className="p2-modal" role="dialog" aria-modal="true" aria-labelledby="p2-book-title" onClick={e => e.stopPropagation()}>
            <div className="p2-modal-head">
              <div>
                <h3 id="p2-book-title">📞 Book Session with {selectedExpert.name}</h3>
                <p style={{ color: 'var(--p2-green)', fontWeight: 600 }}>
                  {selectedExpert.specialization} · Free Callback
                </p>
              </div>
              <button type="button" className="p2-close" aria-label="Close" onClick={() => setShowBookingModal(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleConfirmBooking}>
              <div className="p2-modal-body">
                {/* Phone confirmation */}
                <div className="p2-field">
                  <label className="p2-label">Callback Phone Number *</label>
                  <input
                    type="tel"
                    className="p2-input"
                    required
                    value={bookingData.phone}
                    onChange={e => setBookingData({ ...bookingData, phone: e.target.value })}
                    placeholder="Enter 10-digit mobile number"
                  />
                  <span className="p2-hint">
                    The agronomist will call this number during your chosen time slot.
                  </span>
                </div>

                {/* Date & Slot */}
                <div className="p2-grid-2">
                  <div className="p2-field">
                    <label className="p2-label">Preferred Date *</label>
                    <input
                      type="date"
                      className="p2-input"
                      required
                      min={new Date().toISOString().split('T')[0]}
                      value={bookingData.preferredDate}
                      onChange={e => setBookingData({ ...bookingData, preferredDate: e.target.value })}
                    />
                  </div>

                  <div className="p2-field">
                    <label className="p2-label">Preferred Time Window *</label>
                    <select
                      className="p2-input"
                      value={bookingData.preferredSlot}
                      onChange={e => setBookingData({ ...bookingData, preferredSlot: e.target.value })}
                    >
                      {selectedExpert.availableSlots?.map(slot => (
                        <option key={slot} value={slot}>{slot}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Crop & Acreage */}
                <div className="p2-grid-2">
                  <div className="p2-field">
                    <label className="p2-label">Crop Type *</label>
                    <input
                      type="text"
                      className="p2-input"
                      required
                      value={bookingData.crop}
                      onChange={e => setBookingData({ ...bookingData, crop: e.target.value })}
                      placeholder="e.g. Paddy, Cotton, Tomato"
                    />
                  </div>

                  <div className="p2-field">
                    <label className="p2-label">Field Size (Acres)</label>
                    <input
                      type="number"
                      className="p2-input"
                      min="0.5"
                      step="0.5"
                      value={bookingData.acreage}
                      onChange={e => setBookingData({ ...bookingData, acreage: e.target.value })}
                    />
                  </div>
                </div>

                {/* Topic */}
                <div className="p2-field">
                  <label className="p2-label">Consultation Subject / Symptom *</label>
                  <select
                    className="p2-input"
                    value={bookingData.topic}
                    onChange={e => setBookingData({ ...bookingData, topic: e.target.value })}
                  >
                    <option value="Pest & Disease Outbreak">Pest &amp; Disease Outbreak (Blast, Leaf Curl, Whitefly)</option>
                    <option value="Soil Health & Alkalinity">Soil Health, High Salinity / Alkalinity Correction</option>
                    <option value="Bio-Fertilizer Schedule">Bio-Fertilizer &amp; Organic Nutrition Schedule</option>
                    <option value="Flower Drop & Yield Booster">Flower Drop Prevention &amp; Yield Optimization</option>
                    <option value="General Crop Guidance">General Crop Maintenance</option>
                  </select>
                </div>

                {/* Description */}
                <div className="p2-field">
                  <label className="p2-label">Detailed Description (Optional)</label>
                  <textarea
                    rows={3}
                    className="p2-input"
                    value={bookingData.notes}
                    onChange={e => setBookingData({ ...bookingData, notes: e.target.value })}
                    placeholder="Describe leaf symptoms, days after sowing, or chemicals previously applied..."
                  />
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="p2-modal-foot">
                <button type="button" className="p2-btn p2-btn--ghost" onClick={() => setShowBookingModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="p2-btn p2-btn--primary" disabled={bookingLoading}>
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
