import { memo, useMemo, useState } from 'react'
import { useStore } from '../StoreContext'
import { CATEGORIES, CROPS, DISEASES, productImage, useFallbackImage } from '../data'
import { matchesCrop, matchesCategory, matchesDisease, matchesSearch, topSelling, liveCategories } from '../../utils/catalogUtils'
import { ALL_CROPS, cropList } from '../../shared/profileFieldRules'
import { PRODUCT_FORMS, formCounts, matchesForm, productForm } from '../../shared/productForm'
import { hasPrice } from '../../shared/comingSoon'
import { packMrp, packPrice } from '../../shared/packPricing'
import { productText } from '../../shared/productText'
import { useLanguage } from '../../context/LanguageContext'

// The phone chips and the category dropdown list the categories the live
// products are in (liveCategories); these emoji lead the chips we know.
const CHIP_EMOJI = { fungicide: '🌿', insecticide: '🐛', 'bio-stimulant': '⚡', herbicide: '🌾', nematicide: '🪱', fertilizer: '🧪', seeds: '🌱', adjuvant: '💧', equipments: '🛠️' }
const plural = name => (/s$/i.test(name) ? name : `${name}s`)
const DEFAULT_PACKS = ['250g', '500g', '1kg']

export const ProductSkeleton = memo(function ProductSkeleton() {
  return (
    <div className="product-card" style={{ opacity: 0.6, pointerEvents: 'none', animation: 'pulse 1.5s infinite ease-in-out' }}>
      <div className="product-img-box" style={{ background: 'var(--border-light, #E7E5DF)', minHeight: '180px' }} />
      <div className="card-content" style={{ padding: '16px' }}>
        <div style={{ height: '14px', width: '35%', background: '#E7E5DF', borderRadius: '4px', marginBottom: '8px' }} />
        <div style={{ height: '18px', width: '75%', background: '#D6D9D3', borderRadius: '4px', marginBottom: '8px' }} />
        <div style={{ height: '12px', width: '55%', background: '#E7E5DF', borderRadius: '4px', marginBottom: '14px' }} />
        <div style={{ height: '20px', width: '30%', background: '#D6D9D3', borderRadius: '4px' }} />
      </div>
    </div>
  )
})

