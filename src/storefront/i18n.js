// Storefront translations.
//
// Each language ships as public/js/lang-<code>.js (a plain script that sets
// window.SB_LANG_<CODE>) and is loaded only when it is used. A pack has:
//   keys:     translations for labels rendered with t(key) (marked data-i18n);
//   text:     gettext-style - the English text on the page is the key;
//   patterns: English text with numbers or names in it.
// Text not rendered through t() - product cards, the basket, toasts - is
// translated in place by walking the page (localizeTree), and while a pack is
// active a MutationObserver translates text as React adds or changes it.
// Malayalam and Tulu are listed as "coming soon" until their packs exist.

export const EN_KEYS = {
  topbar_shipping: 'FREE Shipping on Agro Orders over ₹999',
  logo_sub: 'FACTORY 2 FARMER',
  search_placeholder: 'Search by crop, disease or chemical e.g. Blast, Paddy...',
  search_btn: 'Search',
  basket_label: 'Basket',
  nav_all_products: 'All Products',
  hero_title: 'Protect Your Crops.\nMaximize Harvest Yield.',
  hero_desc: 'Order 100% bio-certified fungicides, insecticides, and soil enhancers online. Direct express dispatch.',
  hero_shop_btn: 'Shop Catalog',
  trust_certified: '100% Certified Potency',
  trust_dispatch: 'Same-Day Dispatch',
  trust_whatsapp: 'WhatsApp Support',
  shop_by_category: 'Shop by Category',
  catalog_title: 'Agro Pesticides Store Catalog',
  catalog_subtitle: 'Filter chemicals by target crop, plant disease, or product category',
  filter_title: 'Store Filters',
  filter_crop: 'Filter by Crop',
  filter_disease: 'Filter by Disease / Pest',
  filter_category: 'Category',
  reset_filters: 'Reset All Filters',
  add_to_cart: 'Add to Cart',
  reviews: 'reviews',
  footer_nav: 'Store Categories',
  footer_crops: 'Top Crops',
  footer_help: 'Customer Support',
  footer_copyright: '© 2026 Sathyam Agro Mart. All rights reserved.',
  chatbot_title: 'Sathyam Agro Mart Chat Assistant',
  chat_placeholder: 'Type crop question...',
  chat_welcome: '👋 Welcome to Sathyam Agro Mart Agro Support! How can I assist your crop today?',
  scan_title: 'AI Crop Disease Photo Scanner',
  scan_desc: 'AI will diagnose disease & recommend pesticide',
  advisory_label: 'Account',
  lang_label: 'Language',
  showing_products: 'Showing',
  of_products: 'of',
  products_label: 'products',
  nav_ai_scanner: 'AI Leaf Doctor',
  // Mic buttons: tooltips and screen-reader labels (attributes the page walker skips).
  voice_speak: 'Speak to type',
  voice_stop: 'Stop voice typing',
  voice_listening: 'Listening... tap to stop',
  voice_search_btn: 'Voice Search',
  voice_search: 'Voice search',
  voice_search_stop: 'Stop voice search',
}

const TRANSLATIONS = { en: EN_KEYS }
const LANGUAGE_PACK_GLOBALS = { ta: 'SB_LANG_TA', kn: 'SB_LANG_KN', te: 'SB_LANG_TE', hi: 'SB_LANG_HI' }
export const TEXT_PACKS = {}

function registerLanguagePack(code) {
  const pack = window[LANGUAGE_PACK_GLOBALS[code]]
  if (!pack) return false
  TRANSLATIONS[code] = pack.keys
  TEXT_PACKS[code] = pack
  return true
}

export const LANGUAGES = [
  { code: 'en', native: 'English', english: 'English', glyph: 'A' },
  { code: 'ta', native: 'தமிழ்', english: 'Tamil', glyph: 'த' },
  { code: 'kn', native: 'ಕನ್ನಡ', english: 'Kannada', glyph: 'ಕ' },
  { code: 'te', native: 'తెలుగు', english: 'Telugu', glyph: 'తె' },
  { code: 'hi', native: 'हिन्दी', english: 'Hindi', glyph: 'हि' },
  { code: 'ml', native: 'മലയാളം', english: 'Malayalam', glyph: 'മ' },
  { code: 'tulu', native: 'ತುಳು', english: 'Tulu', glyph: 'ತು' },
]

