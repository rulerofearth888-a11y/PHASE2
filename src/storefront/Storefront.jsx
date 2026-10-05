import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { dedupeCropLabels, matchesDisease } from '../utils/catalogUtils'
import { afterPageTransition } from '../components/home/pageTransition'
import { useBasket, useCheckoutActions } from '../hooks/useCheckout'
import { SHARED_POPUP_HASHES } from '../hooks/checkoutRules'
import { StoreContext } from './StoreContext'
import useCatalogProducts from '../hooks/useCatalogProducts'
import { useCms } from '../context/CmsContext'
import { TEXT_PACKS, isLanguageReady, loadLanguagePack, translationFor } from './i18n'
import { showToast } from './toast'
import { setBodyFlag } from './bodyFlags'
import useModalStates from './useModalStates'
import { startNavDebugPanel } from './navDebug'
import { StoreChrome } from './sections/Header'
import { DealBanner, Hero, StatsStrip, TrustStrip } from './sections/Hero'
import { CategoryGrid, Certifications, CropGrid } from './sections/ShopGrids'
import { Catalog, Trending } from './sections/Catalog'
import { Newsletter, Testimonials } from './sections/Community'
import { cmsOverride } from '../hooks/useCmsSettings'
import { hasPrice } from '../shared/comingSoon'
// The one footer, shared with every other store page.
import Footer from '../components/home/Footer'
import ServicesBottomNav from '../components/common/ServicesBottomNav'
import BackToTop from './sections/BackToTop'
import PhotoScannerModal from './sections/PhotoScannerModal'
import Chatbot from './sections/Chatbot'
import { packMrp, packPrice } from '../shared/packPricing'
import './storefront.css'

const HOME_SERVICES_EXCLUDE = ['/products']

// The storefront home page (/): the catalogue and this page's own popups
// (photo scanner). The basket, the floating checkout and the
// sign-in card are shared with every store page (hooks/useCheckout.js, drawn
// by StorePopups.jsx), as are the phone bottom bar and its Menu sheet
// (MobileBottomNav) - all drawn once in App.jsx, so they stay in place when
// moving between pages. Links into this page: #scan, a section id, or
// ?category= / ?crop= from the shared Menu sheet.
// Styles: storefront.css, scoped to this page's wrapper.

const PAGE_TITLE = "Sathyam Agro Mart - India's Largest Online Agro Pesticides & Crop Protection Store"
const DEFAULT_FILTERS = { crop: 'all', disease: 'all', category: 'All', form: 'all', search: '' }

