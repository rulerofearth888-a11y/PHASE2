import { useRef } from 'react'
import { useLanguage } from '../../context/LanguageContext'
import { fillInput, speechLang, useVoiceInput, voiceSupported } from '../voice'
import { translationFor } from '../i18n'

// The mic at the right end of an input: tap, speak, and the words go into the
// field with id `htmlFor` (see voice.js). mode: 'text' (Tamil or English, with
// the site) or 'latin' (always English: addresses). Number fields have no mic.
// A textarea gets the words added; an input gets them in place of what was there.
// Its container needs the .has-voice class (room on the right; storefront.css 7n).
export default function VoiceButton({ htmlFor, mode = 'text', disabled }) {
  const { lang } = useLanguage()
  // Tooltip and screen-reader label in the site language (the page walker skips attributes).
  const label = key => translationFor(lang, key)
  // What the field held when listening began: live words replace only themselves.
  const baseRef = useRef('')
  const put = heard => {
    const el = document.getElementById(htmlFor)
    if (!el) return
    fillInput(el, el.tagName === 'TEXTAREA' && baseRef.current.trim() ? `${baseRef.current.trimEnd()} ${heard}` : heard)
  }
  const { listening, toggle } = useVoiceInput({ lang: speechLang(mode, lang), onInterim: put, onResult: put })
  if (!voiceSupported) return null
  return (
    <button
      type="button"
      className={`sb-voice-btn${listening ? ' is-listening' : ''}`}
      onClick={() => { if (!listening) baseRef.current = document.getElementById(htmlFor)?.value || ''; toggle() }}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={label(listening ? 'voice_stop' : 'voice_speak')}
      title={label(listening ? 'voice_listening' : 'voice_speak')}
    >
      <i className={`fa-solid ${listening ? 'fa-stop' : 'fa-microphone'}`} aria-hidden="true"></i>
    </button>
  )
}