// Can be chosen: English, or any language with a pack (loaded yet or not).
export const isLanguageReady = code => code === 'en' || Object.hasOwn(LANGUAGE_PACK_GLOBALS, code)
const isLanguageLoaded = code => Boolean(TRANSLATIONS[code])

// Resolves true once the pack is registered, false if it could not be loaded.
const languagePackLoads = {}
export function loadLanguagePack(code) {
  if (isLanguageLoaded(code)) return Promise.resolve(true)
  if (!Object.hasOwn(LANGUAGE_PACK_GLOBALS, code)) return Promise.resolve(false)
  if (registerLanguagePack(code)) return Promise.resolve(true)
  languagePackLoads[code] ||= new Promise(resolve => {
    const script = document.createElement('script')
    script.src = `/js/lang-${code}.js`
    script.onload = () => resolve(registerLanguagePack(code))
    script.onerror = () => {
      // Allow another try later (e.g. once the connection is back).
      delete languagePackLoads[code]
      script.remove()
      resolve(false)
    }
    document.head.append(script)
  })
  return languagePackLoads[code]
}

// Staff portals (admin, employee, delivery, billing) have their own phrases in
// public/js/lang-staff-<code>.js, loaded only on those pages so store visitors
// never download them. They are merged into the store pack for that language.
const STAFF_PACK_GLOBALS = { ta: 'SB_LANG_STAFF_TA', kn: 'SB_LANG_STAFF_KN', te: 'SB_LANG_STAFF_TE', hi: 'SB_LANG_STAFF_HI' }
const staffPackLoads = {}
function mergeStaffPack(code) {
  const staff = window[STAFF_PACK_GLOBALS[code]]
  const pack = TEXT_PACKS[code]
  if (!staff || !pack) return false
  if (!pack.staffMerged) {
    Object.assign(pack.text, staff.text)
    pack.patterns.push(...(staff.patterns || []))
    pack.staffMerged = true
    lowerTextIndex.delete(pack)
    reverseTextIndex.delete(pack)
  }
  return true
}
export function loadStaffLanguagePack(code) {
  if (!Object.hasOwn(STAFF_PACK_GLOBALS, code)) return Promise.resolve(false)
  if (mergeStaffPack(code)) return Promise.resolve(true)
  staffPackLoads[code] ||= new Promise(resolve => {
    const script = document.createElement('script')
    script.src = `/js/lang-staff-${code}.js`
    script.onload = () => resolve(mergeStaffPack(code))
    script.onerror = () => {
      delete staffPackLoads[code]
      script.remove()
      resolve(false)
    }
    document.head.append(script)
  })
  return staffPackLoads[code]
}

// The translation for key, or undefined when no dictionary has it.
export function translationFor(lang, key) {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en
  return dict[key] || TRANSLATIONS.en[key]
}

// The language the page walker translates into.
let currentLang = 'en'
export function setPageLanguage(code) {
  currentLang = code
}

// ---- Untagged page text (gettext-style: the English text is the key) ----
// Leading/trailing punctuation, symbols and emoji stay as written, so
// "🌾 Paddy / Rice", "Password *" and "Forgot password?" share plain keys.
const TEXT_AFFIX = /^([\s\p{P}\p{S}\p{M}‍]*)([\s\S]*?)([\s\p{P}\p{S}]*)$/u
const SKIP_TEXT = 'script, style, noscript, textarea, [data-i18n], .notranslate'
// Text node or element -> { source: English, shown: what we wrote }.
const localizedSources = new WeakMap()

// What a pattern captured ("Search in Brands", "Tailored for Cotton") is
// translated too when the pack has it; names and numbers stay as written.
// Sentences can carry a lower-cased category name, so case is ignored.
const lowerTextIndex = new Map()
function textFor(pack, english) {
  if (english === undefined) return ''
  if (pack.text[english]) return pack.text[english]
  if (!lowerTextIndex.has(pack)) {
    lowerTextIndex.set(pack, new Map(Object.entries(pack.text).map(([key, value]) => [key.toLowerCase(), value])))
  }
  return lowerTextIndex.get(pack).get(english.toLowerCase()) || english
}

