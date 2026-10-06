import { memo, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../StoreContext'
import { WHATSAPP_EXPERT_URL } from '../data'
import { CHAT_OPEN_EVENT } from './HelpFab'

// Crop Assistant: canned answers matched on keywords (no AI model behind it).
// Product buttons only ever offer a live catalogue product.

const QUICK_CHATS = [
  ['What is the best pesticide for Paddy Blast?', '🌾 Paddy Blast Remedy'],
  ['How to control Cotton Whitefly?', '🐛 Cotton Whitefly'],
  ['How to test soil health?', '🌱 Soil Test Guide'],
  ['I want to speak with an agronomist', '📞 Call Agronomist'],
]
// Canned answers to common crop questions. Products are never named here:
// a remedy button appears only when a live catalogue product is tagged for
// that problem (findRemedyProduct), and doses come from its label, not us.
function replyTo(text, addToCart, findRemedyProduct) {
  const lower = text.toLowerCase()
  const remedyButton = keyword => {
    const product = findRemedyProduct(keyword)
    if (!product) return null
    return <button className="chat-action" onClick={() => addToCart(product.id)}><i className="fa-solid fa-cart-plus"></i> Add {product.name} to Cart</button>
  }
  const pageButton = (to, label) => (
    <Link className="chat-action" to={to}>{label} <i className="fa-solid fa-arrow-right"></i></Link>
  )
  const whatsAppButton = label => (
    <a className="chat-action chat-action--wa" href={WHATSAPP_EXPERT_URL} target="_blank" rel="noopener noreferrer"><i className="fa-brands fa-whatsapp"></i> {label}</a>
  )

  if (lower.includes('blast') || lower.includes('paddy')) {
    return <>🌾 <strong>Paddy Blast:</strong> Filter the products above by Paddy and Blast, or ask our agronomist which suits your field.<br />{remedyButton('blast') || whatsAppButton('Ask an Agronomist')}</>
  }
  if (lower.includes('whitefly') || lower.includes('cotton')) {
    return <>🐛 <strong>Cotton Whitefly:</strong> Filter the products above by Cotton and Whitefly, or ask our agronomist which suits your field.<br />{remedyButton('whitefly') || whatsAppButton('Ask an Agronomist')}</>
  }
  if (lower.includes('soil')) {
    return <>🌱 <strong>Soil Health:</strong> Enter the values from your soil test card for nutrient advice and products from our catalogue, reviewed by our agronomists.<br />{pageButton('/soil-test-report', 'Check my soil report')} {whatsAppButton('Ask on WhatsApp')}</>
  }
  if (lower.includes('agronomist') || lower.includes('speak') || lower.includes('doctor')) {
    return <>📞 <strong>Senior Agronomist Consultation:</strong> Book a free callback from one of our agronomy experts, call <strong>+91 87786 13372</strong>, or chat on WhatsApp.<br />{pageButton('/agronomy-experts', 'Book a callback')} {whatsAppButton('Chat on WhatsApp')}</>
  }
  if (lower.includes('weed') || lower.includes('herbicide')) {
    return <>🌿 <strong>Weed Control:</strong> Ask our agronomist which weed control suits your crop.<br />{remedyButton('weed') || whatsAppButton('Ask an Agronomist')}</>
  }
  return <>🌿 <strong>Sathyam Agro Mart Crop Assistant:</strong> Filter our products by crop or disease above, or ask an agronomist on WhatsApp.<br />{whatsAppButton('Ask an Agronomist')}</>
}

export default memo(function Chatbot({ t }) {
  const { addToCart, findRemedyProduct } = useStore()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)
  const messagesRef = useRef(null)
  const timers = useRef([])
  const nextId = useRef(0)

  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  // Opened from the floating Help menu (HelpFab.jsx); it has no bubble of its own.
  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(CHAT_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(CHAT_OPEN_EVENT, onOpen)
  }, [])
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])
  useEffect(() => {
    const box = messagesRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [messages])

  const send = text => {
    const add = (sender, content) => setMessages(current => [...current, { id: nextId.current++, sender, content }])
    add('user', text)
    timers.current.push(setTimeout(() => add('bot', replyTo(text, addToCart, findRemedyProduct)), 500))
  }

  const sendDraft = () => {
    const text = draft.trim()
    if (!text) return
    send(text)
    setDraft('')
  }

  return (
    <>
      <div className={`chatbot-window${open ? ' active' : ''}`} id="chatbotWindow">
        <div className="chatbot-header">
          <div className="chatbot-id">
            <span className="chatbot-avatar" aria-hidden="true"><i className="fa-solid fa-seedling"></i></span>
            <div>
              <span className="chatbot-title" data-i18n="chatbot_title">{t('chatbot_title')}</span>
              <span className="chatbot-status">● Online 24/7 (Instant Response)</span>
            </div>
          </div>
          <button id="chatbotCloseBtn" className="chatbot-close" onClick={() => setOpen(false)} aria-label="Close chat">&times;</button>
        </div>
        <div className="chatbot-messages" id="chatbotMessages" ref={messagesRef}>
          <div className="chat-msg bot-msg" data-i18n="chat_welcome">{t('chat_welcome')}</div>
          <div className="chat-chip-container">
            {QUICK_CHATS.map(([question, label]) => (
              <button key={question} className="chat-quick-chip" onClick={() => { setOpen(true); send(question) }}>{label}</button>
            ))}
          </div>
          {messages.map(message => (
            <div key={message.id} className={`chat-msg ${message.sender === 'user' ? 'user-msg' : 'bot-msg'}`}>{message.content}</div>
          ))}
        </div>
        <div className="chatbot-input-row">
          <input
            ref={inputRef}
            type="text"
            id="chatbotInput"
            data-i18n-placeholder="chat_placeholder"
            placeholder={t('chat_placeholder')}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter') sendDraft() }}
          />
          <button id="chatbotSendBtn" onClick={sendDraft} aria-label="Send"><i className="fa-solid fa-paper-plane"></i></button>
        </div>
      </div>
    </>
  )
})
