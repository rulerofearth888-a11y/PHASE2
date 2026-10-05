import { memo, useEffect, useState } from 'react'
import { cmsText, useCms } from '../../context/CmsContext'
import { telHref, SUPPORT_PHONE } from '../../shared/phoneLink'

// A round "Call us" button on every store page, bottom right, above the AI
// chat bubble where the page has one. The number is the CMS contact phone,
// the same one the phone Menu's call link uses. It hides while the basket,
// checkout, sign-in or any other sheet is open (body.overlay-open), and under
// the phone Menu and the welcome poster, so it never sits over a total or a
// Pay button. On desktop the number shows beside it on hover or focus.
//
// First visit: once the page has settled, the button rings and slides the
// number out for a few seconds, then tucks it away (is-intro). Remembered in
// localStorage, so it greets a visitor once, not on every page.
// Styles: storefront.css, "Floating call button".

const INTRO_KEY = 'sb_call_intro_seen'
const INTRO_DELAY = 3000
const INTRO_SHOWN_FOR = 4500
const BLOCKING = ['overlay-open', 'menu-open', 'poster-open']

const introSeen = () => { try { return localStorage.getItem(INTRO_KEY) === '1' } catch { return true } }
const markIntroSeen = () => { try { localStorage.setItem(INTRO_KEY, '1') } catch { /* private mode */ } }

function useFirstVisitIntro(enabled) {
  const [intro, setIntro] = useState(false)
  useEffect(() => {
    if (!enabled || introSeen()) return undefined
    let delay, hide, retry
    const run = () => {
      // Never over a sheet, the Menu or the welcome poster: try again shortly.
      if (BLOCKING.some(flag => document.body.classList.contains(flag)) || document.hidden) {
        retry = setTimeout(run, 2000)
        return
      }
      markIntroSeen()
      setIntro(true)
      hide = setTimeout(() => setIntro(false), INTRO_SHOWN_FOR)
    }
    const start = () => { delay = setTimeout(run, INTRO_DELAY) }
    if (document.readyState === 'complete') start()
    else window.addEventListener('load', start, { once: true })
    return () => {
      window.removeEventListener('load', start)
      clearTimeout(delay); clearTimeout(hide); clearTimeout(retry)
    }
  }, [enabled])
  return intro
}

export default memo(function CallFab() {
  const { cms } = useCms()
  const phone = cmsText(cms, 'phone', SUPPORT_PHONE)
  const href = telHref(phone)
  const intro = useFirstVisitIntro(Boolean(href))
  if (!href) return null
  return (
    <a id="callFab" className={`call-fab${intro ? ' is-intro' : ''}`} href={href} aria-label={`Call us: ${phone}`}>
      <i className="fa-solid fa-phone" aria-hidden="true"></i>
      <span className="call-fab-label" aria-hidden="true"><span>Call us</span> <strong className="notranslate">{phone}</strong></span>
    </a>
  )
})