function translatePageText(english) {
  const pack = TEXT_PACKS[currentLang]
  if (!pack) return null
  const clean = english.replace(/\s+/g, ' ').trim()
  if (!clean) return null

  let translated = pack.text[clean]
  let before = ''
  let after = ''
  if (!translated) {
    let core
    ;[, before, core, after] = clean.match(TEXT_AFFIX)
    translated = pack.text[core]
    if (!translated) {
      const rule = pack.patterns.find(([pattern]) => pattern.test(core))
      if (rule) translated = core.replace(rule[0], (...match) => rule[1].replace(/\$(\d)/g, (_, group) => textFor(pack, match[group])))
    }
  }
  if (!translated) return null
  const lead = english.match(/^\s*/)[0]
  const trail = english.match(/\s*$/)[0]
  return `${lead}${before}${translated}${after}${trail}`
}

// Returns the English source for a node, noticing when page code has since
// replaced the text we wrote. Text copied from nodes that were already
// translated carries no record, so it is mapped back through the packs.
const reverseTextIndex = new Map()

function englishSource(text) {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean || !/[^ -ɏ -⃏]/.test(clean)) return text
  const [, before, core, after] = clean.match(TEXT_AFFIX)
  for (const pack of Object.values(TEXT_PACKS)) {
    if (!reverseTextIndex.has(pack)) {
      reverseTextIndex.set(pack, new Map(Object.entries(pack.text).map(([english, translated]) => [translated, english])))
    }
    const index = reverseTextIndex.get(pack)
    const exact = index.get(clean)
    const english = exact ? exact : index.get(core) && `${before}${index.get(core)}${after}`
    if (english) return `${text.match(/^\s*/)[0]}${english}${text.match(/\s*$/)[0]}`
  }
  return text
}

function localizedValue(target, current) {
  const record = localizedSources.get(target)
  const source = record && current === record.shown ? record.source : englishSource(current)
  const translated = translatePageText(source)
  if (translated) localizedSources.set(target, { source, shown: translated })
  else localizedSources.delete(target)
  return translated ?? source
}

function localizeTextNode(node) {
  const parent = node.parentElement
  if (!parent || parent.closest(SKIP_TEXT)) return
  // An <option> without a value submits its text; keep submitting English.
  if (parent.tagName === 'OPTION' && !parent.hasAttribute('value')) {
    parent.setAttribute('value', localizedSources.get(node)?.source ?? node.nodeValue.trim())
  }
  const next = localizedValue(node, node.nodeValue)
  if (node.nodeValue !== next) node.nodeValue = next
}

function localizePlaceholder(el) {
  if (el.closest(SKIP_TEXT) || el.hasAttribute('data-i18n-placeholder')) return
  const next = localizedValue(el, el.placeholder)
  if (el.placeholder !== next) el.placeholder = next
}

export function localizeTree(root) {
  if (!root) return
  if (root.nodeType === Node.TEXT_NODE) {
    if (root.nodeValue.trim()) localizeTextNode(root)
    return
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: node => (node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  })
  for (let node = walker.nextNode(); node; node = walker.nextNode()) localizeTextNode(node)
  if (root.matches('[placeholder]')) localizePlaceholder(root)
  root.querySelectorAll('[placeholder]').forEach(localizePlaceholder)
}

// While a non-English pack is active, text that React adds or changes later
// (product cards, basket, toasts) is translated in the same task, before it
// paints. English visitors never run the observer.
let pageTextObserver = null

export function watchPageText(on) {
  if (!on) {
    pageTextObserver?.disconnect()
    pageTextObserver = null
    return
  }
  if (pageTextObserver) return
  pageTextObserver = new MutationObserver(records => {
    records.forEach(record => {
      if (record.type === 'characterData') localizeTree(record.target)
      else record.addedNodes.forEach(localizeTree)
    })
    // Our own writes are not new content.
    pageTextObserver?.takeRecords()
  })
  pageTextObserver.observe(document.body, { childList: true, subtree: true, characterData: true })
}
