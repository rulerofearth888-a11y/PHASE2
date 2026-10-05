import { memo, useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { showToast } from '../toast'
import VoiceButton from './VoiceButton'

// The "Farmer Enquiry" sheet, mounted once (StorePopups.jsx). It opens from the
// floating Help menu (HelpFab.jsx) and the phone Menu's Enquiry tile, both by
// the event below. Self-contained: its own open state, focus and scroll lock -
// it does not touch the checkout/sign-in modal system in hooks/useCheckout.js.
// Styles: storefront.css, "ENQUIRY SHEET" block. Reuses the generic
// .modal-overlay/.modal-card and .auth-* field classes for a consistent,
// already-accessible look.

// Dispatched by sections/HelpFab.jsx and components/home/MobileBottomNav.jsx.
const ENQUIRY_OPEN_EVENT = 'sb:open-enquiry'

const ENQUIRY_TYPES = ['Product', 'Price', 'Availability', 'Crop Problem', 'Dealer', 'Other']
const INITIAL_FIELDS = { name: '', phone: '', location: '', crop: '', type: 'Product', message: '' }
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function validate(fields) {
  const errors = {}
  if (!fields.name.trim()) errors.name = 'Please enter your name.'
  if (!/^[6-9]\d{9}$/.test(fields.phone)) errors.phone = 'Enter a valid 10-digit mobile number.'
  if (!fields.location.trim()) errors.location = 'Please enter your location or city.'
  return errors
}

export default memo(function EnquirySheet() {
  const [open, setOpen] = useState(false)
  const [fields, setFields] = useState(INITIAL_FIELDS)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const cardRef = useRef(null)
  const openerRef = useRef(null)
  const busyRef = useRef(false)
  busyRef.current = busy

  const close = () => {
    if (busyRef.current) return
    setOpen(false)
    openerRef.current?.focus?.({ preventScroll: true })
  }

  // The Help menu and the phone Menu's Enquiry tile ask for the sheet with this event.
  // detail.opener is where focus goes back to on close.
  useEffect(() => {
    const onRequest = event => {
      openerRef.current = event.detail?.opener || null
      setDone(false)
      setErrors({})
      setOpen(true)
    }
    window.addEventListener(ENQUIRY_OPEN_EVENT, onRequest)
    return () => window.removeEventListener(ENQUIRY_OPEN_EVENT, onRequest)
  }, [])

  // Body scroll lock + Escape + focus trap, only while the sheet is open.
  useEffect(() => {
    if (!open) return undefined
    const root = document.documentElement
    root.classList.add('sb-scroll-lock')

    // Autofocus waits for the sheet's own open transition to finish instead
    // of firing on the same frame the class toggles: focusing the input
    // immediately pops the mobile keyboard while the card is still sliding
    // in, and the keyboard's viewport resize fights that transform
    // transition - that's what reads as a laggy open on phones.
    const card = cardRef.current
    const focusName = () => document.getElementById('enqName')?.focus({ preventScroll: true })
    const onTransitionEnd = event => {
      if (event.target !== card || event.propertyName !== 'transform') return
      clearTimeout(fallback)
      focusName()
    }
    card?.addEventListener('transitionend', onTransitionEnd)
    const fallback = setTimeout(focusName, 350)

    const onKey = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab') return
      const panel = cardRef.current
      const items = panel ? [...panel.querySelectorAll(FOCUSABLE)].filter(el => el.getClientRects().length) : []
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (!panel.contains(document.activeElement)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      card?.removeEventListener('transitionend', onTransitionEnd)
      clearTimeout(fallback)
      root.classList.remove('sb-scroll-lock')
    }
  }, [open])

  const setField = (key, value) => {
    setFields(current => ({ ...current, [key]: value }))
    setErrors(current => (current[key] ? { ...current, [key]: undefined } : current))
  }

  const submit = async event => {
    event.preventDefault()
    if (busy) return
    const problems = validate(fields)
    setErrors(problems)
    const bad = Object.keys(problems)[0]
    if (bad) {
      document.getElementById(`enq${bad[0].toUpperCase()}${bad.slice(1)}`)?.focus()
      return
    }

    setBusy(true)
    try {
      const { data } = await axios.post('/api/enquiries', {
        name: fields.name.trim(),
        phone: fields.phone,
        location: fields.location.trim(),
        crop: fields.crop.trim(),
        type: fields.type,
        message: fields.message.trim(),
      })
      if (!data?.success) throw new Error(data?.message)
      setDone(true)
      setFields(INITIAL_FIELDS)
    } catch (err) {
      showToast(err?.response?.data?.message || 'Could not send your enquiry. Please try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const inputProps = key => ({
    id: `enq${key[0].toUpperCase()}${key.slice(1)}`,
    className: ['auth-input', errors[key] && 'sb-input-invalid'].filter(Boolean).join(' '),
    value: fields[key],
    onChange: event => setField(key, key === 'phone' ? event.target.value.replace(/\D/g, '').slice(0, 10) : event.target.value),
    'aria-invalid': errors[key] ? 'true' : undefined,
  })

  return (
    <>
      <div
        id="enquiryModal"
        className={['modal-overlay', open && 'active'].filter(Boolean).join(' ')}
        onClick={event => { if (event.target === event.currentTarget) close() }}
      >
        <div ref={cardRef} className="modal-card enq-card" role="dialog" aria-modal="true" aria-labelledby="enqTitle">
          <button className="modal-close" aria-label="Close" onClick={close}>&times;</button>

          {done ? (
            <div className="enq-done">
              <span className="enq-done-icon" aria-hidden="true"><i className="fa-solid fa-circle-check"></i></span>
              <h2 className="auth-title">Thank you!</h2>
              <p className="auth-sub">Your enquiry has been received. Our team will call you back shortly.</p>
              <div className="auth-actions">
                <button type="button" className="auth-cta" onClick={close}>Close</button>
              </div>
            </div>
          ) : (
            <>
              <header className="auth-head enq-head">
                <span className="enq-badge" aria-hidden="true"><i className="fa-solid fa-seedling"></i></span>
                <h2 id="enqTitle" className="auth-title" tabIndex={-1}>Farmer Enquiry</h2>
                <p className="auth-sub">Tell us what you need. Our team will call you back.</p>
              </header>

              <form className="auth-form" onSubmit={submit} noValidate>
                <div className="auth-field">
                  <label className="auth-label" htmlFor="enqName">Name*</label>
                  <div className="auth-control has-voice">
                    <input type="text" autoComplete="name" enterKeyHint="next" maxLength={80} {...inputProps('name')} />
                    <i className="fa-solid fa-user auth-control-icon" aria-hidden="true"></i>
                    <VoiceButton htmlFor="enqName" />
                  </div>
                  {errors.name && <small className="sb-field-error">{errors.name}</small>}
                </div>

                <div className="auth-field">
                  <label className="auth-label" htmlFor="enqPhone">Mobile Number*</label>
                  <div className="auth-control auth-control--prefix">
                    <input type="tel" inputMode="numeric" maxLength={10} autoComplete="tel-national" enterKeyHint="next" placeholder="9876543210" {...inputProps('phone')} />
                    <span className="auth-prefix" aria-hidden="true">+91</span>
                  </div>
                  {errors.phone && <small className="sb-field-error">{errors.phone}</small>}
                </div>

                <div className="auth-field">
                  <label className="auth-label" htmlFor="enqLocation">Location / City*</label>
                  <div className="auth-control has-voice">
                    <input type="text" autoComplete="address-level2" enterKeyHint="next" maxLength={80} {...inputProps('location')} />
                    <i className="fa-solid fa-location-dot auth-control-icon" aria-hidden="true"></i>
                    <VoiceButton htmlFor="enqLocation" mode="latin" />
                  </div>
                  {errors.location && <small className="sb-field-error">{errors.location}</small>}
                </div>

                <div className="auth-field">
                  <label className="auth-label" htmlFor="enqCrop">Crop <span className="auth-optional">Optional</span></label>
                  <div className="auth-control has-voice">
                    <input type="text" autoComplete="off" enterKeyHint="next" maxLength={60} placeholder="e.g. Cotton" {...inputProps('crop')} />
                    <i className="fa-solid fa-wheat-awn auth-control-icon" aria-hidden="true"></i>
                    <VoiceButton htmlFor="enqCrop" />
                  </div>
                </div>

                <div className="auth-field">
                  <label className="auth-label" htmlFor="enqType">Type of Enquiry</label>
                  <div className="auth-control auth-control--select">
                    <select {...inputProps('type')}>
                      {ENQUIRY_TYPES.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                    <i className="fa-solid fa-list-check auth-control-icon" aria-hidden="true"></i>
                    <i className="fa-solid fa-chevron-down auth-select-chevron" aria-hidden="true"></i>
                  </div>
                </div>

                <div className="auth-field">
                  <label className="auth-label" htmlFor="enqMessage">Message / Requirement <span className="auth-optional">Optional</span></label>
                  <div className="sb-voice-wrap has-voice">
                    <textarea id="enqMessage" className="auth-input enq-textarea" rows={3} maxLength={1000} value={fields.message} onChange={event => setField('message', event.target.value)} />
                    <VoiceButton htmlFor="enqMessage" />
                  </div>
                </div>

                <div className="auth-actions">
                  <button type="submit" className="auth-cta" disabled={busy}>
                    {busy ? <><i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Sending...</> : <><i className="fa-solid fa-paper-plane" aria-hidden="true"></i> Send Enquiry</>}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  )
})
