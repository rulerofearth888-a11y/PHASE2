import { memo, useEffect, useRef, useState } from 'react'
import { WHATSAPP_EXPERT_URL } from '../data'
import { cmsText } from '../../hooks/useCmsSettings'
import { photoUrl, photoSrcSet } from '../../shared/responsiveImage'

const SCAN_PHOTO = 'https://images.unsplash.com/photo-1530836369250-ef72a3f5cda8'
const ADVISOR_PHOTO = 'https://images.unsplash.com/photo-1595974482597-4b8da8879bc5'

// ─── Hero bento banner ────────────────────────────────────────────────────────
export const Hero = memo(function Hero({ t, cms }) {
  const tag       = cmsText(cms, 'heroBannerTag', "India's #1 Bio-Pesticide Store")
  const img       = cmsText(cms, 'heroBannerImage', 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80')
  const title     = cmsText(cms, 'heroTitle', t('hero_title'))
  const subtitle  = cmsText(cms, 'heroSubtitle', t('hero_desc'))
  const shopBtn   = cmsText(cms, 'heroShopBtnText', t('hero_shop_btn'))

  return (
    <section className="section hero-bento" style={{ padding: '24px 0 40px 0' }}>
      <div className="container">
        <div className="bento-grid-4">
          {/* Main feature banner (2 columns, 2 rows) */}
          <div className="bento-card bento-span-2 bento-row-2">
            <img src={photoUrl(img, 800)} srcSet={photoSrcSet(img)} sizes="(max-width: 1024px) 100vw, 50vw" className="bento-bg-img" alt="Agriculture Farm Field" fetchpriority="high" decoding="async" />
            <div className="bento-overlay">
              <span className="bento-tag">{tag}</span>
              <h1 className="bento-title" style={{ fontSize: '2rem' }} data-i18n="hero_title">{title}</h1>
              <p className="bento-desc" data-i18n="hero_desc">{subtitle}</p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '10px' }}>
                <a href="#catalog" className="btn btn-primary bento-btn">
                  <span data-i18n="hero_shop_btn">{shopBtn}</span>
                </a>
                {/* Desktop and phones (hidden on tablets): a second route in for farmers who want advice first. */}
                <a href={WHATSAPP_EXPERT_URL} className="hero-cta-secondary" target="_blank" rel="noopener noreferrer">
                  <i className="fa-brands fa-whatsapp" aria-hidden="true"></i> Talk to an Expert
                </a>
              </div>
            </div>
          </div>

          {/* AI Leaf Doctor scanner */}
          <div className="bento-card bento-span-2" data-modal-target="photoScannerModal" style={{ cursor: 'pointer' }}>
            <img src={photoUrl(SCAN_PHOTO, 800)} srcSet={photoSrcSet(SCAN_PHOTO)} sizes="(max-width: 1024px) 100vw, 50vw" className="bento-bg-img" alt="Crop Leaf Scan" loading="lazy" decoding="async" />
            <div className="bento-overlay">
              <span className="bento-tag">Instant Diagnostic</span>
              <h3 className="bento-title hero-scan-title">AI Leaf Scanner</h3>
              <p className="bento-desc">Upload leaf photo for 10-second disease check</p>
            </div>
          </div>

          {/* WhatsApp assistant */}
          <div className="bento-card bento-span-2" style={{ background: 'linear-gradient(135deg, #063F2A, #096540)', cursor: 'pointer' }} onClick={() => window.open(WHATSAPP_EXPERT_URL, '_blank', 'noopener')}>
            <img src={photoUrl(ADVISOR_PHOTO, 800)} srcSet={photoSrcSet(ADVISOR_PHOTO)} sizes="(max-width: 1024px) 100vw, 50vw" className="bento-bg-img" style={{ opacity: 0.35 }} alt="Farmer Consultation" loading="lazy" decoding="async" />
            <div className="bento-overlay">
              <span className="bento-tag" style={{ background: '#25d366', color: 'white' }}>24/7 WhatsApp AI</span>
              <h3 className="bento-title">Automated Field Assistant</h3>
              <p className="bento-desc">Get instant pesticide dosage guides &amp; disease remedies directly on WhatsApp</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
})

