import { memo, useEffect, useRef, useState } from 'react'
import { cmsText, useCms } from '../../context/CmsContext'
import { telHref, SUPPORT_PHONE } from '../../shared/phoneLink'
import { WHATSAPP_EXPERT_URL } from '../data'

// The one floating button on every store page, bottom right: "Help" opens a
// small menu - call us, WhatsApp, send an enquiry and, on the home page, the
// chat assistant. It replaces four separate floating buttons (call, enquiry,
// chat bubble, the /products advisory button) that covered product names and
// prices on phones and stacked up on desktop.
// The enquiry sheet (EnquirySheet.jsx) and the chat window (Chatbot.jsx) open
// on the events below. Hidden while a sheet, the phone Menu or the welcome
// poster is open (body.overlay-open / menu-open / poster-open).
// Styles: storefront.css, "Floating help button".

const ENQUIRY_OPEN_EVENT = 'sb:open-enquiry'
export const CHAT_OPEN_EVENT = 'sb:open-chat'

export default memo(function HelpFab() {
  const { cms } = useCms()
  const phone = cmsText(cms, 'phone', SUPPORT_PHONE)
  const call = telHref(phone)
  const [open, setOpen] = useState(false)
  const [hasChat, setHasChat] = useState(false)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    setHasChat(Boolean(document.getElementById('chatbotWindow')))
    const onDown = event => { if (!rootRef.current?.contains(event.target)) setOpen(false) }
    const onKey = event => {
      if (event.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const openEnquiry = () => {
    setOpen(false)
    window.dispatchEvent(new CustomEvent(ENQUIRY_OPEN_EVENT, { detail: { opener: buttonRef.current } }))
  }
  const openChat = () => {
    setOpen(false)
    window.dispatchEvent(new CustomEvent(CHAT_OPEN_EVENT))
  }

  return (
    <div className={`help-fab${open ? ' is-open' : ''}`} ref={rootRef}>
      {open && (
        <div className="help-fab-menu" id="helpFabMenu">
          <p className="help-fab-title">How can we help?</p>
          {call && (
            <a className="help-fab-item" href={call} onClick={() => setOpen(false)}>
              <span className="help-fab-icon is-call"><i className="fa-solid fa-phone" aria-hidden="true"></i></span>
              <span><strong>Call us</strong><small className="notranslate">{phone}</small></span>
            </a>
          )}
          <a className="help-fab-item" href={WHATSAPP_EXPERT_URL} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>
            <span className="help-fab-icon is-whatsapp"><i className="fa-brands fa-whatsapp" aria-hidden="true"></i></span>
            <span><strong>WhatsApp us</strong><small>Send a crop photo for advice</small></span>
          </a>
          <button type="button" className="help-fab-item" onClick={openEnquiry} aria-haspopup="dialog">
            <span className="help-fab-icon is-enquiry"><i className="fa-solid fa-clipboard-question" aria-hidden="true"></i></span>
            <span><strong>Send an enquiry</strong><small>Price, stock or crop problem</small></span>
          </button>
          {hasChat && (
            <button type="button" className="help-fab-item" onClick={openChat}>
              <span className="help-fab-icon is-chat"><i className="fa-solid fa-comments" aria-hidden="true"></i></span>
              <span><strong>Chat assistant</strong><small>Quick answers, any time</small></span>
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        id="helpFab"
        ref={buttonRef}
        className="help-fab-button"
        aria-expanded={open}
        aria-controls={open ? 'helpFabMenu' : undefined}
        onClick={() => setOpen(current => !current)}
      >
        <i className={`fa-solid ${open ? 'fa-xmark' : 'fa-headset'}`} aria-hidden="true"></i>
        <span className="help-fab-label">{open ? 'Close' : 'Help'}</span>
      </button>
    </div>
  )
})
