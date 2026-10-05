// A product's text in the farmer's language: the machine (or staff-corrected)
// translation from server/productTranslate.js when there is one, else the
// English as typed in the admin. No React: tested under node --test.
export function productText(product, field, lang) {
  const english = product?.[field] || ''
  if (!lang || lang === 'en') return english
  const translated = product?.i18n?.[lang]?.[field]
  return typeof translated === 'string' && translated.trim() ? translated : english
}
