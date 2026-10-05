import { useEffect, useState } from 'react'
import axios from 'axios'
import { toast } from 'sonner'

// The product's Tamil, Kannada, Telugu and Hindi text, machine-translated by
// the server after each save (server/productTranslate.js). Staff can correct a
// line; a correction is kept until the English of that field changes.
const LANGS = [
  { code: 'ta', label: 'தமிழ் Tamil' },
  { code: 'kn', label: 'ಕನ್ನಡ Kannada' },
  { code: 'te', label: 'తెలుగు Telugu' },
  { code: 'hi', label: 'हिन्दी Hindi' },
]
const FIELDS = [
  ['tagline', 'Tagline'],
  ['description', 'Description'],
  ['detailedDescription', 'Detailed description'],
  ['dosage', 'Dosage'],
  ['howToUse', 'How to use'],
  ['whenToUse', 'When to use'],
]

function statusOf(i18n, lang, field) {
  if (i18n?.locked?.[lang]?.[field]) return ['Corrected by staff', '#047857']
  if (i18n?.failed?.[lang]?.[field]) return ['Shown in English: the machine changed a number', '#b45309']
  if (i18n?.[lang]?.[field]) return ['Machine translation', '#2563eb']
  return ['Waiting for translation (English shown)', '#64748b']
}

export default function ProductTranslations({ product, onSaved }) {
  const [lang, setLang] = useState('ta')
  const [i18n, setI18n] = useState(product?.i18n || {})
  const [drafts, setDrafts] = useState({})
  const [saving, setSaving] = useState('')
  const [enabled, setEnabled] = useState(null)

  useEffect(() => { setI18n(product?.i18n || {}); setDrafts({}) }, [product?.id, product?.i18n])
  useEffect(() => {
    axios.get('/api/product-translation-status').then(({ data }) => setEnabled(Boolean(data.data?.enabled))).catch(() => setEnabled(null))
  }, [])

  if (!product?.id) return null
  const fields = FIELDS.filter(([field]) => typeof product[field] === 'string' && product[field].trim())

  const save = async (field, text) => {
    setSaving(field)
    try {
      const { data } = await axios.put(`/api/products/${encodeURIComponent(product.id)}/translations`, { lang, field, text })
      setI18n(data.data.i18n || {})
      setDrafts(d => { const next = { ...d }; delete next[`${lang}.${field}`]; return next })
      toast.success(text ? 'Correction saved' : 'Correction removed; the machine will translate it again')
      onSaved?.()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save the translation')
    } finally {
      setSaving('')
    }
  }

  return (
    <details className="pform-section" style={{ marginTop: 12 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Translations (Tamil, Kannada, Telugu, Hindi)</summary>
      <p style={{ fontSize: '0.82rem', color: '#475569', margin: '8px 0' }}>
        Translated automatically a few seconds after you save. Correct any line and press Save; your correction stays until the English of that field changes.
        {enabled === false && <strong style={{ color: '#b45309' }}> Automatic translation is off on this server (no GOOGLE_TRANSLATE_API_KEY).</strong>}
      </p>
      <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {LANGS.map(l => (
          <button key={l.code} type="button" role="tab" aria-selected={lang === l.code}
            className={`btn ${lang === l.code ? 'btn-primary' : 'btn-outline'}`} style={{ padding: '4px 12px' }}
            onClick={() => setLang(l.code)}>{l.label}</button>
        ))}
      </div>
      {fields.length === 0 && <p style={{ fontSize: '0.85rem' }}>Add a tagline, description or dosage first.</p>}
      {fields.map(([field, label]) => {
        const key = `${lang}.${field}`
        const current = i18n?.[lang]?.[field] || ''
        const value = drafts[key] ?? current
        const [status, color] = statusOf(i18n, lang, field)
        const locked = Boolean(i18n?.locked?.[lang]?.[field])
        return (
          <div key={field} style={{ borderTop: '1px solid #e2e8f0', padding: '10px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '0.85rem' }}>{label}</strong>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color }}>{status}</span>
            </div>
            <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '4px 0', whiteSpace: 'pre-wrap' }}>English: {product[field]}</p>
            <textarea rows={field === 'dosage' || field === 'tagline' ? 2 : 4} value={value} lang={lang}
              onChange={e => setDrafts(d => ({ ...d, [key]: e.target.value }))}
              placeholder="No translation yet; the English is shown" style={{ width: '100%' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button type="button" className="btn btn-primary" style={{ padding: '4px 12px' }}
                disabled={saving === field || !value.trim() || value === current}
                onClick={() => save(field, value)}>{saving === field ? 'Saving…' : 'Save correction'}</button>
              {locked && (
                <button type="button" className="btn btn-outline" style={{ padding: '4px 12px' }} disabled={saving === field}
                  onClick={() => save(field, '')}>Use machine translation</button>
              )}
            </div>
          </div>
        )
      })}
    </details>
  )
}
