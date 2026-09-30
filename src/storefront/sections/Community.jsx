import { memo, useMemo, useState } from 'react'
import axios from 'axios'
import { cmsText } from '../../hooks/useCmsSettings'
import { showToast } from '../toast'
import { CROP_CHOICES } from '../../shared/profileFieldRules'
import { advisoryCropOptions } from '../../utils/catalogUtils'
import CropSelect from './CropSelect'

// Only testimonials an admin has entered in the CMS are shown - no built-in
// quotes, so nothing appears that a real customer did not say.
export const Testimonials = memo(function Testimonials({ cms }) {
  const sectionTitle    = cmsText(cms, 'testimonialsTitle',    '')
  const sectionSubtitle = cmsText(cms, 'testimonialsSubtitle', '')

  const testimonials = [1, 2, 3].map(n => ({
    quote: cmsText(cms, `testimonial${n}Quote`, ''),
    photo: cmsText(cms, `testimonial${n}Photo`, ''),
    name:  cmsText(cms, `testimonial${n}Name`,  ''),
    place: cmsText(cms, `testimonial${n}Place`, ''),
  })).filter(item => item.quote)

  if (!sectionTitle || !testimonials.length) return null

  return (
    <section className="section" style={{ background: '#ffffff', padding: '50px 0' }}>
      <div className="container">
        <div className="section-header text-center">
          <h2 className="section-title">{sectionTitle}</h2>
          {sectionSubtitle && <p className="section-subtitle">{sectionSubtitle}</p>}
        </div>
        <div className="testimonials-grid">
          {testimonials.map((item, index) => (
            <div key={index} style={{ background: '#FAF9F6', border: '1px solid var(--border-light)', borderRadius: '16px', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ color: 'var(--accent-amber)', marginBottom: '8px' }}>★★★★★</div>
              <p style={{ fontSize: '0.88rem', fontStyle: 'italic', color: 'var(--text-main)', lineHeight: 1.5 }}>{item.quote}</p>
              <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                {item.photo && <img
                  src={item.photo}
                  alt="Farmer"
                  style={{ width: '46px', height: '46px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--primary)' }}
                  loading="lazy"
                  decoding="async"
                />}
                <div>
                  <strong style={{ fontSize: '0.9rem', display: 'block', color: 'var(--primary-dark)' }}>{item.name}</strong>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{item.place}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
})

// Every crop the store knows (the sign-up list, then the admin's catalogue
// crops), and a last choice for farmers who grow several.
const MIXED_CROPS = 'Mixed / other crops'

export const Newsletter = memo(function Newsletter({ cms, crops }) {
  // Popular: the sign-up crops. More: what only the catalogue has.
  const cropGroups = useMemo(() => {
    const popular = advisoryCropOptions(CROP_CHOICES, [])
    const more = advisoryCropOptions(CROP_CHOICES, crops).slice(popular.length)
    return [
      { title: 'Popular crops', options: popular },
      ...(more.length ? [{ title: 'More crops', options: more }] : []),
      { title: 'Other', options: [MIXED_CROPS] },
    ]
  }, [crops])
  const [subscribed, setSubscribed] = useState(false)
  const [phone, setPhone] = useState('')
  const [crop, setCrop] = useState(CROP_CHOICES[0])
  const [submitting, setSubmitting] = useState(false)

  const farmImg = cmsText(cms, 'advisoryImage', 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=1000&q=80&auto=format&fit=crop')

  const handleSubmit = async event => {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const { data } = await axios.post('/api/advisory/subscribe', { phone, crop })
      if (!data.success) throw new Error(data.message || 'Could not subscribe')
      setSubscribed(true)
    } catch (error) {
      const message = error.response?.data?.message || error.message || 'Could not subscribe. Please try again.'
      showToast(message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // One card: the farm photo with a "weekly on WhatsApp" badge, then the
  // offer, what farmers get, and a labelled two-field form. Phones stack the
  // photo (shorter) over the rest. Styles: storefront.css, "NEWSLETTER".
  return (
    <section className="newsletter-section" aria-labelledby="newsletterTitle">
      <div className="container">
        <div className="newsletter-inner">
          <div className="newsletter-left">
            <img
              src={farmImg}
              className="newsletter-farm-img"
              alt=""
              loading="lazy"
              decoding="async"
              onError={event => { event.currentTarget.style.visibility = 'hidden' }}
            />
            <span className="newsletter-img-badge">
              <span className="newsletter-img-badge-icon" aria-hidden="true"><i className="fa-brands fa-whatsapp"></i></span>
              <span>Every week on WhatsApp</span>
            </span>
          </div>
          <div className="newsletter-right">
            <span className="newsletter-tag"><i className="fa-solid fa-seedling" aria-hidden="true"></i> Free Seasonal Advisory</span>
            <h2 className="newsletter-title" id="newsletterTitle">
              {cms && typeof cms.advisoryTitle === 'string' && cms.advisoryTitle.trim()
                ? cms.advisoryTitle
                : <>Get Weekly Crop &amp; Pesticide<br />Recommendations</>}
            </h2>
            <p className="newsletter-desc">{cmsText(cms, 'advisoryDesc', 'Join 15,000+ farmers receiving our free seasonal advisory newsletter. Kharif & Rabi crop schedules, disease alerts, and exclusive offers every week.')}</p>
            <ul className="newsletter-perks">
              <li><i className="fa-solid fa-calendar-days" aria-hidden="true"></i><span>Crop calendars for Kharif &amp; Rabi</span></li>
              <li><i className="fa-solid fa-bell" aria-hidden="true"></i><span>Disease &amp; pest alerts</span></li>
              <li><i className="fa-solid fa-tag" aria-hidden="true"></i><span>Exclusive farmer offers</span></li>
            </ul>
            {subscribed ? (
              <div className="newsletter-done" role="status">
                <span className="newsletter-done-icon" aria-hidden="true"><i className="fa-solid fa-check"></i></span>
                <span>
                  <strong>You&apos;re subscribed!</strong>
                  <span>Thank you! Your advisory subscription is confirmed.</span>
                </span>
              </div>
            ) : (
              <form className="newsletter-form" onSubmit={handleSubmit}>
                <div className="newsletter-field">
                  <label className="newsletter-label" htmlFor="newsletterPhone">WhatsApp number</label>
                  <div className="newsletter-control newsletter-control--phone">
                    <span className="newsletter-prefix" aria-hidden="true">+91</span>
                    <input
                      id="newsletterPhone"
                      type="tel"
                      placeholder="9876543210"
                      className="newsletter-input"
                      value={phone}
                      onChange={event => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))}
                      inputMode="numeric"
                      autoComplete="tel-national"
                      maxLength={10}
                      required
                    />
                  </div>
                </div>
                <div className="newsletter-field">
                  <label className="newsletter-label" id="newsletterCropLabel" htmlFor="newsletterCrop">Your crop</label>
                  <CropSelect id="newsletterCrop" labelId="newsletterCropLabel" value={crop} onChange={setCrop} groups={cropGroups} />
                </div>
                <button type="submit" className="newsletter-btn" disabled={submitting}>
                  <i className="fa-brands fa-whatsapp" aria-hidden="true"></i> {submitting ? 'Subscribing…' : 'Subscribe Free'}
                </button>
              </form>
            )}
            <p className="newsletter-note"><i className="fa-solid fa-lock" aria-hidden="true"></i> No spam. Unsubscribe anytime. Available in 6 South Indian languages.</p>
          </div>
        </div>
      </div>
    </section>
  )
})
