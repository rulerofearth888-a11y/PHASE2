// Machine translation of product text (tagline, description, dosage, how/when
// to use) into Tamil, Kannada, Telugu and Hindi with Google Cloud Translation,
// so new products read in the farmer's language without anyone translating
// by hand. Stored on the product as `i18n`:
//
//   i18n: {
//     src:    { description: '<hash of the English it came from>', ... },
//     ta:     { description: '...', dosage: '...' },   (kn, te, hi alike)
//     locked: { ta: { dosage: true } },                  staff corrections
//     at:     '2026-10-05T...'
//   }
//
// Rules:
// - Only fields whose English changed since the last run are sent again.
// - A staff correction (locked) is never overwritten while its English is the
//   same; when the English changes, the correction no longer fits and the
//   field is translated afresh.
// - Dosage safety: a translation whose numbers differ from the English
//   ("10 kg per acre" -> anything without 10) is dropped, and the store shows
//   that field in English.
// - The product's own name, numbers with their units and a few brand words are
//   marked "do not translate" before sending.
// - No GOOGLE_TRANSLATE_API_KEY: nothing happens; the store shows English as before.

import crypto from 'node:crypto';

export const TRANSLATED_FIELDS = ['tagline', 'description', 'detailedDescription', 'dosage', 'howToUse', 'whenToUse'];
export const TRANSLATED_LANGS = ['ta', 'kn', 'te', 'hi'];
// Google's advice for one request: stay under ~5,000 characters.
const MAX_REQUEST_CHARS = 4500;
const KEEP_WORDS = ['Sathyam Agro Mart', 'Sathyam', 'WhatsApp', 'COD', 'UPI', 'NPK', 'N-P-K', 'WP', 'EC', 'SC', 'WG', 'WDG', 'SL', 'FYM', 'PSB', 'VAM'];

export const sourceHash = text => crypto.createHash('sha1').update(String(text)).digest('hex').slice(0, 12);

// "10 kg per acre, 2.5 ml/L" -> ['10', '2.5'] (sorted). Any digit run counts:
// Google keeps Western digits in these languages, so they must survive as-is.
export function numbersIn(text) {
  return (String(text).match(/\d+(?:[.,]\d+)*/g) || []).map(n => n.replace(/,/g, '')).sort();
}
export const sameNumbers = (a, b) => numbersIn(a).join('|') === numbersIn(b).join('|');

const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

