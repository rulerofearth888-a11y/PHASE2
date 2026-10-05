import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { 
  Search, ShoppingCart, Heart, Star, ChevronLeft, ChevronRight, 
  Filter, Check, ArrowRight, PhoneCall, Headphones, Sparkles, 
  Sprout, X, ShieldCheck, Truck, RefreshCw, Layers, Grid, Home, Leaf, ShoppingBag, Globe, User
} from 'lucide-react'
import { useBasket, useCheckoutActions } from '../hooks/useCheckout'
import { useAuth } from '../context/AuthContext'
import useCatalogProducts from '../hooks/useCatalogProducts'
import { hasPrice } from '../shared/comingSoon'
import { packMrp, packPrice } from '../shared/packPricing'
import { cacheWishlistIds, cacheWishlistItem, cachedWishlistIds, wishlistIdsFrom, wishlistVisitorId } from '../shared/wishlist'
import { dedupeCropLabels, isSameCrop, matchesCrop, matchesCategory, matchesDisease, normalizeCrop, topSelling } from '../utils/catalogUtils'
import { ALL_CROPS, cropList } from '../shared/profileFieldRules'
import { PRODUCT_FORMS, formCounts, matchesForm, productForm } from '../shared/productForm'
import axios from 'axios'
import {
  SHOP_CATEGORIES,
  CROPS_LIST,
  PESTS_AND_DISEASES,
  NUTRIENTS_LIST,
  EXTRA_CATEGORY_ICONS,
  FALLBACK_CATEGORY_ICON,
} from '../data/allProductsData'

// The farmer's own crop this product is for, if any (a farmer can grow up to six).
const myCropFor = (user, prod) => cropList(user?.crop).find(crop => crop !== ALL_CROPS && matchesCrop(prod.crops, crop))

// One screenful of catalogue cards. The grid grows by this as it is scrolled.
const CATALOG_PAGE = 24
// The numbered chart at the top of /products. "Best Selling" carries on from here.
const TOP_PICKS = 10

// One rule per filter, used both by the grid below and by the browse rails
// above it, so a tile is shown exactly when tapping it would find something.
// They were written out inside the grid's filter before; keeping one copy is
// what stops a rail from offering a crop or a pest that leads to an empty page.
const matchesCategoryFilter = (product, category) => (
  matchesCategory(product.category, category)
  || (category === 'Offers' && product.discount >= 20)
  || (category === 'Urban Gardening' && (matchesCategory(product.category, 'Seeds') || matchesCategory(product.category, 'Crop Nutrition')))
)
const matchesCropFilter = (product, crop) => matchesCrop(product.crops, crop)
const matchesDiseaseFilter = (product, disease) => (
  matchesDisease(product.diseases, disease)
  || product.name.toLowerCase().includes(String(disease).toLowerCase())
)
const matchesNutrientFilter = (product, nutrient) => {
  const keywords = NUTRIENTS_LIST.find(n => n.name === nutrient)?.matchKeywords || []
  if (keywords.length) {
    const haystack = `${product.name} ${product.description || ''} ${product.category || ''}`.toLowerCase()
    return keywords.some(k => haystack.includes(k))
  }
  return matchesCategory(product.category, 'Crop Nutrition')
    || product.name.toLowerCase().includes('nutrient')
    || product.name.toLowerCase().includes('humic')
}

