import { Suspense, useCallback, useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import { StoreChrome } from '../storefront/sections/Header'
import { isLanguageReady, loadLanguagePack, translationFor } from '../storefront/i18n'
import Footer from '../components/home/Footer'

// Shared shell for every storefront page except the home page (Storefront.jsx
// has its own mega-menu header/footer, which Navigation mirrors - see its own
// comment). Navigation and Footer mount once here instead of once per route,
// so they stay mounted - same DOM nodes, no flicker or lost menu/scroll state
// - while only the routed page underneath changes.
//
// Navigation is wrapped in .desktop-only-nav (hard display:none below
// 768px, index.css) rather than relying on its own CSS to self-hide on
// phones: it now reuses storefront.css's header/navbar classes, and that
// file keeps its OWN compact header visible down to phone widths for the
// home page's bespoke mobile layout - which would double up with this
// app's shared phone chrome (StoreTopChrome/MobileBottomNav, mounted in
// App.jsx outside <Routes>) if not forced off here.
export default function StoreLayout() {
  // Same rule as the home page (Storefront.jsx): the chosen language applies
  // once its pack has loaded. The chrome's data-i18n labels are skipped by the
  // page walker, so without t they stayed English on every page but home.
  const { lang } = useLanguage()
  const [appliedLang, setAppliedLang] = useState('en')
  useEffect(() => {
    let cancelled = false
    loadLanguagePack(lang).then(ok => {
      if (!cancelled) setAppliedLang(ok && isLanguageReady(lang) ? lang : 'en')
    })
    return () => { cancelled = true }
  }, [lang])
  const t = useCallback(key => translationFor(appliedLang, key) || key, [appliedLang])

  return (
    <>
      <div className="desktop-only-nav">
        {/* The same chrome the home page renders. It used to be a second
            copy (components/home/Navigation.jsx) kept in step by hand. */}
        <div className="sb-portal">
          <StoreChrome t={t} appliedLang={appliedLang} />
        </div>
      </div>
      <main className="public-page-shell">
        {/* Pages here load on first visit; header and footer stay put meanwhile. */}
        <Suspense fallback={<div className="public-page-loading" style={{ minHeight: '60vh' }} aria-busy="true" />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </>
  )
}
