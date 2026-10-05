import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { useCheckout, useCheckoutActions } from '../hooks/useCheckout'
import { StoreContext } from './StoreContext'
import { isLanguageReady, loadLanguagePack, translationFor } from './i18n'
import { setBodyFlag } from './bodyFlags'
import CallFab from './sections/CallFab'
import HelpFab from './sections/HelpFab'
import EnquirySheet from './sections/EnquirySheet'
import GuestContactPrompt from './sections/GuestContactPrompt'
import LocationPrompt from './sections/LocationPrompt'
import WelcomeCelebration from './sections/WelcomeCelebration'
import './storefront.css'

// The sign-in card and the checkout are the two biggest pieces of the store's
// code and only matter once tapped. They are fetched while the phone is idle
// after the page has loaded - and mounted then, so from that moment they
// behave exactly as before - or straight away if opened sooner.
const loadAuthModal = () => import('./sections/AuthModal')
const loadCheckoutSheet = () => import('./sections/CheckoutSheet')
const AuthModal = lazy(loadAuthModal)
const CheckoutSheet = lazy(loadCheckoutSheet)

function useMountWhenIdleOr(open) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    if (mounted) return undefined
    const idle = window.requestIdleCallback || (cb => setTimeout(cb, 1500))
    const cancel = window.cancelIdleCallback || clearTimeout
    let handle
    const start = () => { handle = idle(() => setMounted(true), { timeout: 4000 }) }
    if (document.readyState === 'complete') start()
    else window.addEventListener('load', start, { once: true })
    return () => { window.removeEventListener('load', start); if (handle) cancel(handle) }
  }, [mounted])
  return mounted || Boolean(open)
}

// The popups every store page shares, drawn once in App.jsx so they open over
// whichever page the customer is on: the floating checkout and the sign-in
// card on top of it. Their state and rules are in hooks/useCheckout.js; this
// adds what being a popup takes - page scroll locked, Escape, focus kept
// inside. They sit in .sb-portal, which the
// storefront's styles also cover off the home page (storefront.css).

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function StorePopups() {
  const { user } = useAuth()
  const { lang } = useLanguage()
  const checkout = useCheckout()
  const actions = useCheckoutActions()
  const { modals, step, busy } = checkout
  const authState = modals.authModal
  const sheetState = modals.checkout
  const authMounted = useMountWhenIdleOr(authState)
  const sheetMounted = useMountWhenIdleOr(sheetState || step)

  // The sign-in card's brand line comes from the language pack.
  const [appliedLang, setAppliedLang] = useState('en')
  useEffect(() => {
    let cancelled = false
    loadLanguagePack(lang).then(ok => {
      if (!cancelled) setAppliedLang(ok && isLanguageReady(lang) ? lang : 'en')
    })
    return () => { cancelled = true }
  }, [lang])
  const t = useCallback(key => translationFor(appliedLang, key) || key, [appliedLang])

  // AuthModal and its Modal read these from the storefront's context.
  const store = useMemo(() => ({
    afterSignIn: actions.afterSignIn,
    signOut: actions.signOut,
    leaveSignInFor: actions.leaveSignInFor,
    closeModal: id => (id === 'authModal' ? actions.closeSignIn() : actions.closeCheckout()),
  }), [actions])

  useEffect(() => {
    setBodyFlag('overlay-open', 'store-popups', Boolean(authState || sheetState))
  }, [authState, sheetState])
  useEffect(() => () => setBodyFlag('overlay-open', 'store-popups', false), [])

  // While the checkout is open only its own content scrolls. Where the page
  // has a classic scrollbar its gutter stays, so nothing behind shifts.
  useEffect(() => {
    if (!step) return undefined
    const root = document.documentElement
    root.classList.toggle('sb-scroll-lock-gutter', window.innerWidth > root.clientWidth)
    root.classList.add('sb-scroll-lock')
    return () => root.classList.remove('sb-scroll-lock', 'sb-scroll-lock-gutter')
  }, [Boolean(step)])

  // Closed, focus goes back to what opened it.
  const lastSheetState = useRef(sheetState)
  useEffect(() => {
    if (lastSheetState.current && !sheetState) actions.restoreFocus()
    lastSheetState.current = sheetState
  }, [sheetState, actions])

  const live = useRef({})
  live.current = { authOpen: Boolean(authState), sheetOpen: Boolean(step), busy }

  useEffect(() => {
    // Escape closes the sign-in card, then the checkout (not mid-payment). The
    // storefront's own popups are left to the storefront.
    const onKey = event => {
      const { authOpen, sheetOpen, busy: working } = live.current
      if (event.key === 'Escape') {
        // An open dropdown inside the card (the crop picker) closes first.
        if (event.target?.closest?.('[role="combobox"][aria-expanded="true"]')) return
        if (authOpen) {
          event.preventDefault()
          actions.closeSignIn()
        } else if (sheetOpen && !working) {
          event.preventDefault()
          actions.closeCheckout()
        }
        return
      }
      // Tab stays inside the checkout. Razorpay's window, above it, keeps its own focus.
      if (event.key !== 'Tab' || !sheetOpen || authOpen || working === 'pay') return
      const panel = document.querySelector('#checkoutSheet .co-panel')
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
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [actions])

  return (
    <StoreContext.Provider value={store}>
      <div className="sb-portal">
        <Suspense fallback={null}>
          {sheetMounted && <CheckoutSheet />}
          {authMounted && <AuthModal t={t} state={authState} user={user} notice={checkout.authNotice} loginRequest={checkout.loginRequest} />}
        </Suspense>
        <EnquirySheet />
        <WelcomeCelebration />
        <CallFab />
        <HelpFab />
        <GuestContactPrompt t={t} />
        <LocationPrompt />
      </div>
    </StoreContext.Provider>
  )
}