export default function AllProducts() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  // Any product card opens its product page. Clicks that land on a control
  // inside the card (add to cart, wishlist, size dropdown, inner links) keep
  // their own behaviour, and text selection never counts as a click.
  const cardOpenProps = (productId, productName) => ({
    role: 'link',
    tabIndex: 0,
    'aria-label': `View ${productName}`,
    style: { cursor: 'pointer' },
    onClick: event => {
      if (event.target.closest('button, a, input, select, textarea, label')) return
      if (window.getSelection && String(window.getSelection()).length) return
      navigate(`/product/${encodeURIComponent(productId)}`)
    },
    onKeyDown: event => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      if (event.target !== event.currentTarget) return
      event.preventDefault()
      navigate(`/product/${encodeURIComponent(productId)}`)
    }
  })

  // Active filters from URL query parameters
  const initialCategory = searchParams.get('category') || ''
  const initialCrop = searchParams.get('crop') || ''
  const initialDisease = searchParams.get('disease') || ''
  const initialSearch = searchParams.get('search') || ''

  const [activeCategory, setActiveCategory] = useState(initialCategory)
  const [activeCrop, setActiveCrop] = useState(initialCrop)
  const [activeDisease, setActiveDisease] = useState(initialDisease)
  const [activeNutrient, setActiveNutrient] = useState('')
  const [activeForm, setActiveForm] = useState(searchParams.get('form') || '')
  const [searchQuery, setSearchQuery] = useState(initialSearch)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [sortBy, setSortBy] = useState('popular')
  // The pest row is a side-scroller; "View All" opens every tile instead.
  const [showAllPests, setShowAllPests] = useState(false)
  // How many catalogue cards are built right now. Painting all 78 up front is
  // most of the wait on this page; the rest follow as they are scrolled to.
  const [visibleCount, setVisibleCount] = useState(CATALOG_PAGE)
  const sentinelRef = useRef(null)

  // Real-time SSOT catalog loaded from MongoDB and synchronized across open tabs
  const {
    products: dbProducts,
    catalogOptions,
    loading: loadingProducts
  } = useCatalogProducts({
    userId: user?.id,
    onlineOnly: true
  })
  // The built-in six plus any an admin has added on a product
  // (server catalogOptions.physicalForms; src/shared/productForm.js).
  const formOptions = catalogOptions?.physicalForms?.length ? catalogOptions.physicalForms : PRODUCT_FORMS

  // Selected pack sizes for products: { [productId]: sizeString }
  const [selectedSizes, setSelectedSizes] = useState({})
  // Wishlist set of product IDs
  const [wishlist, setWishlist] = useState(() => new Set(cachedWishlistIds()))
  // The cache draws the hearts at once; the server's list (which also holds
  // hearts set on a product page or another device) then replaces it.
  useEffect(() => {
    let cancelled = false
    axios.get(`/api/wishlist?${new URLSearchParams({ visitorId: wishlistVisitorId() })}`)
      .then(({ data }) => {
        if (cancelled || !data?.success) return
        const ids = wishlistIdsFrom(data.data)
        cacheWishlistIds(ids)
        setWishlist(new Set(ids))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [user?.id])

  // The store's one basket (hooks/useCheckout.js): shared with every page and
  // opened as the floating checkout.
  const { count: cartCount } = useBasket()
  const { addItem, openBasket } = useCheckoutActions()

  // Toast notification
  const [toastMessage, setToastMessage] = useState('')
  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 3200)
  }

  // Quick advisory modal

  // Scroll references for carousels
  const top10ScrollRef = useRef(null)
  const cropsScrollRef = useRef(null)
  const offersScrollRef = useRef(null)
  const pestsScrollRef = useRef(null)
  const nutrientsScrollRef = useRef(null)
  const growthScrollRef = useRef(null)
  const catalogSectionRef = useRef(null)

  const scrollCarousel = (ref, direction) => {
    if (ref.current) {
      const scrollAmount = direction === 'left' ? -320 : 320
      ref.current.scrollBy({ left: scrollAmount, behavior: 'smooth' })
    }
  }

  // The URL owns the filters. This mirrors it into state on every change and,
  // just as importantly, clears a filter the URL no longer carries - otherwise
  // a stale category or crop stays applied after navigating back to /products.
  useEffect(() => {
    setActiveCategory(searchParams.get('category') || '')
    setActiveCrop(searchParams.get('crop') || '')
    setActiveDisease(searchParams.get('disease') || '')
    setActiveNutrient(searchParams.get('nutrient') || '')
    setActiveForm(searchParams.get('form') || '')
    setSearchQuery(searchParams.get('search') || '')
  }, [searchParams])

  // Keep the card state and the server-backed Wishlist page in sync. The
  // sign-in token (added to every request by AuthContext) wins over the
  // guest id on the server.
  const toggleWishlist = async (productId, productName) => {
    const saved = !wishlist.has(productId)
    setWishlist(prev => {
      const next = new Set(prev)
      if (saved) next.add(productId)
      else next.delete(productId)
      return next
    })
    cacheWishlistItem(productId, saved)
    try {
      await axios.post('/api/wishlist', { productId, productName, saved, visitorId: wishlistVisitorId() })
      showToast(saved ? `Added "${productName}" to Wishlist ❤️` : `Removed "${productName}" from Wishlist`)
    } catch {
      setWishlist(prev => {
        const next = new Set(prev)
        if (saved) next.delete(productId)
        else next.add(productId)
        return next
      })
      cacheWishlistItem(productId, !saved)
      showToast('Could not update Wishlist. Please try again.')
    }
  }

  // Handle pack size change
  const handleSizeChange = (productId, newSize) => {
    setSelectedSizes(prev => ({
      ...prev,
      [productId]: newSize
    }))
  }

  // Add to cart: one more of this product in its pack size. The price shown
  // here is for the basket only; the server prices the order again.
  const handleAddToCart = (product, explicitSize = null) => {
    // Not priced yet ("Price coming soon"): its page, not the basket.
    if (!hasPrice(product)) {
      navigate(`/product/${encodeURIComponent(product.id)}`)
      return
    }
    const currentSize = explicitSize || selectedSizes[product.id] || product.selectedSize || product.sizes?.[0]?.size || 'Standard'
    const sizeObj = product.sizes?.find(s => s.size === currentSize)
    addItem({
      id: product.id,
      name: product.name,
      brand: product.brand,
      price: Number(sizeObj?.price || product.price) || 0,
      originalPrice: sizeObj?.originalPrice || product.originalPrice,
      selectedPack: currentSize,
      image: product.image,
    })
    showToast(`Added ${product.name.slice(0, 24)}... (${currentSize}) to Basket! 🛒`)
  }

  // "Top 10 Picks by Farmers" is now what farmers actually bought most, rather
  // than the first ten products the database happened to return.
  const top10PicksList = useMemo(() => {
    return (topSelling(dbProducts, TOP_PICKS) || dbProducts.slice(0, TOP_PICKS)).map((p, idx) => ({
      ...p,
      rank: idx + 1,
      rankBg: '#15803d',
      tagBg: '#dcfce7',
      tagColor: '#166534',
      tagIcon: '🌿',
      tag: p.category || 'Bio',
      title: p.name,
      sizes: Array.isArray(p.packSizes) ? p.packSizes : ['500g'],
      reviews: p.reviewsCount || 0
    }))
  }, [dbProducts])

  const todaysOffersList = useMemo(() => {
    // A product not priced yet is no offer.
    return dbProducts.filter(p => hasPrice(p) && (p.discount || (p.originalPrice && p.originalPrice > p.price))).map(p => ({
      ...p,
      sizes: (Array.isArray(p.packSizes) ? p.packSizes : ['Standard']).map(size => ({
        size,
        price: p.price,
        originalPrice: p.originalPrice || p.price,
        save: Math.max(0, (p.originalPrice || p.price) - p.price)
      }))
    }))
  }, [dbProducts])

  // "Best Selling" rendered BEST_SELLING from src/data/allProductsData.js,
  // which is a fixed empty array - so the section has always been a heading,
  // a subtitle and a "View All" above an empty carousel, on every device. It
  // shows the catalogue's real best sellers now, most sold first - starting
  // where the Top 10 chart above it stops, so the same product never appears
  // twice on one page - and stands down when there are none left to show.
  // The card in that carousel reads prod.sizes, which a raw catalogue product
  // does not carry - the neighbouring rails all build it. Same shape here.
  const bestSellingList = useMemo(
    () => (topSelling(dbProducts, TOP_PICKS + 8)?.slice(TOP_PICKS)
      || dbProducts.filter(p => p.badge === 'Best Seller' || p.badge === '100% Organic' || p.rating >= 4.8).slice(0, 8))
      .map(p => ({
        ...p,
        sizes: (Array.isArray(p.packSizes) && p.packSizes.length ? p.packSizes : ['Standard']).map(size => ({
          size: typeof size === 'object' ? size.size : size,
          price: p.price,
          originalPrice: p.originalPrice || p.price,
          save: Math.max(0, (p.originalPrice || p.price) - p.price),
        })),
      })),
    [dbProducts],
  )

  const growthPromotersList = useMemo(() => {
    return dbProducts.filter(p => (p.category || '').toLowerCase().includes('growth') || (p.category || '').toLowerCase().includes('bio-stimulant')).map(p => ({
      ...p,
      sizes: (Array.isArray(p.packSizes) ? p.packSizes : ['Standard']).map(size => ({
        size,
        price: p.price,
        originalPrice: p.originalPrice || p.price,
        save: Math.max(0, (p.originalPrice || p.price) - p.price)
      }))
    }))
  }, [dbProducts])


  // A browse tile is only worth showing when it leads somewhere. The registry
  // behind these lists (/api/catalog-options) is append-only and the built-in
  // lists are fixed, so both carry crops and pests no product has any more -
  // tapping one landed on "0 products" with nothing to explain it. Everything
  // is offered until the catalogue has loaded, or the rails would pop in.
  const hasProductFor = useMemo(() => {
    if (!dbProducts.length) return () => true
    return (value, matches) => dbProducts.some(product => matches(product, value))
  }, [dbProducts])

  // Dynamic categories merging admin categories with default shop categories
  const dynamicCategories = useMemo(() => {
    const adminCats = catalogOptions?.categories || []
    // A tile already covers an admin category when its filter would list those
    // products (aliases included): "Fertilizer" is Nutrients' Crop Nutrition,
    // and used to get a second tile of its own showing the same products.
    const covered = cat => SHOP_CATEGORIES.some(c => matchesCategory(cat, c.filterCategory))

    const customAdminItems = adminCats
      .filter(cat => cat && cat !== 'All' && !covered(cat))
      .map(cat => ({
        id: `admin-cat-${cat.toLowerCase().replace(/\s+/g, '-')}`,
        name: cat,
        filterCategory: cat,
        bg: '#ecfdf5',
        border: '#a7f3d0',
        textColor: '#047857',
        image: EXTRA_CATEGORY_ICONS[cat.toLowerCase()] || FALLBACK_CATEGORY_ICON
      }))

    return [...SHOP_CATEGORIES, ...customAdminItems]
      .filter(cat => hasProductFor(cat.filterCategory, matchesCategoryFilter))
  }, [catalogOptions?.categories, hasProductFor])

  // The filter pill bar (flat text buttons, unlike the illustrated rail above)
  // reads the same merged, admin-aware list - deduped on filterCategory, since
  // the rail can carry two tiles for one filter (Sprayers and Farm Machinery
  // both mean Equipments) which would otherwise show as two identical pills.
  const categoryPills = useMemo(() => {
    const seen = new Set()
    const pills = [{ label: 'All Products', value: '' }]
    for (const cat of dynamicCategories) {
      const key = cat.filterCategory.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      pills.push({ label: cat.filterCategory, value: cat.filterCategory })
    }
    return pills
  }, [dynamicCategories])

  // Dynamic crops merging admin-added crops with default list
  const dynamicCropsList = useMemo(() => {
    // dedupeCropLabels first: the registry holds "Corn" beside "Corn / Maize"
    // and "Paddy/Rice" beside "Paddy / Rice", which are one crop each.
    const adminCrops = dedupeCropLabels(catalogOptions?.crops || [])
    const existing = new Set(CROPS_LIST.map(c => normalizeCrop(c.cropCode)))
    const customAdminItems = adminCrops
      .filter(crop => crop && crop !== 'all' && crop !== 'All Crops' && !existing.has(normalizeCrop(crop)))
      .map(crop => ({
        id: `admin-crop-${normalizeCrop(crop).replace(/\//g, '-')}`,
        name: crop,
        cropCode: crop,
        image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=200&q=80',
        popularIssues: 'Crop Protection & Health'
      }))
    // Drop the tiles that lead nowhere FIRST, then keep one tile per crop: the
    // built-in "Paddy" and the registry's "Paddy / Rice" are the same crop and
    // select the same products, and the built-in tile - the one with a real
    // picture and its common pests - is the one worth keeping. Order matters.
    // The built-in Maize tile carries cropCode "Maize", which matches no
    // product tagged "Corn", so deduping first let a dead tile swallow the
    // live "Corn / Maize" and the crop disappeared from the rail altogether.
    const live = [...CROPS_LIST, ...customAdminItems]
      .filter(crop => hasProductFor(crop.cropCode, matchesCropFilter))
    const merged = []
    for (const crop of live) {
      if (!merged.some(kept => isSameCrop(kept.cropCode, crop.cropCode))) merged.push(crop)
    }
    return merged
  }, [catalogOptions?.crops, hasProductFor])

  // Dynamic pest/disease tiles merging admin-added diseases with the default list
  const dynamicDiseaseList = useMemo(() => {
    const adminDiseases = catalogOptions?.diseases || []
    const existing = new Set(PESTS_AND_DISEASES.map(p => p.matchValue.toLowerCase()))
    const customAdminItems = adminDiseases
      .filter(disease => disease && !existing.has(String(disease).toLowerCase()))
      .map(disease => ({
        id: `admin-disease-${String(disease).toLowerCase().replace(/\s+/g, '-')}`,
        name: disease,
        matchValue: disease,
        image: 'https://images.unsplash.com/photo-1585314062340-f1a5a7c9328d?w=240&auto=format&fit=crop&q=80',
        cureCategory: ''
      }))
    return [...PESTS_AND_DISEASES, ...customAdminItems]
      .filter(pest => hasProductFor(pest.matchValue, matchesDiseaseFilter))
  }, [catalogOptions?.diseases, hasProductFor])

  // The nutrient rail is a fixed list, and just as able to point at nothing.
  const dynamicNutrientsList = useMemo(
    () => NUTRIENTS_LIST.filter(nut => hasProductFor(nut.name, matchesNutrientFilter)),
    [hasProductFor],
  )

  // Filter and sort catalog
  // A filter change starts the grid again from the first screenful, otherwise
  // a narrow result would inherit a count grown by scrolling the wide one.
  useEffect(() => {
    setVisibleCount(CATALOG_PAGE)
  }, [activeCategory, activeCrop, activeDisease, activeNutrient, activeForm, searchQuery, sortBy])

  const filteredProducts = useMemo(() => {
    let list = [...dbProducts]

    if (activeCategory) {
      list = list.filter(p => matchesCategoryFilter(p, activeCategory))
    }

    if (activeCrop) {
      list = list.filter(p => matchesCropFilter(p, activeCrop))
    }

    if (activeDisease) {
      list = list.filter(p => matchesDiseaseFilter(p, activeDisease))
    }

    if (activeNutrient) {
      list = list.filter(p => matchesNutrientFilter(p, activeNutrient))
    }

    if (activeForm) {
      list = list.filter(p => matchesForm(p, activeForm, formOptions))
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(p => 
        p.name.toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        p.crops?.some(c => c.toLowerCase().includes(q)) ||
        p.diseases?.some(d => d.toLowerCase().includes(q))
      )
    }

    if (sortBy === 'price-low') {
      list.sort((a, b) => a.price - b.price)
    } else if (sortBy === 'price-high') {
      list.sort((a, b) => b.price - a.price)
    } else if (sortBy === 'discount') {
      list.sort((a, b) => (b.discount || 0) - (a.discount || 0))
    } else if (sortBy === 'rating') {
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0))
    }

    return list
  }, [dbProducts, activeCategory, activeCrop, activeDisease, activeNutrient, activeForm, formOptions, searchQuery, sortBy])

  const formCountsAll = useMemo(() => formCounts(dbProducts, formOptions), [dbProducts, formOptions])

  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleCount),
    [filteredProducts, visibleCount],
  )
  const hasMore = visibleCount < filteredProducts.length

  // The sentinel sits under the last card; reaching it builds the next
  // screenful. Without IntersectionObserver every product is rendered at once,
  // which is what this page did before - slower, never broken.
  useEffect(() => {
    if (!hasMore) return undefined
    if (typeof IntersectionObserver === 'undefined') {
      setVisibleCount(filteredProducts.length)
      return undefined
    }
    const node = sentinelRef.current
    if (!node) return undefined
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisibleCount(count => Math.min(count + CATALOG_PAGE, filteredProducts.length))
      }
    }, { rootMargin: '600px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, filteredProducts.length])

  // Quick filter handlers that scroll down to catalog if filtered
  // Picking a browse tile (category, crop, pest, nutrient) starts a fresh
  // view: the other filters reset, so the shopper never lands on an empty
  // grid because an earlier crop or search was still applied. Clicking the
  // active tile again clears it. Everything goes through the URL, so the
  // chips, the grid, the address bar and a refresh always agree.
  const applyBrowseFilter = (name, value) => {
    const next = new URLSearchParams()
    if (value) next.set(name, value)
    setSearchParams(next)
    // Going from "no query string" to "no query string" is not a navigation,
    // so the effect above never re-runs. A search typed straight into the box
    // lives only in state and has to be cleared by hand, or it stays applied
    // while no chip shows it.
    setSearchQuery('')
    if (value && catalogSectionRef.current) {
      catalogSectionRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const selectCategory = (cat) => {
    const same = Boolean(cat) && activeCategory.toLowerCase() === String(cat).toLowerCase()
    applyBrowseFilter('category', same ? '' : cat)
  }

  const selectCrop = (cropName) => {
    const same = activeCrop && normalizeCrop(activeCrop) === normalizeCrop(cropName)
    applyBrowseFilter('crop', same ? '' : cropName)
  }

  const selectDisease = (diseaseCode) => {
    const same = activeDisease.toLowerCase() === String(diseaseCode).toLowerCase()
    applyBrowseFilter('disease', same ? '' : diseaseCode)
  }

  // Form narrows whatever is showing (a category, a crop...) instead of
  // starting a fresh view, so it keeps the other filters in the URL.
  const selectForm = (form) => {
    const next = new URLSearchParams(searchParams)
    if (!form || activeForm.toLowerCase() === form.toLowerCase()) next.delete('form')
    else next.set('form', form)
    setSearchParams(next)
  }

  const selectNutrient = (nutName) => {
    const same = activeNutrient.toLowerCase() === String(nutName).toLowerCase()
    applyBrowseFilter('nutrient', same ? '' : nutName)
  }

  // Typing a search starts a fresh view, exactly like picking a browse tile:
  // a category, crop, pest or nutrient left over from browsing is dropped, so
  // the search never lands on an empty grid because of a filter the shopper
  // had stopped thinking about. The query always goes into the URL - it is the
  // one source of truth the chips, the grid, a refresh and the header's own
  // search box all read - replacing the history entry, so typing never fills
  // the back button.
  const handleSearchChange = (value) => {
    setSearchQuery(value)
    const next = new URLSearchParams()
    if (value) next.set('search', value)
    setSearchParams(next, { replace: true })
  }

  const clearAllFilters = () => {
    setSearchParams(new URLSearchParams())
    setSearchQuery('')
    setMobileSearchOpen(false)
    setSortBy('popular')
  }

  // Removing one chip keeps the rest of the filters intact.
  const removeFilter = (name) => {
    const next = new URLSearchParams(searchParams)
    next.delete(name)
    setSearchParams(next)
    if (name === 'search') {
      setSearchQuery('')
      setMobileSearchOpen(false)
    }
  }

  // Get active size info for a product with custom pack prices
  const getProductActiveSize = (product) => {
    const packSizes = Array.isArray(product.packSizes) && product.packSizes.length > 0
      ? product.packSizes.map(s => typeof s === 'object' ? s.size : s)
      : (Array.isArray(product.sizes) ? product.sizes.map(s => typeof s === 'object' ? s.size : s) : [product.selectedPack || 'Standard'])
    
    const selectedSizeName = selectedSizes[product.id] || product.selectedSize || product.selectedPack || packSizes[0] || 'Standard'
    
    const price = packPrice(product, selectedSizeName, product.selectedPack || packSizes[0])
    const orig = packMrp(product, selectedSizeName, price)

    const finalPrice = Number(price) || 0
    const finalOrig = Number(orig) || 0
    
    return {
      size: selectedSizeName,
      price: finalPrice,
      originalPrice: finalOrig > finalPrice ? finalOrig : null,
      save: finalOrig > finalPrice ? finalOrig - finalPrice : 0
    }
  }

  return (
    <div className="all-products-page">
      {/* Toast popup */}
      {toastMessage && (
        <div className="shop-toast-notification">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* MOBILE TOP HEADER (BigHaat / Sathyam Agro Mart app style matching screenshot 1) */}
      <header className="mobile-shop-header mobile-only-header">
        <div className="mobile-shop-top-row">
          <Link to="/" className="mobile-shop-brand">
            <span className="brand-leaf-icon"><Sprout size={20} /></span>
            <div className="brand-text-block">
              <strong>SATHYAM AGRO MART</strong>
              <small>Agro Store</small>
            </div>
          </Link>

          <div className="mobile-shop-header-actions">
            <button 
              type="button" 
              className="mobile-lang-badge" 
              onClick={() => showToast('Languages: English, Tamil, Telugu, Kannada')}
            >
              <Globe size={14} />
              <span>English</span>
              <span className="down-arrow">▾</span>
            </button>

            <button 
              type="button" 
              className="mobile-header-icon-btn"
              onClick={() => setMobileSearchOpen(prev => !prev)}
              aria-label="Search"
            >
              <Search size={20} />
            </button>

            <Link to="/#login" className="mobile-header-icon-btn" aria-label="Account">
              <User size={20} />
            </Link>

            <a href="#basket" className="mobile-header-icon-btn mobile-cart-icon-btn" data-checkout-open onClick={openBasket} aria-label="Cart">
              <ShoppingCart size={20} />
              {cartCount > 0 && <span className="mobile-cart-badge">{cartCount}</span>}
            </a>
          </div>
        </div>

        {/* Mobile Search input dropdown */}
        {/* Always shown on phones: the shared header row has no search toggle. */}
        {(
          <div className="mobile-shop-search-expand">
            <div className="mobile-search-input-wrap">
              <Search size={16} className="search-icon-dim" />
              <input 
                type="text"
                placeholder="Search crop, chemical, disease e.g. Blast, Tomato..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                autoFocus={mobileSearchOpen}
              />
              {searchQuery && (
                <button type="button" onClick={() => removeFilter('search')} className="search-clear-btn">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* MAIN CONTENT WRAPPER */}
      <main className="shop-main-container">

        {/* 1. CATEGORIES CIRCULAR ROW (Matching Image 1 & Mobile Screenshot 1) */}
        {dynamicCategories.length > 0 && (
          <section className="shop-section shop-categories-section">
            <div className="section-header-row">
              <h2 className="section-title">Categories</h2>
              <Link to="/categories" className="view-all-link">View All</Link>
            </div>

            <div className="categories-circular-grid">
              {dynamicCategories.map(cat => {
                const isSelected = activeCategory && cat.filterCategory && activeCategory.toLowerCase() === cat.filterCategory.toLowerCase()
                return (
                  <button
                    key={cat.id}
                    type="button"
                    className={`category-circle-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => selectCategory(cat.filterCategory)}
                  >
                    <div 
                      className="category-circle-avatar" 
                      style={{ backgroundColor: cat.bg, borderColor: cat.border }}
                    >
                      {cat.iconText ? (
                        <span className="category-percent-icon" style={{ color: cat.textColor }}>{cat.iconText}</span>
                      ) : (
                        <img 
                          src={cat.image} 
                          alt={cat.name} 
                          loading="lazy"
                          onError={(e) => {
                            e.target.onerror = null
                            e.target.src = 'https://media.bighaat.com/categories/Offers_icon.webp'
                          }}
                        />
                      )}
                    </div>
                    <span className="category-circle-label">{cat.name}</span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* 2. TOP 10 PICKS BY FARMERS (Matching Image 2 & Mobile Screenshot 1) */}
        {top10PicksList.length > 0 && (
        <section className="shop-section top10-picks-section">
          <div className="top10-banner-header">
            <div className="top10-trophy-badge">
              <span className="trophy-symbol">🏆</span>
              <span className="trophy-text">10 TOP</span>
            </div>
            <div className="top10-text-block">
              <h2 className="top10-title">Top 10 Picks by Farmers</h2>
              <p className="top10-subtitle">Find the best picks from the fields</p>
            </div>
          </div>

          <div className="top10-carousel-wrapper">
            <div className="top10-cards-track" ref={top10ScrollRef}>
              {top10PicksList.map(item => {
                return (
                  <div key={item.rank} className="top10-product-card" {...cardOpenProps(item.id, item.title)}>
                    {/* Top row: Rank number & Category Pill */}
                    <div className="top10-card-header">
                      <div className="top10-rank-circle" style={{ backgroundColor: item.rankBg }}>
                        {item.rank}
                      </div>
                      <div 
                        className="top10-tag-pill" 
                        style={{ backgroundColor: item.tagBg, color: item.tagColor }}
                      >
                        <span className="tag-icon">{item.tagIcon}</span>
                        <span>{item.tag}</span>
                      </div>
                    </div>

                    {/* Image */}
                    <div className="top10-card-image-box">
                      <img 
                        src={item.image} 
                        alt={item.title} 
                        loading="lazy"
                        onError={(e) => {
                          e.target.onerror = null
                          e.target.src = '/assets/products/photo-coming-soon.svg'
                        }}
                      />
                    </div>

                    {/* Title */}
                    <h3 className="top10-card-title" title={item.title}>
                      {item.title}
                    </h3>

                    {/* Price & Action */}
                    <div className="top10-card-footer">
                      <div className="top10-price-box">
                        <strong className="price-curr">{hasPrice(item) ? `₹${item.price}` : 'Price coming soon'}</strong>
                        {item.originalPrice && (
                          <span className="price-orig">₹{item.originalPrice}</span>
                        )}
                      </div>
                      <button 
                        type="button" 
                        className="top10-quick-add"
                        onClick={() => handleAddToCart(item)}
                        title={hasPrice(item) ? 'Add to Basket' : 'View details'}
                      >
                        {hasPrice(item) ? '+ Add' : 'View'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop Left/Right navigation arrows */}
            <div className="carousel-nav-arrows">
              <button 
                type="button" 
                className="carousel-arrow-btn" 
                onClick={() => scrollCarousel(top10ScrollRef, 'left')}
                aria-label="Previous"
              >
                <ChevronLeft size={20} />
              </button>
              <button 
                type="button" 
                className="carousel-arrow-btn" 
                onClick={() => scrollCarousel(top10ScrollRef, 'right')}
                aria-label="Next"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </section>
        )}

        {/* 3. SHOP BY CROP 🌾 (Matching Image 3 & Mobile Screenshot 2) */}
        {dynamicCropsList.length > 0 && (
          <section className="shop-section shop-by-crop-section">
            <div className="section-header-row">
              <div>
                <h2 className="section-title">Shop By Crop 🌾</h2>
                <p className="section-subtitle">Get solutions customized for your crops.</p>
              </div>
              <Link to="/crops" className="view-all-link">View All</Link>
            </div>

            <div className="crops-scroll-container" ref={cropsScrollRef}>
              {dynamicCropsList.map(crop => {
                const isSelected = activeCrop && normalizeCrop(activeCrop) === normalizeCrop(crop.cropCode)
                return (
                  <button
                    key={crop.id}
                    type="button"
                    className={`crop-circle-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => selectCrop(crop.cropCode)}
                  >
                    <div className="crop-circle-avatar">
                      <img 
                        src={crop.image} 
                        alt={crop.name} 
                        loading="lazy"
                        onError={(e) => {
                          e.target.onerror = null
                          e.target.src = 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=200&q=80'
                        }}
                      />
                    </div>
                    <span className="crop-circle-label">{crop.name}</span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* 4. TODAY'S OFFER ⚡ (Matching Image 3 & Mobile Screenshot 2) */}
        {todaysOffersList.length > 0 && (
        <section className="shop-section todays-offers-section">
          <div className="section-header-row">
            <div>
              <h2 className="section-title">Today's Offer ⚡</h2>
              <p className="section-subtitle">Best prices available today.</p>
            </div>
            <button type="button" className="view-all-link" onClick={() => selectCategory('Offers')}>View All</button>
          </div>

          <div className="offers-scroll-wrapper">
            <div className="product-cards-carousel" ref={offersScrollRef}>
              {todaysOffersList.map(prod => {
                const activeSize = getProductActiveSize(prod)
                const isWishlisted = wishlist.has(prod.id)

                return (
                  <div key={prod.id} className="agro-product-card" {...cardOpenProps(prod.id, prod.name)}>
                    {/* Top Badges: Discount Tag + Wishlist Heart */}
                    <div className="card-top-bar">
                      <span className="discount-tag">{prod.discount}</span>
                      <button 
                        type="button" 
                        className={`wishlist-heart-btn ${isWishlisted ? 'active' : ''}`}
                        onClick={() => toggleWishlist(prod.id, prod.name)}
                        aria-label="Add to Wishlist"
                      >
                        <Heart size={18} fill={isWishlisted ? '#ef4444' : 'none'} color={isWishlisted ? '#ef4444' : '#64748b'} />
                      </button>
                    </div>

                    {/* Product Image */}
                    <div className="card-image-box">
                      <Link to={`/product/${encodeURIComponent(prod.id)}`} aria-label={`View ${prod.name}`}>
                        <img 
                          src={prod.image} 
                          alt={prod.name} 
                          loading="lazy"
                          onError={(e) => {
                            e.target.onerror = null
                            e.target.src = '/assets/products/photo-coming-soon.svg'
                          }}
                        />
                      </Link>
                    </div>

                    {/* Star Rating Badge */}
                    {/* Only real reviews: a "★ | 0" badge told farmers nothing. */}
                    {Number(prod.reviewsCount) > 0 && (
                      <div className="card-rating-badge">
                        <span>{prod.rating} ★</span>
                        <span className="rating-divider">|</span>
                        <span>{prod.reviewsCount}</span>
                      </div>
                    )}

                    {/* High Demand banner if present */}
                    {prod.tagBadge ? (
                      <div className="card-high-demand-banner">
                        {prod.tagBadge}
                      </div>
                    ) : (
                      <div className="card-high-demand-placeholder" />
                    )}

                    {/* Title & Brand */}
                    <h3 className="card-product-title" title={prod.name}>
                      <Link to={`/product/${encodeURIComponent(prod.id)}`}>
                        {prod.name}
                      </Link>
                    </h3>
                    <p className="card-brand-name">{[prod.brand, productForm(prod, formOptions)].filter(Boolean).join(' · ')}</p>

                    {/* Price and Savings */}
                    <div className="card-pricing-row">
                      <strong className="card-current-price">{hasPrice(prod) ? `₹${activeSize.price}` : 'Price coming soon'}</strong>
                      {activeSize.originalPrice && (
                        <span className="card-original-price">₹{activeSize.originalPrice}</span>
                      )}
                    </div>
                    {activeSize.save > 0 && (
                      <div className="card-savings-pill">
                        <span className="save-icon">✔</span>
                        <span>Save ₹ {activeSize.save}</span>
                      </div>
                    )}

                    {/* Pack Size Selector Dropdown */}
                    <div className="card-size-selector-row" style={hasPrice(prod) ? undefined : { visibility: 'hidden' }}>
                      <label htmlFor={`size-select-${prod.id}`}>Size</label>
                      <select 
                        id={`size-select-${prod.id}`}
                        value={activeSize.size}
                        onChange={(e) => handleSizeChange(prod.id, e.target.value)}
                        className="card-size-dropdown"
                      >
                        {prod.sizes.map(s => (
                          <option key={s.size} value={s.size}>
                            {s.size}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Add to Basket button */}
                    <button 
                      type="button" 
                      className="card-add-to-cart-btn"
                      onClick={() => handleAddToCart(prod, activeSize.size)}
                    >
                      {hasPrice(prod) && <ShoppingCart size={16} />}
                      <span>{hasPrice(prod) ? 'Add to Cart' : 'View details'}</span>
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Desktop scroll arrows */}
            <div className="carousel-nav-arrows">
              <button 
                type="button" 
                className="carousel-arrow-btn" 
                onClick={() => scrollCarousel(offersScrollRef, 'left')}
                aria-label="Previous"
              >
                <ChevronLeft size={20} />
              </button>
              <button 
                type="button" 
                className="carousel-arrow-btn" 
                onClick={() => scrollCarousel(offersScrollRef, 'right')}
                aria-label="Next"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </section>
        )}

        {/* 5. SHOP BY PEST & DISEASE 🐞 (Matching Image 4) */}
        {dynamicDiseaseList.length > 0 && (
          <section className="shop-section pest-disease-section">
            <div className="section-header-row">
              <div>
                <h2 className="section-title">Shop by Pest & Disease 🐞</h2>
                <p className="section-subtitle">Find solutions for your crop problems.</p>
              </div>
              <button type="button" className="view-all-link" onClick={() => setShowAllPests(show => !show)} aria-expanded={showAllPests}>
                {showAllPests ? 'Show Less' : `View All (${dynamicDiseaseList.length})`}
              </button>
            </div>

            <div className={`pests-scroll-container ${showAllPests ? 'pests-expanded-grid' : ''}`} ref={pestsScrollRef}>
              {dynamicDiseaseList.map(pest => {
                const isSelected = activeDisease.toLowerCase() === pest.matchValue.toLowerCase()
                return (
                  <button
                    key={pest.id}
                    type="button"
                    className={`pest-circle-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => selectDisease(pest.matchValue)}
                  >
                    <div className="pest-circle-avatar">
                      <img 
                        src={pest.image} 
                        alt={pest.name} 
                        loading="lazy"
                        onError={(e) => {
                          e.target.onerror = null
                          e.target.src = 'https://images.unsplash.com/photo-1585314062340-f1a5a7c9328d?w=200&q=80'
                        }}
                      />
                    </div>
                    <span className="pest-circle-label">{pest.name}</span>
                    {pest.subtitle && <span className="pest-circle-sub">{pest.subtitle}</span>}
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* 6. BEST SELLING SECTION (Matching Image 4) */}
        {bestSellingList.length > 0 && (
          <section className="shop-section best-selling-section">
            <div className="section-header-row">
              <div>
                <h2 className="section-title">Best Selling</h2>
                <p className="section-subtitle">Best prices available today.</p>
              </div>
              <button type="button" className="view-all-link" onClick={() => {
                if (catalogSectionRef.current) catalogSectionRef.current.scrollIntoView({ behavior: 'smooth' })
              }}>View All</button>
            </div>

            <div className="product-cards-carousel">
              {bestSellingList.map(prod => {
                const activeSize = getProductActiveSize(prod)
                const isWishlisted = wishlist.has(prod.id)

                return (
                  <div key={prod.id} className="agro-product-card" {...cardOpenProps(prod.id, prod.name)}>
                    <div className="card-top-bar">
                      <span className="discount-tag">{prod.discount}</span>
                      <button 
                        type="button" 
                        className={`wishlist-heart-btn ${isWishlisted ? 'active' : ''}`}
                        onClick={() => toggleWishlist(prod.id, prod.name)}
                        aria-label="Add to Wishlist"
                      >
                        <Heart size={18} fill={isWishlisted ? '#ef4444' : 'none'} color={isWishlisted ? '#ef4444' : '#64748b'} />
                      </button>
                    </div>

                    <div className="card-image-box">
                      <img 
                        src={prod.image} 
                        alt={prod.name} 
                        loading="lazy"
                        onError={(e) => {
                          e.target.onerror = null
                          e.target.src = '/assets/products/photo-coming-soon.svg'
                        }}
                      />
                    </div>

                    {/* Only real reviews: a "★ | 0" badge told farmers nothing. */}
                    {Number(prod.reviewsCount) > 0 && (
                      <div className="card-rating-badge">
                        <span>{prod.rating} ★</span>
                        <span className="rating-divider">|</span>
                        <span>{prod.reviewsCount}</span>
                      </div>
                    )}

                    {user && prod.targetUserId === user.id ? (
                      <div style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: '#fff', fontSize: '0.72rem', padding: '3px 8px', borderRadius: '6px', fontWeight: 700, marginBottom: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Star size={11} fill="#fff" /> Recommended for You
                      </div>
                    ) : myCropFor(user, prod) ? (
                      <div style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', fontSize: '0.72rem', padding: '3px 8px', borderRadius: '6px', fontWeight: 700, marginBottom: '6px', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Sprout size={11} /> Tailored for {myCropFor(user, prod)}
                      </div>
                    ) : prod.tagBadge ? (
                      <div className="card-high-demand-banner">{prod.tagBadge}</div>
                    ) : (
                      <div className="card-high-demand-placeholder" />
                    )}

                    <h3 className="card-product-title" title={prod.name}>
                      {prod.name}
                    </h3>
                    <p className="card-brand-name">{[prod.brand, productForm(prod, formOptions)].filter(Boolean).join(' · ')}</p>

                    <div className="card-pricing-row">
                      <strong className="card-current-price">{hasPrice(prod) ? `₹${activeSize.price}` : 'Price coming soon'}</strong>
                      {activeSize.originalPrice && (
                        <span className="card-original-price">₹{activeSize.originalPrice}</span>
                      )}
                    </div>
                    {activeSize.save > 0 && (
                      <div className="card-savings-pill">
                        <span className="save-icon">✔</span>
                        <span>Save ₹ {activeSize.save}</span>
                      </div>
                    )}

                    <div className="card-size-selector-row" style={hasPrice(prod) ? undefined : { visibility: 'hidden' }}>
                      <label htmlFor={`size-select-${prod.id}`}>Size</label>
                      <select 
                        id={`size-select-${prod.id}`}
                        value={activeSize.size}
                        onChange={(e) => handleSizeChange(prod.id, e.target.value)}
                        className="card-size-dropdown"
                      >
                        {prod.sizes.map(s => (
                          <option key={s.size} value={s.size}>
                            {s.size}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button 
                      type="button" 
                      className="card-add-to-cart-btn"
                      onClick={() => handleAddToCart(prod, activeSize.size)}
                    >
                      {hasPrice(prod) && <ShoppingCart size={16} />}
                      <span>{hasPrice(prod) ? 'Add to Cart' : 'View details'}</span>
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* 7. SHOP BY NUTRIENTS 🧪 (Requested specifically: "shop by nutreicint") */}
        {dynamicNutrientsList.length > 0 && (
          <section className="shop-section shop-by-nutrients-section">
            <div className="section-header-row">
              <div>
                <h2 className="section-title">Shop by Nutrients 🧪</h2>
                <p className="section-subtitle">Balanced macro, micro and bio-stimulant plant nutrition formulations.</p>
              </div>
              <button type="button" className="view-all-link" onClick={() => selectCategory('Crop Nutrition')}>View All</button>
            </div>

            <div className="nutrients-scroll-container" ref={nutrientsScrollRef}>
              {dynamicNutrientsList.map(nut => {
                const isSelected = activeNutrient === nut.name
                return (
                  <button
                    key={nut.id}
                    type="button"
                    className={`nutrient-card-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => selectNutrient(nut.name)}
                  >
                    <div className="nutrient-icon-circle">
                      <img 
                        src={nut.image} 
                        alt={nut.name} 
                        loading="lazy"
                        onError={(e) => {
                          e.target.onerror = null
                          e.target.src = 'https://media.bighaat.com/categories/crop_nutrition_ct.webp'
                        }}
                      />
                    </div>
                    <strong className="nutrient-name">{nut.name}</strong>
                    <span className="nutrient-formula">{nut.formula}</span>
                    <small className="nutrient-benefit">{nut.benefit}</small>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* 8. GROWTH PROMOTERS ✨ (Matching Image 5) */}
        {growthPromotersList.length > 0 && (
        <section className="shop-section growth-promoters-section">
          <div className="section-header-row">
            <div>
              <h2 className="section-title">Growth Promoters ✨</h2>
              <p className="section-subtitle">Boost crop Growth naturally.</p>
            </div>
            <button type="button" className="view-all-link" onClick={() => selectCategory('Growth Promoters')}>View All</button>
          </div>

          <div className="product-cards-carousel" ref={growthScrollRef}>
            {growthPromotersList.map(prod => {
              const activeSize = getProductActiveSize(prod)
              const isWishlisted = wishlist.has(prod.id)

              return (
                <div key={prod.id} className="agro-product-card" {...cardOpenProps(prod.id, prod.name)}>
                  <div className="card-top-bar">
                    <span className="discount-tag">{prod.discount}</span>
                    <button 
                      type="button" 
                      className={`wishlist-heart-btn ${isWishlisted ? 'active' : ''}`}
                      onClick={() => toggleWishlist(prod.id, prod.name)}
                      aria-label="Add to Wishlist"
                    >
                      <Heart size={18} fill={isWishlisted ? '#ef4444' : 'none'} color={isWishlisted ? '#ef4444' : '#64748b'} />
                    </button>
                  </div>

                  <div className="card-image-box">
                    <img 
                      src={prod.image} 
                      alt={prod.name} 
                      loading="lazy"
                      onError={(e) => {
                        e.target.onerror = null
                        e.target.src = './assets/p3.png'
                      }}
                    />
                  </div>

                  {/* Only real reviews: a "★ | 0" badge told farmers nothing. */}
                  {Number(prod.reviewsCount) > 0 && (
                    <div className="card-rating-badge">
                      <span>{prod.rating} ★</span>
                      <span className="rating-divider">|</span>
                      <span>{prod.reviewsCount}</span>
                    </div>
                  )}

                  {prod.tagBadge ? (
                    <div className="card-high-demand-banner">{prod.tagBadge}</div>
                  ) : (
                    <div className="card-high-demand-placeholder" />
                  )}

                  <h3 className="card-product-title" title={prod.name}>
                    {prod.name}
                  </h3>
                  <p className="card-brand-name">{[prod.brand, productForm(prod, formOptions)].filter(Boolean).join(' · ')}</p>

                  <div className="card-pricing-row">
                    <strong className="card-current-price">{hasPrice(prod) ? `₹${activeSize.price}` : 'Price coming soon'}</strong>
                    {activeSize.originalPrice && (
                      <span className="card-original-price">₹{activeSize.originalPrice}</span>
                    )}
                  </div>
                  {activeSize.save > 0 && (
                    <div className="card-savings-pill">
                      <span className="save-icon">✔</span>
                      <span>Save ₹ {activeSize.save}</span>
                    </div>
                  )}

                  <div className="card-size-selector-row" style={hasPrice(prod) ? undefined : { visibility: 'hidden' }}>
                    <label htmlFor={`size-select-${prod.id}`}>Size</label>
                    <select 
                      id={`size-select-${prod.id}`}
                      value={activeSize.size}
                      onChange={(e) => handleSizeChange(prod.id, e.target.value)}
                      className="card-size-dropdown"
                    >
                      {prod.sizes.map(s => (
                        <option key={s.size} value={s.size}>
                          {s.size}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button 
                    type="button" 
                    className="card-add-to-cart-btn"
                    onClick={() => handleAddToCart(prod, activeSize.size)}
                  >
                    {hasPrice(prod) && <ShoppingCart size={16} />}
                    <span>{hasPrice(prod) ? 'Add to Cart' : 'View details'}</span>
                  </button>
                </div>
              )
            })}
          </div>
        </section>
        )}

        {/* 9. ALL PRODUCTS EXPLORER & FILTER CATALOG SECTION */}
        <section className="shop-section all-products-catalog-section" ref={catalogSectionRef}>
          <div className="catalog-header-box">
            <div className="catalog-title-group">
              <span className="catalog-badge">Complete Store Inventory</span>
              <h2 className="section-title">All Agro Formulations & Seeds</h2>
              <p className="section-subtitle">
                Filter by target crop, fungal/insect disease, nutrient type, or trusted brand
              </p>
            </div>

            {/* Live Search & Sort Bar */}
            <div className="catalog-search-sort-bar">
              <div className="catalog-search-field">
                <Search size={18} className="search-icon-dim" />
                <input 
                  type="text" 
                  placeholder="Search 500+ agro products, chemicals, crops..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                />
                {searchQuery && (
                  <button type="button" onClick={() => removeFilter('search')} className="search-clear-btn">
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="catalog-sort-select">
                <label htmlFor="catalog-sort-dropdown">Sort by:</label>
                <select 
                  id="catalog-sort-dropdown"
                  value={sortBy} 
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="popular">Best Selling</option>
                  <option value="discount">Highest Discount</option>
                  <option value="rating">Top Rated</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                </select>
              </div>
            </div>

            {/* Filter Category Pills - every admin category with a product,
                same merged list as the illustrated rail above (dynamicCategories) */}
            <div className="catalog-category-filter-pills">
              {categoryPills.map(cat => (
                <button
                  key={cat.label}
                  type="button"
                  className={`cat-pill-btn ${activeCategory === cat.value ? 'active' : ''}`}
                  onClick={() => selectCategory(cat.value)}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Form: powder, pellets, tablets... (src/shared/productForm.js) */}
            <div className="catalog-form-filter" role="group" aria-labelledby="catalogFormLabel">
              <span className="catalog-form-label" id="catalogFormLabel">Form</span>
              <button type="button" className={`cat-pill-btn ${!activeForm ? 'active' : ''}`} aria-pressed={!activeForm} onClick={() => selectForm('')}>All</button>
              {formOptions.map(form => (
                <button
                  key={form}
                  type="button"
                  className={`cat-pill-btn ${activeForm.toLowerCase() === form.toLowerCase() ? 'active' : ''}${formCountsAll[form] ? '' : ' is-empty'}`}
                  aria-pressed={activeForm.toLowerCase() === form.toLowerCase()}
                  onClick={() => selectForm(form)}
                >
                  {form} <span className="catalog-form-count">{formCountsAll[form]}</span>
                </button>
              ))}
            </div>

            {/* Active Filter Tags */}
            {(activeCategory || activeCrop || activeDisease || activeNutrient || activeForm || searchQuery) && (
              <div className="active-filters-bar">
                <span className="active-filter-label">Active Filters:</span>
                {activeCategory && (
                  <span className="filter-pill-tag">
                    Category: {activeCategory}
                    <button type="button" onClick={() => removeFilter('category')}><X size={12} /></button>
                  </span>
                )}
                {activeCrop && (
                  <span className="filter-pill-tag">
                    Crop: {activeCrop}
                    <button type="button" onClick={() => removeFilter('crop')}><X size={12} /></button>
                  </span>
                )}
                {activeDisease && (
                  <span className="filter-pill-tag">
                    Target Issue: {activeDisease}
                    <button type="button" onClick={() => removeFilter('disease')}><X size={12} /></button>
                  </span>
                )}
                {activeNutrient && (
                  <span className="filter-pill-tag">
                    Nutrient: {activeNutrient}
                    <button type="button" onClick={() => removeFilter('nutrient')}><X size={12} /></button>
                  </span>
                )}
                {activeForm && (
                  <span className="filter-pill-tag">
                    Form: {activeForm}
                    <button type="button" onClick={() => removeFilter('form')} aria-label="Remove form filter"><X size={12} /></button>
                  </span>
                )}
                {searchQuery && (
                  <span className="filter-pill-tag">
                    Search: "{searchQuery}"
                    <button type="button" onClick={() => removeFilter('search')}><X size={12} /></button>
                  </span>
                )}
                <button type="button" className="clear-all-filters-btn" onClick={clearAllFilters}>
                  Clear All
                </button>
              </div>
            )}
          </div>

          {/* Results count */}
          <div className="catalog-count-row">
            <span>Showing <strong>{filteredProducts.length}</strong> products</span>
          </div>

          {/* Master Products Grid */}
          {filteredProducts.length > 0 ? (
            <div className="catalog-products-grid">
              {visibleProducts.map(prod => {
                const activeSize = getProductActiveSize(prod)
                const isWishlisted = wishlist.has(prod.id)

                return (
                  <div key={prod.id} className="agro-product-card" {...cardOpenProps(prod.id, prod.name)}>
                    <div className="card-top-bar">
                      <span className="discount-tag">{prod.discount}</span>
                      <button 
                        type="button" 
                        className={`wishlist-heart-btn ${isWishlisted ? 'active' : ''}`}
                        onClick={() => toggleWishlist(prod.id, prod.name)}
                        aria-label="Add to Wishlist"
                      >
                        <Heart size={18} fill={isWishlisted ? '#ef4444' : 'none'} color={isWishlisted ? '#ef4444' : '#64748b'} />
                      </button>
                    </div>

                    <div className="card-image-box">
                      <img 
                        src={prod.image} 
                        alt={prod.name} 
                        loading="lazy"
                        onError={(e) => {
                          e.target.onerror = null
                          e.target.src = '/assets/products/photo-coming-soon.svg'
                        }}
                      />
                    </div>

                    {/* Only real reviews: a "★ | 0" badge told farmers nothing. */}
                    {Number(prod.reviewsCount) > 0 && (
                      <div className="card-rating-badge">
                        <span>{prod.rating} ★</span>
                        <span className="rating-divider">|</span>
                        <span>{prod.reviewsCount}</span>
                      </div>
                    )}

                    {user && prod.targetUserId === user.id ? (
                      <div style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: '#fff', fontSize: '0.72rem', padding: '3px 8px', borderRadius: '6px', fontWeight: 700, marginBottom: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Star size={11} fill="#fff" /> Recommended for You
                      </div>
                    ) : myCropFor(user, prod) ? (
                      <div style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', fontSize: '0.72rem', padding: '3px 8px', borderRadius: '6px', fontWeight: 700, marginBottom: '6px', border: '1px solid rgba(16, 185, 129, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Sprout size={11} /> Tailored for {myCropFor(user, prod)}
                      </div>
                    ) : prod.tagBadge ? (
                      <div className="card-high-demand-banner">{prod.tagBadge}</div>
                    ) : (
                      <div className="card-high-demand-placeholder" />
                    )}

                    <h3 className="card-product-title" title={prod.name}>
                      {prod.name}
                    </h3>
                    <p className="card-brand-name">{[prod.brand, productForm(prod, formOptions)].filter(Boolean).join(' · ')}</p>

                    <div className="card-pricing-row">
                      <strong className="card-current-price">{hasPrice(prod) ? `₹${activeSize.price}` : 'Price coming soon'}</strong>
                      {activeSize.originalPrice && (
                        <span className="card-original-price">₹{activeSize.originalPrice}</span>
                      )}
                    </div>
                    {activeSize.save > 0 && (
                      <div className="card-savings-pill">
                        <span className="save-icon">✔</span>
                        <span>Save ₹ {activeSize.save}</span>
                      </div>
                    )}

                    <div className="card-size-selector-row" style={hasPrice(prod) ? undefined : { visibility: 'hidden' }}>
                      <label htmlFor={`size-select-${prod.id}`}>Size</label>
                      <select 
                        id={`size-select-${prod.id}`}
                        value={activeSize.size}
                        onChange={(e) => handleSizeChange(prod.id, e.target.value)}
                        className="card-size-dropdown"
                      >
                        {(prod.sizes || (Array.isArray(prod.packSizes) ? prod.packSizes.map(s => ({ size: typeof s === 'object' ? s.size : s })) : [{ size: prod.selectedPack || 'Standard' }])).map(s => (
                          <option key={s.size || s} value={s.size || s}>
                            {s.size || s}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button 
                      type="button" 
                      className="card-add-to-cart-btn"
                      onClick={() => handleAddToCart(prod, activeSize.size)}
                    >
                      {hasPrice(prod) && <ShoppingCart size={16} />}
                      <span>{hasPrice(prod) ? 'Add to Cart' : 'View details'}</span>
                    </button>
                  </div>
                )
              })}
              {/* Reaching this builds the next screenful. It is inside the
                  grid's place in the flow but carries no card of its own. */}
              <div ref={sentinelRef} className="catalog-grid-sentinel" aria-hidden="true" />
            </div>
          ) : (
            <div className="catalog-empty-state">
              <Sprout size={48} className="empty-sprout-icon" />
              <h3>No Products Found</h3>
              <p>
                {loadingProducts 
                  ? 'Loading real products from database...' 
                  : dbProducts.length === 0 
                    ? 'Only real products added by the administrator appear here. All demo products have been cleared.' 
                    : activeForm && !formCountsAll[formOptions.find(f => f.toLowerCase() === activeForm.toLowerCase())]
                      ? `No ${activeForm.toLowerCase()} products yet. Try another form.`
                      : "We couldn't find any products matching your current filters."}
              </p>
              {dbProducts.length === 0 ? (
                <Link to="/admin/products" style={{ display: 'inline-block', marginTop: '12px', background: '#15803d', color: '#fff', padding: '10px 20px', borderRadius: '8px', textDecoration: 'none', fontWeight: 600 }}>
                  Open Admin Panel to Add Products
                </Link>
              ) : (
                <button type="button" className="btn-reset-filters" onClick={clearAllFilters}>
                  Reset All Filters
                </button>
              )}
            </div>
          )}
        </section>

        {/* 10. SATHYAM AGRO MART VALUE PROPOSITION & TRUST BADGES */}
        <section className="shop-trust-banner">
          <div className="trust-grid">
            <div className="trust-item">
              <ShieldCheck size={28} className="trust-icon" />
              <div>
                <strong>100% Original Products</strong>
                <span>Direct factory batch sourcing with QR purity verification</span>
              </div>
            </div>
            <div className="trust-item">
              <Truck size={28} className="trust-icon" />
              <div>
                <strong>Free Delivery Above ₹999</strong>
                <span>Express field delivery across 28 states & 4,000+ pin codes</span>
              </div>
            </div>
            <div className="trust-item">
              <Headphones size={28} className="trust-icon" />
              <div>
                <strong>Expert Agronomist Helpline</strong>
                <span>Free crop diagnosis & dosage consultation in 5 regional languages</span>
              </div>
            </div>
          </div>
        </section>
      </main>




      {/* Phones: the header nav above is hidden, so the bottom bar is rendered here. */}
    </div>
  )
}