const ProductCard = memo(function ProductCard({ product: p, user, t, variant }) {
  const { lang } = useLanguage()
  const { addToCart, openProductPage } = useStore()
  const catalog = variant === 'catalog'

  const packs = Array.isArray(p.packSizes) && p.packSizes.length
    ? p.packSizes.map(s => typeof s === 'object' ? s.size : s)
    : catalog ? DEFAULT_PACKS : []
  const [selectedPack, setSelectedPack] = useState(p.selectedPack || packs[0] || '')

  const getPackPrice = pack => packPrice(p, pack, p.selectedPack || packs[0])
  const getPackMrp = (pack, price) => packMrp(p, pack, price)

  const priced = hasPrice(p)
  const currentPrice = getPackPrice(selectedPack)
  const currentMrp = getPackMrp(selectedPack, currentPrice)

  // A farmer may grow several crops: name the one this product is for.
  const myCrop = catalog && user ? cropList(user.crop).find(crop => crop !== ALL_CROPS && matchesCrop(p.crops, crop)) : undefined
  let personalBadge = null
  if (catalog && user) {
    if (p.targetUserId === user.id) {
      personalBadge = (
        <div className="pc-badge pc-badge-rec">
          <i className="fa-solid fa-star"></i> Recommended for You
        </div>
      )
    } else if (myCrop) {
      personalBadge = (
        <div className="pc-badge pc-badge-crop">
          <i className="fa-solid fa-seedling"></i> Tailored for {myCrop}
        </div>
      )
    }
  }

  const hasReviews = catalog ? p.reviewsEnabled && p.reviewsCount > 0 : p.reviewsEnabled && p.reviewsCount

  // The whole card opens the product page. Clicks that start on a control
  // inside the card (add to cart, the view button, pack chips) keep their own
  // behaviour, and text selection never counts as a click.
  const openFromCard = event => {
    if (event.target.closest('button, a, input, select, textarea, label')) return
    if (window.getSelection && String(window.getSelection()).length) return
    openProductPage(p.id)
  }
  const keyFromCard = event => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    if (event.target !== event.currentTarget) return
    event.preventDefault()
    openProductPage(p.id)
  }

  return (
    <div
      className="product-card"
      role="link"
      tabIndex={0}
      aria-label={`View ${p.name}`}
      style={{ cursor: 'pointer' }}
      onClick={openFromCard}
      onKeyDown={keyFromCard}
    >
      <span className="discount-tag">{!priced ? 'Coming Soon' : catalog ? p.discount || 'Special Offer' : p.discount}</span>
      <div className="product-img-box">
        <img loading="lazy" decoding="async" src={productImage(p)} alt={p.name} onError={useFallbackImage} />
      </div>
      <div className="card-content">
        <span className="product-category-tag">{p.category}{productForm(p) ? <> · {productForm(p)}</> : null}</span>
        {personalBadge}
        <h3 className="product-name">{p.name}</h3>
        <p className="product-tagline">{productText(p, 'tagline', lang)}</p>

        {hasReviews
          ? <div className="rating-row"><i className="fa-solid fa-star"></i><span style={{ fontWeight: 700 }}>{Number(p.rating).toFixed(1)}</span><span style={{ color: 'var(--text-muted)' }}>({p.reviewsCount} {t('reviews')})</span></div>
          : <div className="rating-row" style={{ color: 'var(--text-muted)' }}>No verified reviews yet</div>}

        <div className="price-row">
          {priced ? (
            <>
              <span className="current-price">₹{currentPrice.toLocaleString()}</span>
              {currentMrp > currentPrice && <span className="original-price">₹{currentMrp.toLocaleString()}</span>}
            </>
          ) : <span className="current-price">Price coming soon</span>}
        </div>

        {priced && <div className="pack-sizes-row">
          {packs.map((pack, idx) => (
            <span
              key={`${pack}-${idx}`}
              className={`pack-chip ${selectedPack === pack ? 'active' : ''}`}
              role="button"
              tabIndex={0}
              aria-pressed={selectedPack === pack}
              aria-label={`${pack}, ₹${getPackPrice(pack).toLocaleString()}`}
              onClick={(e) => {
                e.stopPropagation()
                setSelectedPack(pack)
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return
                e.preventDefault()
                e.stopPropagation()
                setSelectedPack(pack)
              }}
              style={{ cursor: 'pointer' }}
            >
              {pack}
            </span>
          ))}
        </div>}

        <div className="card-btn-row">
          {priced ? (
            <button className={`btn btn-primary ${catalog ? 'add-to-cart-btn' : 'trending-add-btn'}`} data-id={p.id} style={{ flex: 1 }} onClick={() => addToCart(p.id, selectedPack)}>
              <i className="fa-solid fa-cart-shopping"></i> {t('add_to_cart')}
            </button>
          ) : (
            <button className={`btn btn-primary ${catalog ? 'add-to-cart-btn' : 'trending-add-btn'}`} style={{ flex: 1 }} onClick={() => openProductPage(p.id)}>
              <i className="fa-solid fa-circle-info"></i> View details
            </button>
          )}
        </div>
      </div>
    </div>
  )
})

const PHONE_CATALOG_CAP = 6