const pad = value => String(value).padStart(2, '0')

function untilMidnight() {
  const now = new Date()
  const midnight = new Date()
  midnight.setHours(23, 59, 59, 999)
  let secs = Math.floor((midnight - now) / 1000)
  if (secs <= 0) secs = 86399
  return { h: pad(Math.floor(secs / 3600)), m: pad(Math.floor((secs % 3600) / 60)), s: pad(secs % 60) }
}

// ─── Deal / Sale Banner ───────────────────────────────────────────────────────
export const DealBanner = memo(function DealBanner({ cms }) {
  const bannerRef = useRef(null)
  const [time, setTime] = useState(untilMidnight)

  const title    = cmsText(cms, 'dealBannerTitle',    'Kharif Season Sale — Up to 30% Off Paddy & Cotton Essentials')
  const subtitle = cmsText(cms, 'dealBannerSubtitle', 'Limited stock. Ends midnight tonight. COD available.')

  useEffect(() => {
    // Nothing is redrawn while the banner is off-screen or a popup or sheet
    // covers the page. The time is read from the clock on each tick, so
    // skipped ticks never drift.
    let onScreen = true
    const tick = () => {
      if (!onScreen || document.body.classList.contains('overlay-open')) return
      const next = untilMidnight()
      setTime(current => (current.h === next.h && current.m === next.m && current.s === next.s ? current : next))
    }
    let observer = null
    if (bannerRef.current && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {
        onScreen = entries[entries.length - 1].isIntersecting
        if (onScreen) tick()
      })
      observer.observe(bannerRef.current)
    }
    const timer = setInterval(tick, 1000)
    return () => {
      clearInterval(timer)
      observer?.disconnect()
    }
  }, [])

  return (
    <div className="deal-banner" ref={bannerRef}>
      <div className="container deal-banner-inner">
        <div className="deal-left">
          <span className="deal-fire"><i className="fa-solid fa-bolt"></i></span>
          <div>
            <div className="deal-title">{title}</div>
            <div className="deal-sub">{subtitle}</div>
          </div>
        </div>
        <div className="deal-right">
          <span className="deal-label">Ends in:</span>
          <div className="deal-countdown">
            <div className="deal-block"><span id="dealHours">{time.h}</span><small>hrs</small></div>
            <div className="deal-colon">:</div>
            <div className="deal-block"><span id="dealMins">{time.m}</span><small>min</small></div>
            <div className="deal-colon">:</div>
            <div className="deal-block"><span id="dealSecs">{time.s}</span><small>sec</small></div>
          </div>
          <a href="#catalog" className="deal-cta">Shop Now <i className="fa-solid fa-arrow-right"></i></a>
        </div>
      </div>
    </div>
  )
})

