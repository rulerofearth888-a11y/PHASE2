import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLanguage } from '../context/LanguageContext'
import { fillInput, speechLang, useVoiceInput, voiceSupported } from '../storefront/voice'
import { translationFor } from '../storefront/i18n'
import './voiceAnywhere.css'

// Voice typing for every text field customers use - every store page and its
// popups (mounted only there, App.jsx; not the admin or staff portals), and
// fields added later - with no change to the forms: when a
// field has focus, a mic floats at its right edge (drawn in its own layer on
// <body>, never inside React's markup). Tap it, speak, and the words go in
// through the field's own onChange (voice.js, fillInput), so every form's
// checks and saving work as they do for the keyboard.
// Fields with their own mic (.has-voice, the header search) are left alone, as
// are numbers, passwords, emails, dates, files, one-time codes and data-voice="off".

const TEXT_TYPES = new Set(['text', 'search', ''])
const PLACE = /address|street|village|district|taluk|city|town|area|location|door|pincode|postal|landmark/i

function voiceModeOf(el) {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return null
  if (el.disabled || el.readOnly || el.dataset.voice === 'off') return null
  if (el.closest('.has-voice') || el.id === 'headerSearchInput') return null
  const auto = (el.getAttribute('autocomplete') || '').toLowerCase()
  if (auto === 'one-time-code') return null
  if (el instanceof HTMLInputElement && !TEXT_TYPES.has(el.type)) return null
  const inputMode = (el.getAttribute('inputmode') || '').toLowerCase()
  // Numbers (mobile, PIN, acres, quantities) are typed, never spoken.
  if (['decimal', 'numeric', 'tel'].includes(inputMode)) return null
  const hint = `${el.id} ${el.name} ${auto} ${el.getAttribute('placeholder') || ''} ${el.getAttribute('aria-label') || ''}`
  // Places (couriers read them) and searches (products match on English text): English.
  if (PLACE.test(hint) || el.type === 'search' || /search/i.test(hint)) return 'latin'
  return 'text'
}

export default function VoiceAnywhere() {
  const { lang } = useLanguage()
  // Tooltip and screen-reader label in the site language (the page walker skips attributes).
  const label = key => translationFor(lang, key)
  const [target, setTarget] = useState(null) // { el, mode }
  const [box, setBox] = useState(null)
  const targetRef = useRef(null)
  targetRef.current = target

  const mode = target?.mode
  // What the field held when listening began, so live words replace only
  // themselves and a textarea keeps what was written before.
  const baseRef = useRef('')
  const withBase = (el, heard) => (el instanceof HTMLTextAreaElement && baseRef.current.trim() ? `${baseRef.current.trimEnd()} ${heard}` : heard)
  const { listening, toggle } = useVoiceInput({
    lang: speechLang(mode || 'latin', lang),
    onInterim: sofar => {
      const el = targetRef.current?.el
      if (el && el.isConnected) fillInput(el, withBase(el, sofar))
    },
    onResult: heard => {
      const el = targetRef.current?.el
      if (!el || !el.isConnected) return
      fillInput(el, withBase(el, heard))
    },
  })
  const listeningRef = useRef(listening)
  listeningRef.current = listening

  // Follow focus: the mic belongs to the field being typed in.
  useEffect(() => {
    if (!voiceSupported) return undefined
    let blurTimer = 0
    const onFocusIn = event => {
      clearTimeout(blurTimer)
      if (listeningRef.current) return
      const next = voiceModeOf(event.target)
      setTarget(next ? { el: event.target, mode: next } : null)
    }
    // Focus leaving the page's fields (not to the mic itself) hides it; while
    // listening it stays until the words are in.
    const onFocusOut = () => {
      blurTimer = setTimeout(() => {
        if (listeningRef.current) return
        const el = document.activeElement
        if (!el || !voiceModeOf(el)) setTarget(null)
      }, 120)
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      clearTimeout(blurTimer)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  // Keep the mic on the field's right edge as the page or a popup scrolls,
  // the keyboard opens or the field grows.
  useEffect(() => {
    if (!target) { setBox(null); return undefined }
    let frame = 0
    const place = () => {
      frame = 0
      const el = target.el
      if (!el.isConnected) { setTarget(null); return }
      let r = el.getBoundingClientRect()
      // A borderless input drawn inside a pill (the shop searches) is shorter
      // than the box people see: sit on the pill's right edge instead.
      if (r.height < 32 && el.parentElement) {
        const p = el.parentElement.getBoundingClientRect()
        if (p.height >= r.height && p.height <= 64 && p.width >= r.width) r = p
      }
      const hidden = r.width < 60 || r.height < 14 || r.bottom < 0 || r.top > window.innerHeight
      setBox(hidden ? null : { top: r.top, left: r.left, width: r.width, height: r.height, area: el instanceof HTMLTextAreaElement })
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(place) }
    place()
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('resize', schedule)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    observer?.observe(target.el)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('resize', schedule)
      observer?.disconnect()
    }
  }, [target])

  if (!voiceSupported || !target || !box) return null

  const size = Math.min(36, Math.max(28, box.height - 8))
  const style = {
    top: box.area ? box.top + 6 : box.top + (box.height - size) / 2,
    left: box.left + box.width - size - 6,
    width: size,
    height: size,
  }
  return createPortal(
    <button
      type="button"
      className={`sb-voice-float${listening ? ' is-listening' : ''}`}
      style={style}
      // Keeps the field focused (and the phone keyboard open) through the tap.
      onPointerDown={event => event.preventDefault()}
      onMouseDown={event => event.preventDefault()}
      onClick={() => { if (!listening) baseRef.current = target.el.value || ''; toggle() }}
      aria-pressed={listening}
      aria-label={label(listening ? 'voice_stop' : 'voice_speak')}
      title={label(listening ? 'voice_listening' : 'voice_speak')}
    >
      <i className={`fa-solid ${listening ? 'fa-stop' : 'fa-microphone'}`} aria-hidden="true"></i>
    </button>,
    document.body,
  )
}