export const Catalog = memo(function Catalog({ t, filters, products, catalogOptions, user, filterDrawerOpen, loading = false }) {
  const { setFilter, resetFilters, filterByCategory, toggleFilterDrawer } = useStore()
  const searchQuery = filters.search.toLowerCase().trim()
  // The built-in six plus any an admin has added on a product
  // (server catalogOptions.physicalForms; src/shared/productForm.js).
  const formOptions = catalogOptions?.physicalForms?.length ? catalogOptions.physicalForms : PRODUCT_FORMS

  // Crop words, so "Rice Blast" also finds products made for all crops.
  const cropWords = useMemo(() => new Set((catalogOptions?.crops || CROPS)
    .flatMap(c => String(c?.name || c?.id || c).toLowerCase().split(/[^a-z]+/))
    .filter(w => w.length > 2 && w !== 'all' && w !== 'crops')), [catalogOptions?.crops])
  const filtered = useMemo(() => products.filter(p => {
    const matchCrop = matchesCrop(p.crops, filters.crop)
    const matchDisease = matchesDisease(p.diseases, filters.disease)
    const matchCategory = matchesCategory(p.category, filters.category)
    const matchForm = matchesForm(p, filters.form, formOptions)
    const matchSearch = matchesSearch(p, searchQuery, cropWords)
    return matchCrop && matchDisease && matchCategory && matchForm && matchSearch
  }), [products, filters.crop, filters.disease, filters.category, filters.form, formOptions, searchQuery, cropWords])

  const activeFilterCount = [filters.crop !== 'all', filters.disease !== 'all', filters.category !== 'All', (filters.form || 'all') !== 'all', searchQuery !== ''].filter(Boolean).length
  const counts = useMemo(() => formCounts(products, formOptions), [products, formOptions])
  const cropOptions = catalogOptions?.crops || CROPS
  // Only categories that have products, with how many; the chosen one stays
  // listed even if its products are gone, so the dropdown never goes blank.
  const liveCats = useMemo(() => liveCategories(products, catalogOptions?.categories || CATEGORIES), [products, catalogOptions?.categories])
  const categoryOptions = useMemo(() => {
    const list = [{ name: 'All', count: products.length }, ...liveCats]
    if (!list.some(c => c.name === filters.category)) list.push({ name: filters.category, count: 0 })
    return list
  }, [liveCats, products.length, filters.category])
  const diseaseOptions = catalogOptions?.diseases || DISEASES

  // Phones show the first six results, then "Show all" (storefront.css 7w);
  // desktop ignores the cap. A new filter or search collapses it again.
  const filterKey = [filters.crop, filters.disease, filters.category, filters.form, searchQuery].join('|')
  const [expandedFor, setExpandedFor] = useState(null)
  const capped = expandedFor !== filterKey && filtered.length > PHONE_CATALOG_CAP

  return (
    <section className="section" id="catalog">
      <div className="container">
        <div className="section-header">
          <h2 className="section-title" data-i18n="catalog_title">{t('catalog_title')}</h2>
          <p className="section-subtitle" data-i18n="catalog_subtitle">{t('catalog_subtitle')}</p>
        </div>

        {/* Phones: category chips and the filter drawer button */}
        <div className="mobile-catalog-header">
          <div className="mobile-category-chips-scroll" id="mobileCategoryChipsScroll">
            {categoryOptions.map(({ name: value }) => (
              <button key={value} className={`mobile-cat-chip ${filters.category === value ? 'active' : ''}`} data-cat={value} onClick={() => filterByCategory(value)}>
                {value === 'All' ? 'All' : `${CHIP_EMOJI[value.toLowerCase()] || '🏷️'} ${plural(value)}`}
              </button>
            ))}
          </div>
          <div className="mobile-filter-bar-row">
            <button className="mobile-filter-drawer-btn" onClick={() => toggleFilterDrawer(true)}>
              <i className="fa-solid fa-sliders"></i>
              <span>Filters &amp; Sort</span>
              <span className="mobile-filter-count-badge" id="mobileFilterCountBadge" style={{ display: activeFilterCount ? 'inline-flex' : 'none' }}>{activeFilterCount}</span>
            </button>
            <span className="mobile-catalog-count" id="mobileCatalogCount">{filtered.length} Products</span>
          </div>
        </div>
        <div className={`sidebar-panel-overlay ${filterDrawerOpen ? 'active' : ''}`} id="sidebarPanelOverlay" onClick={() => toggleFilterDrawer(false)}></div>

        <div className="catalog-layout">
          <aside className={`catalog-sidebar ${filterDrawerOpen ? 'drawer-open' : ''}`} id="filterDrawer">
            <div className="mobile-filter-drawer-header">
              <span className="mobile-filter-drawer-title"><i className="fa-solid fa-sliders"></i> Filter Catalog</span>
              <button className="mobile-filter-drawer-close" onClick={() => toggleFilterDrawer(false)} aria-label="Close filters">&times;</button>
            </div>

            <div className="filter-group">
              <label className="filter-label" htmlFor="cropFilter"><i className="fa-solid fa-wheat-awn"></i> <span data-i18n="filter_crop">{t('filter_crop')}</span></label>
              <select className="filter-select" id="cropFilter" value={filters.crop} onChange={e => setFilter('crop', e.target.value)}>
                {cropOptions.map(crop => <option key={crop.id || crop} value={crop.id || crop}>{crop.name || crop}</option>)}
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label" htmlFor="diseaseFilter"><i className="fa-solid fa-virus"></i> <span data-i18n="filter_disease">{t('filter_disease')}</span></label>
              <select className="filter-select" id="diseaseFilter" value={filters.disease} onChange={e => setFilter('disease', e.target.value)}>
                {diseaseOptions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label" htmlFor="categoryFilter"><i className="fa-solid fa-layer-group"></i> <span data-i18n="filter_category">{t('filter_category')}</span></label>
              <select className="filter-select" id="categoryFilter" value={filters.category} onChange={e => setFilter('category', e.target.value)}>
                {categoryOptions.map(({ name, count }) => <option key={name} value={name}>{name === 'All' ? 'All Formulations' : name} ({count})</option>)}
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label" htmlFor="formFilter"><i className="fa-solid fa-cubes"></i> <span>Form</span></label>
              <select className="filter-select" id="formFilter" value={filters.form || 'all'} onChange={e => setFilter('form', e.target.value)}>
                <option value="all">All forms</option>
                {formOptions.map(form => <option key={form} value={form}>{form} ({counts[form] || 0})</option>)}
              </select>
            </div>

            <button className="btn btn-outline filter-reset-inline" style={{ width: '100%', justifyContent: 'center', fontSize: '0.82rem' }} onClick={resetFilters}>
              <i className="fa-solid fa-rotate-left"></i> <span data-i18n="reset_filters">{t('reset_filters')}</span>
            </button>

            <div className="mobile-filter-drawer-footer">
              <button className="btn btn-outline" onClick={() => { resetFilters(); toggleFilterDrawer(false) }} style={{ flex: 1, justifyContent: 'center' }}>Reset</button>
              <button className="btn btn-primary" onClick={() => toggleFilterDrawer(false)} style={{ flex: 1.5, justifyContent: 'center' }}>Apply Filters</button>
            </div>
          </aside>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span id="productsCount" style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                {loading && products.length === 0
                  ? 'Loading verified farm products...'
                  : `${t('showing_products')} ${filtered.length} ${t('of_products')} ${products.length} ${t('products_label')}`}
              </span>
            </div>
            <div className={`products-grid${capped ? ' is-capped' : ''}`} id="productsGrid">
              {loading && products.length === 0 ? (
                <>
                  <ProductSkeleton />
                  <ProductSkeleton />
                  <ProductSkeleton />
                  <ProductSkeleton />
                </>
              ) : filtered.length === 0 ? (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '50px 20px', background: '#ffffff', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                  <i className="fa-solid fa-leaf" style={{ fontSize: '3rem', color: 'var(--text-dim)', marginBottom: '12px' }}></i>
                  <h3 style={{ color: 'var(--primary-dark)' }}>No products found</h3>
                  <p style={{ color: 'var(--text-muted)', marginTop: '6px' }}>Try another crop, disease, category or form.</p>
                  <button className="btn btn-outline" style={{ marginTop: '16px' }} onClick={resetFilters}><i className="fa-solid fa-rotate-left"></i> {t('reset_filters')}</button>
                </div>
              ) : (
                filtered.map(product => <ProductCard key={product.id} product={product} user={user} t={t} variant="catalog" />)
              )}
            </div>
            {capped && (
              <button type="button" className="catalog-show-all" onClick={() => setExpandedFor(filterKey)}>
                Show all {filtered.length} products <i className="fa-solid fa-chevron-down" aria-hidden="true"></i>
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
})

export const Trending = memo(function Trending({ t, products, loading = false }) {
  // What is actually selling, most sold first. Until the shop has taken an
  // order the counts are all zero, and the badge/rating rule this row used
  // before stands in.
  const trending = useMemo(
    () => topSelling(products, 4)
      || products.filter(p => p.badge === 'Best Seller' || p.badge === '100% Organic' || p.rating >= 4.8).slice(0, 4),
    [products],
  )
  return (
    <section className="section" id="relatedProductsSection" style={{ padding: '40px 0', background: '#ffffff' }}>
      <div className="container">
        <div className="section-header-flex">
          <div>
            <h2 className="section-title"><i className="fa-solid fa-fire" style={{ color: 'var(--accent-amber)' }}></i> Trending &amp; Related Products</h2>
            <p className="section-subtitle">Recommended products based on current crop seasonal demand</p>
          </div>
        </div>
        <div className="products-grid" id="trendingProductsGrid">
          {loading && products.length === 0 ? (
            <>
              <ProductSkeleton />
              <ProductSkeleton />
              <ProductSkeleton />
              <ProductSkeleton />
            </>
          ) : (
            trending.map(product => <ProductCard key={product.id} product={product} t={t} variant="trending" />)
          )}
        </div>
      </div>
    </section>
  )
})