// ─── Trust Strip ──────────────────────────────────────────────────────────────
export const TrustStrip = memo(function TrustStrip({ t, cms }) {
  // i18nKey keeps the data-i18n marker these headings have always carried:
  // i18n.js SKIP_TEXT uses it to leave a heading React already translated
  // alone, so the DOM text-walker never translates it a second time. A
  // heading with no key (Cash On Delivery) is walked, exactly as before.
  const items = [
    {
      icon: 'fa-shield-halved',
      i18nKey: 'trust_certified',
      title: cmsText(cms, 'trust1Title', t('trust_certified')),
      desc:  cmsText(cms, 'trust1Desc',  'Lab-Tested Original Bio-Formulations'),
    },
    {
      icon: 'fa-truck-fast',
      i18nKey: 'trust_dispatch',
      title: cmsText(cms, 'trust2Title', t('trust_dispatch')),
      desc:  cmsText(cms, 'trust2Desc',  'Express Doorstep Delivery Across India'),
    },
    {
      icon: 'fa-hand-holding-dollar',
      title: cmsText(cms, 'trust3Title', 'Cash On Delivery'),
      desc:  cmsText(cms, 'trust3Desc',  'Pay After Delivery at Your Farm'),
    },
    {
      icon: 'fa-brands fa-whatsapp',
      i18nKey: 'trust_whatsapp',
      title: cmsText(cms, 'trust4Title', t('trust_whatsapp')),
      desc:  cmsText(cms, 'trust4Desc',  '24/7 Advisory from Senior Agronomists'),
    },
  ]

  return (
    <section className="trust-strip">
      <div className="container trust-strip-grid">
        {items.map((item, i) => (
          <div key={i} className="trust-item">
            <i className={`fa-solid ${item.icon}`}></i>
            <div>
              <strong data-i18n={item.i18nKey}>{item.title}</strong>
              <span>{item.desc}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
})

// ─── Stats Strip ──────────────────────────────────────────────────────────────
export const StatsStrip = memo(function StatsStrip({ cms }) {
  const numbers = useRef([])

  // Build stats from CMS, falling back to defaults
  const stats = [
    {
      target:  parseInt(cmsText(cms, 'stat1Number', '15000'), 10) || 15000,
      label:   cmsText(cms, 'stat1Label', 'Farmers Served'),
      sub:     cmsText(cms, 'stat1Sub',   'across 18 Indian states'),
    },
    {
      target:  parseInt(cmsText(cms, 'stat2Number', '48'), 10) || 48,
      label:   cmsText(cms, 'stat2Label', 'Product Formulations'),
      sub:     cmsText(cms, 'stat2Sub',   '100% bio-certified lab tested'),
    },
    {
      target:  parseInt(cmsText(cms, 'stat3Number', '95'), 10) || 95,
      label:   cmsText(cms, 'stat3Label', '% Dispatch Rate'),
      sub:     cmsText(cms, 'stat3Sub',   'same-day orders fulfilled'),
    },
    {
      target:  parseInt(cmsText(cms, 'stat4Number', '12'), 10) || 12,
      label:   cmsText(cms, 'stat4Label', 'Years of Expertise'),
      sub:     cmsText(cms, 'stat4Sub',   'trusted since 2013'),
    },
  ]

  // Each number counts up once, the first time it scrolls into view. The
  // count is written straight to the element, not through React state, so
  // the animation re-renders nothing.
  useEffect(() => {
    const frames = new Set()
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return
        const el = entry.target
        const target = parseInt(el.dataset.target, 10)
        const startTime = performance.now()
        const duration = 1400
        const animate = now => {
          const progress = Math.min((now - startTime) / duration, 1)
          const ease = 1 - Math.pow(1 - progress, 3) // cubic ease-out
          el.textContent = Math.floor(target * ease).toLocaleString('en-IN')
          if (progress < 1) frames.add(requestAnimationFrame(animate))
          else el.textContent = target.toLocaleString('en-IN')
        }
        frames.add(requestAnimationFrame(animate))
        observer.unobserve(el)
      })
    }, { threshold: 0.4 })
    numbers.current.forEach(el => el && observer.observe(el))
    return () => {
      observer.disconnect()
      frames.forEach(cancelAnimationFrame)
    }
  }, [])

  return (
    <section className="stats-strip">
      <div className="container stats-grid">
        {stats.map((stat, index) => (
          <StatItem key={index} stat={stat} index={index} numbers={numbers} />
        ))}
      </div>
    </section>
  )
})

function StatItem({ stat, index, numbers }) {
  return (
    <>
      {index > 0 && <div className="stat-divider"></div>}
      <div className="stat-item">
        <div className="stat-number" data-target={stat.target} ref={el => { numbers.current[index] = el }}>0</div>
        <div className="stat-label">{stat.label}</div>
        <div className="stat-sublabel">{stat.sub}</div>
      </div>
    </>
  )
}
