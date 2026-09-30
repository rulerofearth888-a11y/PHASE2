// The site copy the admin CMS starts from (pages/admin/CMS.jsx). Saving the
// CMS page stores these values too, so the live database usually holds them
// word for word even though nobody chose them.
//
// The store needs the same list: a field still at its built-in English value
// is not an admin's choice, so a farmer reading Tamil should get the Tamil
// translation there, not English (preferTranslation below).

import { SUPPORT_PHONE } from './phoneLink.js'

export const DEFAULT_CONTENT = {
  // ── Hero ──────────────────────────────────────────────────────────────
  heroBannerTag:     "India's #1 Bio-Pesticide Store",
  heroBannerImage:   'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&q=80',
  heroTitle:         'Grow More. Protect Better. Farm Smarter.',
  heroSubtitle:      "India's most trusted source for premium bio-pesticides, crop protection, and agro-inputs — trusted by 15,000+ farmers.",
  heroShopBtnText:   'Shop Catalog',

  // ── Deal Banner ───────────────────────────────────────────────────────
  dealBannerTitle:   'Kharif Season Sale — Up to 30% Off Paddy & Cotton Essentials',
  dealBannerSubtitle:'Limited stock. Ends midnight tonight. COD available.',

  // ── Trust Strip ───────────────────────────────────────────────────────
  trust1Title:  '100% Bio-Certified',
  trust1Desc:   'Lab-Tested Original Bio-Formulations',
  trust2Title:  'Same-Day Dispatch',
  trust2Desc:   'Express Doorstep Delivery Across India',
  trust3Title:  'Cash On Delivery',
  trust3Desc:   'Pay After Delivery at Your Farm',
  trust4Title:  'WhatsApp Advisory',
  trust4Desc:   '24/7 Advisory from Senior Agronomists',

  // ── Stats Strip ───────────────────────────────────────────────────────
  stat1Number:   '15000',
  stat1Label:    'Farmers Served',
  stat1Sub:      'across 18 Indian states',
  stat2Number:   '48',
  stat2Label:    'Product Formulations',
  stat2Sub:      '100% bio-certified lab tested',
  stat3Number:   '95',
  stat3Label:    '% Dispatch Rate',
  stat3Sub:      'same-day orders fulfilled',
  stat4Number:   '12',
  stat4Label:    'Years of Expertise',
  stat4Sub:      'trusted since 2013',

  // ── Category & Crop Grids ─────────────────────────────────────────────
  categoryGridTitle:    'Shop by Category',
  categoryGridSubtitle: 'Explore crop protection chemicals, bio-stimulants, and soil nutrients',
  cropGridTitle:        'Shop by Crop',
  cropGridSubtitle:     'Select your crop to get customized pesticide & nutrient recommendations',

  // ── Promo Ticker ──────────────────────────────────────────────────────
  banner: '🚜 Free Delivery on orders above ₹999 | Use code KISAN20 for 20% off first order',

  // ── Advisory Newsletter ───────────────────────────────────────────────
  advisoryTitle:  'Get Weekly Crop & Pesticide Recommendations',
  advisoryDesc:   'Join 15,000+ farmers receiving our free seasonal advisory newsletter. Kharif & Rabi crop schedules, disease alerts, and exclusive offers every week.',
  advisoryImage:  'https://images.unsplash.com/photo-1574943320219-553eb213f72d?w=1000&q=80&auto=format&fit=crop',

  // ── Certifications ────────────────────────────────────────────────────
  certificationsTitle:    'Certifications & Recognitions',
  certificationsSubtitle: '',
  certification1Image:    'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=120&q=80',
  certification1Label:    'ICAR Approved',
  certification2Image:    'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=120&q=80',
  certification2Label:    'ISO 9001:2015',
  certification3Image:    'https://images.unsplash.com/photo-1587614382346-4ec70e388b28?w=120&q=80',
  certification3Label:    'Organic India',
  certification4Image:    'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=120&q=80',
  certification4Label:    'GreenTech 2025',
  certification5Image:    'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=120&q=80',
  certification5Label:    'APEDA Member',

  // ── Testimonials ──────────────────────────────────────────────────────
  // Empty: the section only shows testimonials an admin has entered.
  testimonialsTitle:    '',
  testimonialsSubtitle: '',
  testimonial1Quote: '',
  testimonial1Name:  '',
  testimonial1Place: '',
  testimonial1Photo: '',
  testimonial2Quote: '',
  testimonial2Name:  '',
  testimonial2Place: '',
  testimonial2Photo: '',
  testimonial3Quote: '',
  testimonial3Name:  '',
  testimonial3Place: '',
  testimonial3Photo: '',

  // ── Contact & Footer ──────────────────────────────────────────────────
  phone:         SUPPORT_PHONE,
  email:         'support@sathyamagromart.com',
  address:       '14, Kavundampalayam, Coimbatore – 641030, Tamil Nadu',
  footerBrand:   "Sathyam Agro Mart is India's leading digital platform for high-efficacy bio-pesticides, crop protection chemicals, and soil health fertilizers.",
  footerBrandMore: 'Providing 100% bio-certified products with fast express dispatch to 15,000+ farmers across India.',
  whatsappUrl:   '',
  facebookUrl:   'https://www.facebook.com/pradeep.sathyambio.7/',
  youtubeUrl:    '',
  instagramUrl:  'https://www.instagram.com/sathyambio/',
}

// Indian scripts the store translates into: Devanagari (hi), Tamil, Telugu,
// Kannada. A translation in one of them is a real translation, not the
// English fallback.
const INDIAN_SCRIPT = /[\u0900-\u097F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF]/

/**
 * The CMS value for `key` normally wins. It gives way to `translated` only
 * when the value is still the built-in English default and `translated` is an
 * actual Indian-language string - so English pages never change, and any text
 * an admin has really typed always shows as typed.
 */
export function preferTranslation(key, value, translated) {
  if (!value) return translated
  if (translated && INDIAN_SCRIPT.test(translated) && value === (DEFAULT_CONTENT[key] || '').trim()) return translated
  return value
}
