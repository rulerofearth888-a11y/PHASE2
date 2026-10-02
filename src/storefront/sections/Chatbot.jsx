import { memo, useState } from 'react'
import ComingSoon from '../../components/ComingSoon'

// AI Chat Bot is Phase 3 work — not part of this presentation build. The
// trigger button stays visible; opening it shows Coming Soon instead of the
// real canned-answer assistant, kept below commented out, to restore later.

/*
import { useEffect, useRef } from 'react'
import { useStore } from '../StoreContext'
import { WHATSAPP_EXPERT_URL } from '../data'

const QUICK_CHATS = [
  ['What is the best pesticide for Paddy Blast?', '🌾 Paddy Blast Remedy'],
  ['How to control Cotton Whitefly?', '🐛 Cotton Whitefly'],
  ['How to test soil health?', '🌱 Soil Test Guide'],
  ['I want to speak with an agronomist', '📞 Call Agronomist'],
]
const SMALL_BUTTON = { padding: '4px 10px', fontSize: '0.75rem', marginTop: '6px' }

// Canned answers to common crop questions. Products are never named here:
// a remedy button appears only when a live catalogue product is tagged for
// that problem (findRemedyProduct), and doses come from its label, not us.
function replyTo(text, addToCart, findRemedyProduct) {
  const lower = text.toLowerCase()
  const remedyButton = keyword => {
    const product = findRemedyProduct(keyword)
    if (!product) return null
    return <button className="btn btn-primary" style={SMALL_BUTTON} onClick={() => addToCart(product.id)}><i className="fa-solid fa-cart-plus"></i> Add {product.name} to Cart</button>
  }
  const whatsAppButton = label => (
    <a className="btn btn-gold" style={SMALL_BUTTON} href={WHATSAPP_EXPERT_URL} target="_blank" rel="noopener noreferrer"><i className="fa-brands fa-whatsapp"></i> {label}</a>
  )

  if (lower.includes('blast') || lower.includes('paddy')) {
    return <>🌾 <strong>Paddy Blast:</strong> Filter the products above by Paddy and Blast, or ask our agronomist which suits your field.<br />{remedyButton('blast') || whatsAppButton('Ask an Agronomist')}</>
  }
  if (lower.includes('whitefly') || lower.includes('cotton')) {
    return <>🐛 <strong>Cotton Whitefly:</strong> Filter the products above by Cotton and Whitefly, or ask our agronomist which suits your field.<br />{remedyButton('whitefly') || whatsAppButton('Ask an Agronomist')}</>
  }
  if (lower.includes('soil')) {
    return <>🌱 <strong>Soil Health:</strong> Send your soil test report to our agronomists on WhatsApp for N-P-K nutrient recommendations.<br />{whatsAppButton('Send it on WhatsApp')}</>
  }
  if (lower.includes('agronomist') || lower.includes('speak') || lower.includes('doctor')) {
    return <>📞 <strong>Senior Agronomist Consultation:</strong> Call <strong>+91 87786 13372</strong> or chat with an agronomist on WhatsApp.<br />{whatsAppButton('Chat with an Agronomist')}</>
  }
  if (lower.includes('weed') || lower.includes('herbicide')) {
    return <>🌿 <strong>Weed Control:</strong> Ask our agronomist which weed control suits your crop.<br />{remedyButton('weed') || whatsAppButton('Ask an Agronomist')}</>
  }
  return <>🌿 <strong>Sathyam Agro Mart Crop Assistant:</strong> Filter our products by crop or disease above, or ask an agronomist on WhatsApp.<br />{whatsAppButton('Ask an Agronomist')}</>
}

function ChatbotReal({ t }) {
  const { addToCart, findRemedyProduct } = useStore()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)
  const messagesRef = useRef(null)
  const timers = useRef([])
  const nextId = useRef(0)

  useEffect(() => () => timers.current.forEach(clearTimeout), [])
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
      <div className="chatbot-trigger-btn" id="chatbotTriggerBtn" onClick={() => setOpen(current => !current)} role="button" tabIndex={0} aria-label="Chat assistant">
        <i className={open ? 'fa-solid fa-xmark' : 'fa-solid fa-comments'}></i>
      </div>

      <div className={`chatbot-window${open ? ' active' : ''}`} id="chatbotWindow">
        <div className="chatbot-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-solid fa-robot"></i>
            <div>
              <span style={{ fontWeight: 700, display: 'block' }} data-i18n="chatbot_title">{t('chatbot_title')}</span>
              <span style={{ fontSize: '0.7rem', color: '#DCEFE4' }}>● Online 24/7 (Instant Response)</span>
            </div>
          </div>
          <button id="chatbotCloseBtn" onClick={() => setOpen(false)} style={{ background: 'transparent', color: 'white', fontSize: '1.2rem', cursor: 'pointer' }} aria-label="Close chat">&times;</button>
        </div>
        <div className="chatbot-messages" id="chatbotMessages" ref={messagesRef}>
          <div className="chat-msg bot-msg" data-i18n="chat_welcome">{t('chat_welcome')}</div>
          <div className="chat-chip-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
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
}
*/

export default memo(function Chatbot() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="chatbot-trigger-btn" id="chatbotTriggerBtn" onClick={() => setOpen(current => !current)} role="button" tabIndex={0} aria-label="Chat assistant">
        <i className={open ? 'fa-solid fa-xmark' : 'fa-solid fa-comments'}></i>
      </div>
      <div className={`chatbot-window${open ? ' active' : ''}`} id="chatbotWindow">
        <div className="chatbot-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-solid fa-robot"></i>
            <span style={{ fontWeight: 700 }}>Crop Assistant</span>
          </div>
          <button id="chatbotCloseBtn" onClick={() => setOpen(false)} style={{ background: 'transparent', color: 'white', fontSize: '1.2rem', cursor: 'pointer' }} aria-label="Close chat">&times;</button>
        </div>
        <div className="chatbot-messages" id="chatbotMessages">
          <ComingSoon title="Chat assistant — coming soon" message="Our AI crop assistant will be here to help soon." />
        </div>
      </div>
    </>
  )
})
