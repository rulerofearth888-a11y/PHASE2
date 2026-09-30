import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLanguage } from '../../context/LanguageContext'
import { useAuth } from '../../context/AuthContext'
import { useCheckoutActions } from '../../hooks/useCheckout'
import { useCms, cmsText } from '../../context/CmsContext'
import TransitionLink from './TransitionLink'
import { cropList } from '../../shared/profileFieldRules'
import { SUPPORT_PHONE } from '../../shared/phoneLink'

// Phones: the bottom bar and its Menu sheet on every store page. App.jsx draws
// it once, outside the routes, so it stays mounted - the same element, icons
// and position - while the shopper moves between pages; nothing reloads or
// redraws. On the home page the Menu goes to the storefront's own sections
// (?category=...). On any page My Account / Sign In opens the account card
// and My Cart the floating checkout over the page (hooks/useCheckout.js);
// Track Order is the one way to Order Status.
// Styles: index.css, "MOBILE MENU SHEET" and the floating bottom bar.

const CATEGORY_CHIPS = [
  ['Fungicide', 'Fungicides'],
  ['Insecticide', 'Insecticides'],
  ['Herbicide', 'Herbicides'],
  ['Bio-Stimulant', 'Bio-Stimulants'],
  ['Nematicide', 'Nematicides'],
]

// [storefront crop, All Products crop, label]
const CROP_CHIPS = [
  ['Paddy/Rice', 'Paddy', '🌾 Paddy / Rice'],
  ['Cotton', 'Cotton', '☁️ Cotton'],
  ['Tomato', 'Tomato', '🍅 Tomato'],
  ['Sugarcane', 'Sugarcane', '🎋 Sugarcane'],
  ['Grapes', 'Grapes', '🍇 Fruits'],
]

// The bar while scrolling: it steps aside as the shopper reads down and comes
// back as soon as they scroll up. At the end of a list - the page, or either
// Categories column - it returns as a slim icon-only dock, so the last items
// sit clear of it. Distances in px.
const BAR_END_ZONE = 6
const BAR_TOP_ZONE = 24
const BAR_HIDE_AFTER = 12
const BAR_SHOW_AFTER = 8
// Scrolling inside these never moves the bar.
const BAR_IGNORE = '.mobile-menu-sheet, [role="dialog"], [aria-modal="true"]'