export default function Storefront() {
  const { user } = useAuth()
  const { lang, setLang } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const { count, totals } = useBasket()
  const checkout = useCheckoutActions()
  const [modals, modal] = useModalStates()

  const {
    products,
    catalogOptions: rawCatalogOptions,
    loading: catalogLoading,
    refetch: fetchLiveProducts,
    refetchOptions: fetchLiveCatalogOptions
  } = useCatalogProducts({
    userId: user?.id,
    onlineOnly: true
  })

  // The catalogue's filter lists - the full admin registry (db.js's
  // /api/catalog-options), every option that exists in the admin product
  // form's dropdowns, not only the ones a live product currently matches.
  // Picking one with nothing in stock right now shows "0 Products" rather
  // than hiding the option, so the storefront's filters and the admin form's
  // dropdowns always offer exactly the same list. Categories are the
  // exception: Catalog.jsx lists only the ones live products are in
  // (liveCategories), using this list for their order and spelling.
  const catalogOptions = useMemo(() => {
    if (!rawCatalogOptions) return null
    return {
      categories: ['All', ...(rawCatalogOptions.categories || [])],
      crops: [
        { id: 'all', name: 'All Crops' },
        ...dedupeCropLabels(rawCatalogOptions.crops || []).map(crop => ({ id: crop, name: crop })),
      ],
      diseases: [
        { id: 'all', name: 'All Diseases & Pests' },
        ...(rawCatalogOptions.diseases || []).map(disease => ({ id: disease, name: disease })),
      ],
      // Plain strings, not {id, name}: the Form filter (Catalog.jsx) reads
      // this the same way it reads its own PRODUCT_FORMS fallback.
      physicalForms: rawCatalogOptions.physicalForms || [],
    }
  }, [rawCatalogOptions])

  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false)
  const [appliedLang, setAppliedLang] = useState('en')
  // Site content the admin edits in the CMS. The hook keeps it live: it
  // re-reads on a BroadcastChannel ping when an admin publishes, and when this
  // tab becomes visible again (same pattern as useCatalogProducts).
  const { cms } = useCms()

  const productsRef = useRef(products)
  productsRef.current = products
  const languageRequest = useRef(0)
  const dismissLanguageToast = useRef(null)
  // The latest values for the actions below, which never change identity.
  const live = useRef({})
  live.current = { user, navigate, setLang, appliedLang }

  const actions = useMemo(() => {
    // ---- popups ----
    // This page's own (photo scanner) open here; the sign-in
    // card and the checkout are the shared ones.
    const { openModal, closeModal } = modal
    const openSignIn = notice => checkout.openSignIn(notice)
    const handleAccountClick = event => checkout.showAccount(event)

    // ---- catalogue ----
    const scrollToCatalog = () => document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' })
    // ONE FILTER AT A TIME. Crop, disease, category and the search box are
    // four ways of asking the same question, not four conditions to stack: a
    // shopper who picks a crop while a pest is still set means "now show me
    // this crop", and the two together mostly land on an empty grid with the
    // reason two taps away inside the drawer. So choosing any of them starts a
    // fresh browse, exactly as the category chips and the mega menu already
    // did. Clearing one back to its default leaves the others alone - there is
    // nothing to start.
    const setFilter = (name, value) => setFilters(current => (
      String(value).trim() && value !== DEFAULT_FILTERS[name]
        ? { ...DEFAULT_FILTERS, [name]: value }
        : { ...current, [name]: value }
    ))
    const resetFilters = () => setFilters(DEFAULT_FILTERS)
    // Entry points from outside the catalogue (nav, mega menu, crop and
    // category tiles) start a fresh browse, the same as the drawer's own
    // selects above, and scroll down to the results.
    const filterByCategory = category => {
      setFilters({ ...DEFAULT_FILTERS, category })
      scrollToCatalog()
    }
    const filterByCrop = crop => {
      setFilters({ ...DEFAULT_FILTERS, crop })
      scrollToCatalog()
    }
    const toggleFilterDrawer = open => setFilterDrawerOpen(current => (typeof open === 'boolean' ? open : !current))

    // ---- basket (hooks/useCheckout.js) ----
    const addToCart = (productId, customPack, customQty = 1) => {
      const product = productsRef.current.find(item => item.id === productId)
      if (!product) return
      // Not priced yet ("Price coming soon"): its page, not the basket.
      if (!hasPrice(product)) return openProductPage(productId)
      const selectedPack = customPack || product.selectedPack || (Array.isArray(product.packSizes) ? (typeof product.packSizes[0] === 'object' ? product.packSizes[0].size : product.packSizes[0]) : undefined)

      const basePack = product.selectedPack || (Array.isArray(product.packSizes) ? (typeof product.packSizes[0] === 'object' ? product.packSizes[0].size : product.packSizes[0]) : undefined)
      const price = packPrice(product, selectedPack, basePack)
      const originalPrice = packMrp(product, selectedPack, price)

      checkout.addItem({ ...product, price: Number(price), originalPrice: Number(originalPrice), selectedPack }, customQty)

      if (!live.current.user) {
        showToast(`"${product.name}" added to cart!`, 'success')
        openSignIn('Login or Sign Up is mandatory to access your basket and complete checkout.')
      } else {
        showToast(`"${product.name}" added to basket!`, 'success')
        checkout.openBasket()
      }
    }

    const handleBasketClick = event => {
      event?.stopPropagation?.()
      checkout.openBasket(event)
    }

    // Looks up a real, currently-live product that treats the given disease
    // (e.g. from the photo scanner's diagnosis) instead of the caller
    // guessing/hardcoding a product id that may no longer exist.
    const findRemedyProduct = diseaseKeyword =>
      productsRef.current.find(product => matchesDisease(product.diseases, diseaseKeyword)) || null

    // ---- language ----
    const changeLanguage = async code => {
      if (code === live.current.appliedLang || !isLanguageReady(code)) return
      // Only the latest choice applies if two packs are still loading.
      const request = ++languageRequest.current
      const loaded = await loadLanguagePack(code)
      if (request !== languageRequest.current) return
      if (!loaded) {
        showToast('Could not load this language. Please check your connection and try again.', 'error')
        return
      }
      live.current.setLang(code)
      // A Kannada note never lingers on a page that is now in Hindi.
      dismissLanguageToast.current?.()
      dismissLanguageToast.current = showToast(TEXT_PACKS[code]?.languageChanged || 'Language changed to English', 'success', 2500)
    }

    const openProductPage = productId => live.current.navigate(`/product/${encodeURIComponent(productId)}`)
    const goTo = path => live.current.navigate(path)

    return {
      fetchLiveProducts, fetchLiveCatalogOptions,
      openModal, closeModal, openSignIn, handleAccountClick,
      scrollToCatalog, setFilter, resetFilters, filterByCategory, filterByCrop, toggleFilterDrawer,
      addToCart, handleBasketClick, changeLanguage, openProductPage, goTo, findRemedyProduct,
    }
  }, [modal, checkout])

  // ---- page lifetime ----
  useLayoutEffect(() => {
    const body = document.body
    body.classList.add('sb-home-active', 'has-bottom-nav')
    const previousTitle = document.title
    document.title = PAGE_TITLE
    return () => {
      body.classList.remove('sb-home-active', 'has-bottom-nav')
      setBodyFlag('overlay-open', 'storefront', false)
      body.style.overflow = ''
      document.title = previousTitle
    }
  }, [])

  useEffect(() => {

    // Escape closes this page's top-most open popup. The shared popups
    // (sign-in, checkout) take it first when they are open.
    const onKey = event => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const open = [...document.querySelectorAll('.sb-home .modal-overlay.active')].pop()
      if (open) actions.closeModal(open.id)
    }
    document.addEventListener('keydown', onKey)

    // Anything marked data-modal-target opens that popup.
    const onClick = event => {
      const trigger = event.target instanceof Element && event.target.closest('.sb-home [data-modal-target]')
      if (trigger) actions.openModal(trigger.getAttribute('data-modal-target'))
    }
    document.addEventListener('click', onClick)

    const stopNavDebug = startNavDebugPanel()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick)
      stopNavDebug()
    }
  }, [actions])

  // Links into the page: #scan, a section id, and ?category= / ?crop= from
  // the shared Menu sheet. #login, #account and the checkout steps belong to
  // the shared popups (hooks/useCheckout.js). Each history entry is handled
  // once: closing a popup goes Back onto the entry before it (the sign-in
  // card, the basket), and a /#scan there must not open the scanner again.
  const handledLocations = useRef(new Set())
  useEffect(() => {
    if (handledLocations.current.has(location.key)) return
    handledLocations.current.add(location.key)

    const params = new URLSearchParams(location.search)
    const category = params.get('category')
    const crop = params.get('crop')
    if (category || crop) setFilters({ ...DEFAULT_FILTERS, ...(category && { category }), ...(crop && { crop }) })

    const hash = decodeURIComponent(location.hash.slice(1))
    if (hash === 'scan') {
      // Arriving from another page, the scanner opens once that page change
      // has finished cross-fading (see pageTransition.js); on this page, at once.
      afterPageTransition().then(() => actions.openModal('photoScannerModal'))
    } else if (hash && !SHARED_POPUP_HASHES.has(hash)) {
      requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView())
    }
  }, [location.key, location.search, location.hash, actions])

  // Body classes other styles key off (pausing the ticker behind a popup).
  useEffect(() => {
    const blocking = filterDrawerOpen || Object.values(modals).some(Boolean)
    setBodyFlag('overlay-open', 'storefront', blocking)
  }, [modals, filterDrawerOpen])

  // The filter drawer is a bottom sheet, so it owns the bottom edge: the page
  // behind it stops scrolling, and the floating bottom bar steps aside
  // (index.css) instead of covering its Reset / Apply row.
  useEffect(() => {
    document.body.style.overflow = filterDrawerOpen ? 'hidden' : ''
    setBodyFlag('sb-bottom-sheet-open', 'catalog-filters', filterDrawerOpen)
    return () => setBodyFlag('sb-bottom-sheet-open', 'catalog-filters', false)
  }, [filterDrawerOpen])

  // ---- language ----
  // The chosen language is applied once its pack has loaded; until then (or
  // if it cannot load) the page stays in English.
  useEffect(() => {
    let cancelled = false
    loadLanguagePack(lang).then(ok => {
      if (!cancelled) setAppliedLang(ok && isLanguageReady(lang) ? lang : 'en')
    })
    return () => { cancelled = true }
  }, [lang])

  // The rest of the page text is translated app-wide by PageTranslator (App.jsx).

  const t = useCallback(key => translationFor(appliedLang, key) || key, [appliedLang])

  return (
    <StoreContext.Provider value={actions}>
      <div className="sb-home" id="top">
        {/* Ticker, header and nav - the same component every other store
            page uses (sections/Header.jsx, StoreChrome). */}
        <StoreChrome t={t} appliedLang={appliedLang} user={user} cartCount={count} cartTotal={totals.total} searchText={filters.search} />
        <Hero t={t} cms={cms} />
        {/* An admin turns these off by clearing their title in the CMS. */}
        {cmsOverride(cms, 'dealBannerTitle') !== '' && <DealBanner cms={cms} />}
        <TrustStrip t={t} cms={cms} />
        <StatsStrip cms={cms} />
        <CategoryGrid t={t} cms={cms} />
        <CropGrid cms={cms} />
        {/* Farmer tools right after the crop picker: ask an expert, test the soil, track orders. */}
        <section className="section sb-home-services">
          <div className="container">
            <ServicesBottomNav exclude={HOME_SERVICES_EXCLUDE} />
          </div>
        </section>
        <Catalog t={t} filters={filters} products={products} catalogOptions={catalogOptions} user={user} filterDrawerOpen={filterDrawerOpen} loading={catalogLoading} />
        <Trending t={t} products={products} loading={catalogLoading} />
        {cmsOverride(cms, 'testimonialsTitle') !== '' && <Testimonials cms={cms} />}
        <Newsletter cms={cms} crops={rawCatalogOptions?.crops} />
        <Certifications settings={cms} />
        <BackToTop />
        <PhotoScannerModal state={modals.photoScannerModal} t={t} />
        <Chatbot t={t} />
      </div>
      {/* Outside .sb-home on purpose. The footer's styles live in index.css,
          which is inside @layer app, so anything unlayered in storefront.css
          beats them: rendered inside the store scope, the shared footer came
          out as unstyled bullet lists on a white background. Every other page
          mounts it outside the scope too (layouts/StoreLayout.jsx). */}
      <Footer />
    </StoreContext.Provider>
  )
}
