// Storefront catalogue data.
// Products are loaded dynamically from MongoDB via /api/products.

import { PESTS_AND_DISEASES } from '../data/allProductsData'

export const CROPS = [
  { id: 'all', name: 'All Crops', icon: 'fa-wheat-awn' },
  { id: 'Paddy/Rice', name: 'Paddy / Rice', icon: 'fa-seedling' },
  { id: 'Wheat', name: 'Wheat', icon: 'fa-wheat-awn' },
  { id: 'Cotton', name: 'Cotton', icon: 'fa-cloud' },
  { id: 'Tomato', name: 'Tomato', icon: 'fa-apple-whole' },
  { id: 'Corn', name: 'Corn / Maize', icon: 'fa-plant-wilt' },
  { id: 'Sugarcane', name: 'Sugarcane', icon: 'fa-cubes-stacked' },
  { id: 'Citrus', name: 'Citrus / Fruits', icon: 'fa-lemon' },
  { id: 'Grapes', name: 'Grapes', icon: 'fa-wine-glass-empty' },
  { id: 'Potato', name: 'Potato', icon: 'fa-circle-dot' },
]

// Sourced from the single canonical taxonomy in src/data/allProductsData.js
// so the homepage catalog dropdown and the /products page "Shop by Pest &
// Disease" tiles can never drift apart again.
export const DISEASES = [
  { id: 'all', name: 'All Diseases & Pests' },
  ...PESTS_AND_DISEASES.map(pest => ({ id: pest.matchValue, name: pest.name }))
]

export const CATEGORIES = ['All', 'Fungicide', 'Insecticide', 'Bio-Stimulant', 'Herbicide', 'Nematicide']

// Fallback product image if product photo fails to load
export const FALLBACK_PRODUCT_IMAGE = '/assets/products/photo-coming-soon.svg'

export function productImage(product) {
  let src = String((product && product.image) || '').trim()
  // Uploads saved as an empty "data:image/png;base64," are not images.
  if (!src || /^data:image\/[\w+.-]+;base64,?$/i.test(src)) src = FALLBACK_PRODUCT_IMAGE
  return src.replace(/^\.\/assets\/(p[1-4])\.png$/, '/assets/$1.webp').replace(/^\.\/assets\//, '/assets/')
}

// Any product or basket image that fails to load shows the placeholder instead of broken-image alt text.
export function useFallbackImage(event) {
  const img = event.currentTarget
  if (img.dataset.fallbackApplied) return
  img.dataset.fallbackApplied = '1'
  img.src = FALLBACK_PRODUCT_IMAGE
}

// Products are managed exclusively via the admin panel and fetched live from the database.
// Empty array fallback — single source of truth from MongoDB.
export const PESTICIDES = []

// `keyword` is matched against a live product's `diseases` tags
// (PhotoScannerModal.jsx -> findRemedyProduct) to recommend a real, in-stock
// product — it is not itself a product id. No product names or doses are
// stored here: the remedy shown is the live product's own name.
export const SAMPLE_DISEASE_DIAGNOSES = [
  {
    keyword: 'blast',
    diseaseName: 'Rice Blast & Sheath Blight',
    cropDetected: 'Paddy / Rice',
    confidence: '98.2%',
    symptoms: 'Spindle-shaped lesions with greyish center and dark brown margin on leaves.',
  },
  {
    keyword: 'whitefly',
    diseaseName: 'Whitefly & Aphid Infestation',
    cropDetected: 'Cotton / Tomato',
    confidence: '94.7%',
    symptoms: 'Yellowing of leaves, sticky honeydew secretion with black sooty mold.',
  },
  {
    keyword: 'blight',
    diseaseName: 'Early / Late Blight',
    cropDetected: 'Tomato / Potato',
    confidence: '96.4%',
    symptoms: 'Dark brown concentric rings on lower leaves.',
  },
]

export const WHATSAPP_EXPERT_URL = 'https://wa.me/918778613372?text=Hello%20Sathyam%20Bio%20Expert%2C%20I%20need%20crop%20advice'

export const rupees = value => `₹${Number(value || 0).toLocaleString('en-IN')}`