export default function MobileBottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  const { lang, setLang, languages } = useLanguage()
  const { cms } = useCms()
  const supportPhone = cmsText(cms, 'phone', SUPPORT_PHONE)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  // The account row follows sign-in and sign-out as they happen, while the
  // sheet is closed. Read from storage as the sheet opened, the new name
  // re-laid out and repainted the whole sheet on the frame its slide started.
  const { user } = useAuth()
  const { openBasket, showAccount } = useCheckoutActions()
  const sheetRef = useRef(null)

  const path = location.pathname
  const onHome = path === '/'
  const isShop = path === '/products' || path === '/categories' || path.startsWith('/product/')
  const isBlog = path === '/blog' || path.startsWith('/blog/')

  const closeMenu = () => setIsMenuOpen(false)

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen)

  // Touch-down on Menu takes `inert` off the closed sheet. Inert is inherited,
  // so clearing it restyles everything inside the sheet (traced: 74 elements,
  // ~20ms on a 4x slower CPU) - done while the finger is down, that no longer
  // lands on the frame the slide starts. Not tapped after all (a scroll), the
  // sheet is made inert again; it stays aria-hidden throughout.
  //
  // Touch-down also repaints the sheet. Left alone for a while (reading the
  // page, a locked phone, another app), the browser drops the closed sheet's
  // painted content, and the first open after that repainted all of it on the
  // frame the slide started (traced: paint 55 -> 99ms at 4x slower CPU after
  // two minutes idle; the first frame of the slide 100-150ms, the next open
  // smooth). Flipping data-warm changes the border's colour by an invisible
  // amount, so that repaint happens while the finger is still down. It is an
  // attribute, not a class: React rewrites className when the sheet opens,
  // which would repaint it again on exactly that frame.
  const warmTimer = useRef(0)
  const warmMenu = event => {
    const sheet = sheetRef.current
    if (isMenuOpen || !sheet || event.pointerType === 'mouse') return
    sheet.dataset.warm = sheet.dataset.warm === '1' ? '0' : '1'
    sheet.removeAttribute('inert')
    clearTimeout(warmTimer.current)
    warmTimer.current = setTimeout(() => {
      if (!menuOpenRef.current) sheet.setAttribute('inert', '')
    }, 800)
  }
  useEffect(() => () => clearTimeout(warmTimer.current), [])

  // Any page change - another page, a section link or a filter - closes the menu.
  useEffect(() => {
    setIsMenuOpen(false)
  }, [location.key])

  // 'full' | 'hidden' | 'compact' - see BAR_END_ZONE above.
  const [barMode, setBarMode] = useState('full')
  const barModeRef = useRef('full')
  const menuOpenRef = useRef(isMenuOpen)
  menuOpenRef.current = isMenuOpen
  // The last thing the shopper touched, wheeled over or typed in.
  const lastInputRef = useRef(null)

  const showBar = useCallback(mode => {
    if (barModeRef.current === mode) return
    barModeRef.current = mode
    setBarMode(mode)
  }, [])

  // While the menu is open the page's looping decorations behind it (ticker,
  // pulses) pause, as they do behind the storefront's popups. index.css,
  // "MOBILE MENU SHEET".
  useEffect(() => {
    document.body.classList.toggle('menu-open', isMenuOpen)
    return () => document.body.classList.remove('menu-open')
  }, [isMenuOpen])

  // Opening or closing the menu forgets what was last touched, but leaves the
  // bar's size alone: growing back from the slim dock animates its width and
  // height, which re-laid out the bar on every frame of the sheet's slide.
  useEffect(() => {
    lastInputRef.current = null
  }, [isMenuOpen])

  // A new page brings the full bar back and forgets what was last touched.
  useEffect(() => {
    lastInputRef.current = null
    showBar('full')
  }, [path, showBar])

  // So does a popup opening over the page (the storefront marks the body).
  useEffect(() => {
    const body = document.body
    const observer = new MutationObserver(() => {
      if (body.classList.contains('overlay-open')) showBar('full')
    })
    observer.observe(body, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [showBar])

  // Scroll events don't bubble, so one capturing listener hears the page and
  // every scrolling panel in it (the Categories rail and pane scroll on their
  // own). Each scroller's last position is kept, so the two columns are judged
  // separately, and only the one the shopper is moving decides: a scroll
  // counts only from the page or panel holding the last thing touched. The
  // Categories rail re-centres itself as the pane scrolls, and pages jump to a
  // section on arrival - neither of those moves the bar.
  useEffect(() => {
    const lastTop = new WeakMap()
    let travel = 0
    let source = null
    let frame = 0

    const measure = () => {
      frame = 0
      const target = source
      source = null
      if (!target || menuOpenRef.current || document.body.classList.contains('overlay-open')) return
      const isPage = target === document || target === document.documentElement || target === document.body
      const el = isPage ? document.scrollingElement || document.documentElement : target
      // Small panels (a carousel, a chat window) and popups don't count.
      if (!isPage && (el.closest(BAR_IGNORE) || el.clientHeight < window.innerHeight * 0.4)) return
      const end = el.scrollHeight - (isPage ? window.innerHeight : el.clientHeight)
      if (end <= BAR_END_ZONE) return
      // Clamped, so iOS rubber-banding past either end reads as no movement.
      const top = Math.min(Math.max(el.scrollTop, 0), end)
      const delta = top - (lastTop.get(el) ?? top)
      lastTop.set(el, top)
      const input = lastInputRef.current
      if (!input || !el.contains(input)) return
      if (end - top <= BAR_END_ZONE) {
        travel = 0
        showBar('compact')
        return
      }
      if (top <= BAR_TOP_ZONE) {
        travel = 0
        showBar('full')
        return
      }
      if (!delta) return
      // Only steady travel in one direction counts, not a jittery finger.
      if ((delta > 0) !== (travel > 0)) travel = 0
      travel += delta
      if (travel > BAR_HIDE_AFTER) showBar('hidden')
      else if (travel < -BAR_SHOW_AFTER) showBar('full')
    }

    const onScroll = event => {
      source = event.target
      if (!frame) frame = requestAnimationFrame(measure)
    }
    const onPointer = event => { lastInputRef.current = event.target }
    const onKey = () => { lastInputRef.current = document.activeElement || document.body }
    const listen = { capture: true, passive: true }
    document.addEventListener('scroll', onScroll, listen)
    document.addEventListener('touchstart', onPointer, listen)
    document.addEventListener('wheel', onPointer, listen)
    document.addEventListener('keydown', onKey, listen)
    return () => {
      document.removeEventListener('scroll', onScroll, listen)
      document.removeEventListener('touchstart', onPointer, listen)
      document.removeEventListener('wheel', onPointer, listen)
      document.removeEventListener('keydown', onKey, listen)
      cancelAnimationFrame(frame)
    }
  }, [showBar])

  // Closed, the sheet sits painted just below the screen: keep it out of focus
  // order, and back at the top for next time once the slide-out has finished.
  // Inert goes back on only then: it is inherited, so setting it restyles
  // everything inside the sheet (traced: ~90 elements, 60-100ms on a 4x slower
  // CPU), which on the first frame of the slide-out made closing stutter. Until
  // then the sheet is aria-hidden; focus still inside it by then (Escape from
  // the keyboard) goes back to Menu. A tile that opened a popup has already
  // handed focus to it.
  const sheetEverOpened = useRef(false)
  useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return undefined
    if (isMenuOpen) {
      sheetEverOpened.current = true
      clearTimeout(warmTimer.current)
      sheet.removeAttribute('inert')
      return undefined
    }
    const settle = () => {
      if (sheet.contains(document.activeElement)) document.getElementById('mobileNavMenu')?.focus()
      sheet.setAttribute('inert', '')
      sheet.scrollTop = 0
    }
    if (!sheetEverOpened.current) {
      settle()
      return undefined
    }
    const timer = setTimeout(settle, 450)
    return () => clearTimeout(timer)
  }, [isMenuOpen])

  // Escape closes it; so does rotating or resizing to the desktop layout.
  useEffect(() => {
    if (!isMenuOpen) return undefined
    const onKey = e => { if (e.key === 'Escape') setIsMenuOpen(false) }
    const desktop = window.matchMedia('(min-width: 769px)')
    const onResize = ev => { if (ev.matches) setIsMenuOpen(false) }
    document.addEventListener('keydown', onKey)
    desktop.addEventListener?.('change', onResize)
    return () => {
      document.removeEventListener('keydown', onKey)
      desktop.removeEventListener?.('change', onResize)
    }
  }, [isMenuOpen])

  // A downward swipe that starts with the sheet scrolled to the top closes it.
  useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return undefined
    let startX = 0
    let startY = 0
    let dy = 0
    let tracking = false
    let decided = false
    const reset = () => {
      sheet.style.removeProperty('transform')
      sheet.style.removeProperty('transition')
    }
    const onStart = e => {
      if (e.touches.length !== 1 || e.target.closest('select') || sheet.scrollTop > 0) return
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      dy = 0
      tracking = true
      decided = false
    }
    const onMove = e => {
      if (!tracking) return
      const moveX = e.touches[0].clientX - startX
      const moveY = e.touches[0].clientY - startY
      if (!decided) {
        if (Math.abs(moveX) < 6 && Math.abs(moveY) < 6) return
        decided = true
        // Sideways or upward is scrolling, not a dismiss.
        if (Math.abs(moveX) > Math.abs(moveY) || moveY < 0) {
          tracking = false
          return
        }
      }
      dy = Math.max(0, moveY)
      sheet.style.transition = 'none'
      sheet.style.transform = `translateY(${dy}px)`
    }
    const onEnd = () => {
      if (!tracking) return
      tracking = false
      reset()
      if (dy > 90) setIsMenuOpen(false)
    }
    sheet.addEventListener('touchstart', onStart, { passive: true })
    sheet.addEventListener('touchmove', onMove, { passive: true })
    sheet.addEventListener('touchend', onEnd)
    sheet.addEventListener('touchcancel', onEnd)
    return () => {
      sheet.removeEventListener('touchstart', onStart)
      sheet.removeEventListener('touchmove', onMove)
      sheet.removeEventListener('touchend', onEnd)
      sheet.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  // Home while already on the home page returns to the top.
  const handleHomeClick = event => {
    closeMenu()
    if (!onHome) return
    event.preventDefault()
    if (location.hash || location.search) navigate('/')
    window.scrollTo(0, 0)
  }

  // The AI Leaf Doctor is the storefront's photo scanner.
  const openScanner = () => {
    closeMenu()
    navigate('/#scan')
  }

  // The same as the header's profile icon: the account card over this page.
  const handleAccountClick = event => {
    closeMenu()
    showAccount(event)
  }

  // Enquiry: phones have no floating Enquiry button, so the Menu opens the
  // same sheet (storefront/sections/EnquirySheet.jsx). Focus returns to Menu.
  const openEnquiry = () => {
    closeMenu()
    window.dispatchEvent(new CustomEvent('sb:open-enquiry', { detail: { opener: document.getElementById('mobileNavMenu') } }))
  }

  // On the home page a Menu tile goes to that section of the page.
  const homeOr = (section, elsewhere) => (onHome ? `/#${section}` : elsewhere)

  // Crop and place are separate text nodes so the page translator can
  // translate the crop name on its own.
  const place = user && (user.village || user.district)
  // Several crops show as "Paddy / Rice +2": one line has room for one name.
  const crops = cropList(user?.crop)
  const accountSub = !user
    ? 'Sign in to track orders & get crop advice'
    : crops.length || place
      ? <>{crops[0]}{crops.length > 1 ? ` +${crops.length - 1}` : null}{crops.length && place ? ' · ' : null}{place}</>
      : 'Signed in'

  return (
    <>
      <div className={`mobile-menu-backdrop ${isMenuOpen ? 'is-shown' : ''}`} onClick={closeMenu} />

      <aside ref={sheetRef} className={`mobile-menu-sheet ${isMenuOpen ? 'is-shown' : ''}`} aria-label="Menu" aria-hidden={!isMenuOpen}>
        <div className="mms-handle" aria-hidden="true"></div>

        <div className="mms-account">
          <div className="mms-avatar"><i className="fa-solid fa-user" aria-hidden="true"></i></div>
          <div className="mms-account-text">
            <strong>{user ? `Hi, ${user.name || 'Farmer'}` : 'Welcome to Sathyam Agro Mart'}</strong>
            <span>{accountSub}</span>
          </div>
          <button type="button" className="mms-account-btn" data-account-open onClick={handleAccountClick}>
            {user ? 'My Account' : 'Sign In'}
          </button>
        </div>

        <h3 className="mms-title">Quick actions</h3>
        <div className="mms-grid">
          <TransitionLink to={homeOr('catalog', '/products')} className="mms-tile" onClick={closeMenu}>
            <span className="mms-tile-icon" style={{ '--tile': '#059669' }}><i className="fa-solid fa-store"></i></span>All Products
          </TransitionLink>
          <TransitionLink to={homeOr('categoriesSection', '/categories')} className="mms-tile" onClick={closeMenu}>
            <span className="mms-tile-icon" style={{ '--tile': '#0891b2' }}><i className="fa-solid fa-layer-group"></i></span>Categories
          </TransitionLink>
          <TransitionLink to={homeOr('cropSection', '/crops')} className="mms-tile" onClick={closeMenu}>
            <span className="mms-tile-icon" style={{ '--tile': '#65a30d' }}><i className="fa-solid fa-wheat-awn"></i></span>Shop by Crop
          </TransitionLink>
          <button type="button" className="mms-tile" onClick={openScanner}>
            <span className="mms-tile-icon" style={{ '--tile': '#d97706' }}><i className="fa-solid fa-camera-retro"></i></span>AI Leaf Doctor
          </button>
          <TransitionLink to="/blog" className="mms-tile" onClick={closeMenu}>
            <span className="mms-tile-icon" style={{ '--tile': '#7c3aed' }}><i className="fa-solid fa-book-open"></i></span>Blog
          </TransitionLink>
          <a href="#basket" className="mms-tile" data-checkout-open onClick={event => { closeMenu(); openBasket(event) }}>
            <span className="mms-tile-icon" style={{ '--tile': '#dc2626' }}><i className="fa-solid fa-bag-shopping"></i></span>My Cart
          </a>
          <TransitionLink to="/orders" className="mms-tile" onClick={closeMenu}>
            <span className="mms-tile-icon" style={{ '--tile': '#2563eb' }}><i className="fa-solid fa-truck-fast"></i></span>Track Order
          </TransitionLink>
          <TransitionLink to="/agronomy-experts" className="mms-tile" onClick={closeMenu}>
            <span className="mms-tile-icon" style={{ '--tile': '#059669' }}><i className="fa-solid fa-user-doctor"></i></span>Agronomy Experts
          </TransitionLink>
          <TransitionLink to="/soil-test-report" className="mms-tile" onClick={closeMenu}>
            <span className="mms-tile-icon" style={{ '--tile': '#0284c7' }}><i className="fa-solid fa-vial-circle-check"></i></span>Soil Test Report
          </TransitionLink>
          <TransitionLink to="/support-tickets" className="mms-tile" onClick={closeMenu}>
            <span className="mms-tile-icon" style={{ '--tile': '#ea580c' }}><i className="fa-solid fa-ticket"></i></span>Support Tickets
          </TransitionLink>
          <a href="https://wa.me/918778613372?text=Hello%20Sathyam%20Bio%20Expert%2C%20I%20need%20crop%20advice" target="_blank" rel="noopener noreferrer" className="mms-tile" onClick={closeMenu}>
            <span className="mms-tile-icon" style={{ '--tile': '#16a34a' }}><i className="fa-brands fa-whatsapp"></i></span>WhatsApp Expert
          </a>
          <button type="button" className="mms-tile" aria-haspopup="dialog" onClick={openEnquiry}>
            <span className="mms-tile-icon" style={{ '--tile': '#0d9488' }}><i className="fa-solid fa-clipboard-question"></i></span>Enquiry
          </button>
        </div>

        <h3 className="mms-title">Shop by category</h3>
        <div className="mms-chips">
          {CATEGORY_CHIPS.map(([value, label]) => (
            <TransitionLink
              key={value}
              to={onHome ? `/?category=${encodeURIComponent(value)}#catalog` : `/products?category=${encodeURIComponent(value)}`}
              className="mms-chip"
              onClick={closeMenu}
            >
              {label}
            </TransitionLink>
          ))}
        </div>

        <h3 className="mms-title">Shop by crop</h3>
        <div className="mms-chips">
          {CROP_CHIPS.map(([storeValue, productsValue, label]) => (
            <TransitionLink
              key={storeValue}
              to={onHome ? `/?crop=${encodeURIComponent(storeValue)}#catalog` : `/products?crop=${encodeURIComponent(productsValue)}`}
              className="mms-chip"
              onClick={closeMenu}
            >
              {label}
            </TransitionLink>
          ))}
        </div>

        <div className="mms-footer-row">
          <label className="mms-lang">
            <i className="fa-solid fa-globe" aria-hidden="true"></i>
            <select aria-label="Language" value={lang} onChange={e => setLang(e.target.value)}>
              {languages.map(language => (
                <option key={language.code} value={language.code}>{language.native}</option>
              ))}
            </select>
          </label>
          <a className="mms-call" href={`tel:${supportPhone.replace(/\D/g, '')}`}><i className="fa-solid fa-phone-volume" aria-hidden="true"></i> {supportPhone}</a>
        </div>
      </aside>

      {/* MOBILE BOTTOM NAVIGATION BAR: Home | Shop | AI Doctor | Blogs | Menu.
          While the menu is open only the Menu tab (an X) is highlighted.
          Keyboard focus landing on a tucked-away bar brings it back. */}
      <nav
        className={`sathya-mobile-bottom-nav bighaat-mobile-bottom-nav${barMode === 'full' ? '' : ` is-${barMode}`}`}
        id="mobileBottomNav"
        aria-label="Mobile Navigation"
        onFocus={() => showBar('full')}
      >
        <TransitionLink to="/" onClick={handleHomeClick} className={`mobile-nav-link ${onHome && !isMenuOpen ? 'active' : ''}`} aria-current={onHome ? 'page' : undefined}>
          <i className="fa-solid fa-house" aria-hidden="true"></i>
          <span>Home</span>
        </TransitionLink>

        {/* Shop opens the Brands section of Categories */}
        <TransitionLink to="/categories?ct=Brands" onClick={closeMenu} className={`mobile-nav-link ${isShop && !isMenuOpen ? 'active' : ''}`} aria-current={isShop ? 'page' : undefined}>
          <i className="fa-solid fa-store" aria-hidden="true"></i>
          <span>Shop</span>
        </TransitionLink>

        <button type="button" onClick={openScanner} className="mobile-nav-link mobile-nav-link-fab" aria-label="AI Leaf Doctor">
          <i className="fa-solid fa-camera-retro" aria-hidden="true"></i>
          <span>AI Doctor</span>
        </button>

        <TransitionLink to="/blog" onClick={closeMenu} className={`mobile-nav-link ${isBlog && !isMenuOpen ? 'active' : ''}`} aria-current={isBlog ? 'page' : undefined}>
          <i className="fa-solid fa-book-open" aria-hidden="true"></i>
          <span>Blogs</span>
        </TransitionLink>

        <button type="button" id="mobileNavMenu" onPointerDown={warmMenu} onClick={toggleMenu} className={`mobile-nav-link ${isMenuOpen ? 'active' : ''}`} aria-label="Menu" aria-expanded={isMenuOpen}>
          {/* No basket count here: it shows only on the header's basket icon. */}
          <i className={isMenuOpen ? 'fa-solid fa-xmark' : 'fa-solid fa-bars'} aria-hidden="true"></i>
          <span>Menu</span>
        </button>
      </nav>
    </>
  )
}