// English -> HTML with the parts Google must leave alone wrapped in
// <span class="notranslate">: the product name, keep-words, and numbers with
// the unit right after them ("10 kg", "2.5 ml/L", "75 WP", "20%").
export function protect(text, productName = '') {
  const terms = [productName, ...KEEP_WORDS].filter(t => t && t.trim().length > 1)
    .sort((a, b) => b.length - a.length).map(escapeRe);
  const pattern = new RegExp(
    `(${terms.length ? `\\b(?:${terms.join('|')})\\b|` : ''}\\d+(?:[.,]\\d+)*\\s?(?:%|[a-zA-Z]{1,4}(?:\\/[a-zA-Z]{1,4})?\\b)?)`,
    'g',
  );
  let out = '';
  let last = 0;
  for (const m of String(text).matchAll(pattern)) {
    out += escapeHtml(text.slice(last, m.index)) + `<span class="notranslate">${escapeHtml(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return (out + escapeHtml(String(text).slice(last))).replace(/\n/g, '<br>');
}

export function unprotect(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#39|[a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

// What has to be (re)translated: { field: englishText } for every field whose
// English is present and changed, or that some language still lacks.
export function fieldsToTranslate(product) {
  const i18n = product.i18n || {};
  const todo = {};
  for (const field of TRANSLATED_FIELDS) {
    const english = typeof product[field] === 'string' ? product[field].trim() : '';
    if (!english) continue;
    const changed = i18n.src?.[field] !== sourceHash(english);
    const missing = TRANSLATED_LANGS.some(lang => !i18n[lang]?.[field] && !i18n.failed?.[lang]?.[field]);
    if (changed || missing) todo[field] = english;
  }
  return todo;
}

// Builds the next i18n object. translate(texts[], lang) -> Promise<texts[]>
// (HTML in, HTML out). Returns null when nothing needed doing.
export async function translateProduct(product, translate) {
  const todo = fieldsToTranslate(product);
  const fields = Object.keys(todo);
  if (!fields.length) return null;

  const prev = product.i18n || {};
  const next = { ...prev, src: { ...(prev.src || {}) }, locked: { ...(prev.locked || {}) }, failed: { ...(prev.failed || {}) } };
  const html = fields.map(f => protect(todo[f], product.name));

  for (const lang of TRANSLATED_LANGS) {
    const out = { ...(prev[lang] || {}) };
    const locked = { ...(prev.locked?.[lang] || {}) };
    const failed = { ...(prev.failed?.[lang] || {}) };
    const send = [];
    fields.forEach((field, i) => {
      const sameEnglish = prev.src?.[field] === sourceHash(todo[field]);
      if (sameEnglish && locked[field]) return;          // staff correction stands
      if (!sameEnglish) delete locked[field];             // English changed: correction is stale
      delete failed[field];
      send.push(i);
    });
    if (send.length) {
      const results = await translateInChunks(send.map(i => html[i]), lang, translate);
      send.forEach((i, k) => {
        const field = fields[i];
        const text = unprotect(results[k] || '');
        if (text && sameNumbers(todo[field], text)) out[field] = text;
        else { delete out[field]; failed[field] = true; } // shows English
      });
    }
    next[lang] = out;
    next.locked[lang] = locked;
    if (Object.keys(failed).length) next.failed[lang] = failed;
    else delete next.failed[lang];
  }
  for (const field of fields) next.src[field] = sourceHash(todo[field]);
  // A field whose English was removed: drop its translations too.
  for (const field of TRANSLATED_FIELDS) {
    if (typeof product[field] === 'string' && product[field].trim()) continue;
    delete next.src[field];
    for (const lang of TRANSLATED_LANGS) { if (next[lang]) delete next[lang][field]; }
  }
  next.at = new Date().toISOString();
  return next;
}

async function translateInChunks(texts, lang, translate) {
  const results = [];
  let batch = [];
  let size = 0;
  const flush = async () => {
    if (!batch.length) return;
    results.push(...await translate(batch, lang));
    batch = []; size = 0;
  };
  for (const text of texts) {
    if (size + text.length > MAX_REQUEST_CHARS) await flush();
    batch.push(text); size += text.length;
  }
  await flush();
  return results;
}

// A staff correction from the admin: locks the field for that language, or
// (text empty) unlocks it so the next run translates it again.
export function applyCorrection(product, lang, field, text) {
  if (!TRANSLATED_LANGS.includes(lang) || !TRANSLATED_FIELDS.includes(field)) throw new Error('Unknown language or field');
  const i18n = product.i18n || {};
  const next = { ...i18n, locked: { ...(i18n.locked || {}) }, [lang]: { ...(i18n[lang] || {}) } };
  next.locked[lang] = { ...(next.locked[lang] || {}) };
  const value = String(text || '').trim();
  if (value) {
    next[lang][field] = value;
    next.locked[lang][field] = true;
    if (next.failed?.[lang]?.[field]) {
      next.failed = { ...next.failed, [lang]: { ...next.failed[lang] } };
      delete next.failed[lang][field];
    }
  } else {
    delete next[lang][field];
    delete next.locked[lang][field];
    next.src = { ...(next.src || {}) };
    delete next.src[field];                               // forces a fresh translation
  }
  return next;
}

// ---- Google Cloud Translation (Basic, v2) ----

export function googleTranslator(apiKey, fetchImpl = fetch) {
  return async (texts, lang) => {
    const res = await fetchImpl(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: texts, source: 'en', target: lang, format: 'html' }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Google Translate ${res.status}: ${body?.error?.message || 'request failed'}`);
    return (body.data?.translations || []).map(t => t.translatedText);
  };
}

// ---- Running it ----
// One product at a time, in the background; a failure is logged and the next
// sweep tries again. db: { getProductById, getAllProductsRaw, setProductI18n }.
export function createProductTranslator({ db, apiKey = process.env.GOOGLE_TRANSLATE_API_KEY, translate, log = console }) {
  const enabled = Boolean(translate || apiKey);
  const run = translate || (apiKey ? googleTranslator(apiKey) : null);
  const queue = new Set();
  let busy = false;

  async function translateOne(id) {
    const product = await db.getProductById(id);
    if (!product) return false;
    const i18n = await translateProduct(product, run);
    if (!i18n) return false;
    await db.setProductI18n(id, i18n);
    return true;
  }

  async function drain() {
    if (busy) return;
    busy = true;
    try {
      while (queue.size) {
        const id = queue.values().next().value;
        queue.delete(id);
        try {
          if (await translateOne(id)) log.log?.(`🌐 translated product ${id}`);
        } catch (err) {
          log.warn?.(`🌐 translation of product ${id} failed: ${err.message}`);
        }
      }
    } finally {
      busy = false;
    }
  }

  return {
    enabled,
    // After a create or edit. Returns at once; the work happens afterwards.
    queue(id) {
      if (!enabled || !id) return;
      queue.add(String(id));
      setImmediate(() => drain().catch(() => {}));
    },
    // Every product still missing a translation (startup, then every few hours).
    async sweep() {
      if (!enabled) return 0;
      const products = await db.getAllProductsRaw();
      const due = products.filter(p => Object.keys(fieldsToTranslate(p)).length);
      due.forEach(p => queue.add(String(p.id)));
      await drain();
      return due.length;
    },
    translateOne,
  };
}
