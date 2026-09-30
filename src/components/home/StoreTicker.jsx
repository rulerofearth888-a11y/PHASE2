import { useCms, cmsTickerLines } from '../../context/CmsContext'

// Phones: the storefront's scrolling offers ticker, drawn once above every
// store page (StoreTopChrome). The same wording as the storefront, so the
// language packs translate it. Styles: index.css, "SHARED TOP HEADER".
//
// This is a separate element from the desktop ticker (sections/Header.jsx
// TickerBar), not a CSS-hidden copy of it, but it now reads the same shared
// CmsContext instance as everything else (see src/context/CmsContext.jsx),
// so it can never drift out of sync with the desktop ticker - see
// tickerItemsFor there for the same admin-override-replaces-the-built-in-lines
// behaviour.
// Shown only when the admin has not set ticker lines in the CMS (banner).
// Keep these to plain facts - no offers, awards or product claims.
const ITEMS = [
  ['fa-solid fa-leaf', '#6ee7b7', 'Grow More. Protect Better. Farm Smarter.'],
  ['fa-brands fa-whatsapp', '#25d366', 'WhatsApp us at +91 87786 13372 for crop advisory in your language'],
  ['fa-solid fa-phone-volume', '#34d399', <>Call to order: <strong>+91 87786 13372</strong></>],
]

const renderItems = (items, copy, fromCms) => items.map(([icon, color, text], index) => (
  <span
    className={`sb-chrome-ticker-item${fromCms ? ' sb-chrome-ticker-item--cms' : ''}`}
    key={`${copy}-${index}`}
    aria-hidden={copy === 'b' ? 'true' : undefined}
  >
    <i className={icon} style={{ color }} aria-hidden="true"></i> {text}
  </span>
))

export default function StoreTicker() {
  const { cms } = useCms()
  const adminLines = cmsTickerLines(cms)
  const items = adminLines.length
    ? adminLines.map(line => ['fa-solid fa-bullhorn', '#fbbf24', line])
    : ITEMS

  // Drawn twice so the scroll (translateX -50%) loops seamlessly.
  return (
    <div className="sb-chrome-ticker">
      <div className="sb-chrome-ticker-track">
        {renderItems(items, 'a', !!adminLines.length)}
        {renderItems(items, 'b', !!adminLines.length)}
      </div>
    </div>
  )
}
