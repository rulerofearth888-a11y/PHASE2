import { memo } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../StoreContext'
import { cmsText } from '../../hooks/useCmsSettings'
import { photoUrl, photoSrcSet } from '../../shared/responsiveImage'

const CATEGORY_CARDS = [
  { value: 'Fungicide', image: 'photo-1692481060581-98c224124f12', alt: 'Leaf with fungal disease spots', tag: 'Crop Disease Defense', title: 'Fungicides', desc: 'Cure Blast, Blight, Powdery Mildew & Rust' },
  { value: 'Insecticide', image: 'photo-1628352081506-83c43123ed6d', alt: 'Insect Pest Control', tag: 'Pest Protection', title: 'Insecticides', desc: 'Control Whitefly, Bollworm, Aphids & Borer' },
  { value: 'Bio-Stimulant', image: 'photo-1523348837708-15d4a09cfac2', alt: 'Bio Stimulant Crop Growth', tag: 'Yield Booster', title: 'Bio-Stimulants', desc: 'Root Vigor, Flowering & Fruit Mass Booster' },
  { value: 'Herbicide', image: 'photo-1627920769541-daa658ed6b59', alt: 'Boom sprayers treating a crop field', tag: 'Weed Elimination', title: 'Herbicides', desc: 'Selective Pre & Post Emergence Weed Control' },
  { value: 'Nematicide', image: 'photo-1623385523057-08414b3665b4', alt: 'Plant root ball in soil', tag: 'Soil Protection', title: 'Nematicides', desc: 'Protect Roots Against Nematode Attacks' },
  { value: 'All', image: 'photo-1500382017468-9049fed747ef', alt: 'Full Store Catalog', tag: 'Full Catalog', tagStyle: { background: 'white', color: 'black' }, title: 'All 35 Agro Formulations', desc: 'Browse complete Sathyam Agro Mart product range' },
]

const CROP_CARDS = [
  { value: 'Paddy/Rice', image: 'photo-1530507629858-e4977d30e9e0', alt: 'Paddy Rice Field', tag: 'Blast Defense', title: 'Paddy / Rice' },
  { value: 'Cotton', image: 'photo-1634337781106-4c6a12b820a1', alt: 'Cotton Crop Field', tag: 'Whitefly Shield', title: 'Cotton' },
  { value: 'Tomato', image: 'photo-1592924357228-91a4daadcfea', alt: 'Tomato Farm Harvest', tag: 'Blight Care', title: 'Tomato' },
  { value: 'Wheat', image: 'photo-1574323347407-f5e1ad6d020b', alt: 'Golden Wheat Field', tag: 'Rust Control', title: 'Wheat' },
  { value: 'Sugarcane', image: 'photo-1719424668314-a0def541377b', alt: 'Sugarcane Plantation', tag: 'Borer Solution', title: 'Sugarcane' },
  { value: 'Corn', image: 'photo-1551754655-cd27e38d2076', alt: 'Corn Maize Field', tag: 'Armyworm Defense', title: 'Corn / Maize' },
  { value: 'Grapes', image: 'photo-1537640538966-79f369143f8f', alt: 'Grape clusters on the vine', tag: 'Mildew Protect', title: 'Grapes' },
  { value: 'Potato', image: 'photo-1518977676601-b53f82aba655', alt: 'Potato Crop Harvest', tag: 'Tuber Guard', title: 'Potato' },
]

const unsplash = (id, width) => photoUrl(`https://images.unsplash.com/${id}`, width)
const unsplashSet = id => photoSrcSet(`https://images.unsplash.com/${id}`)

export const CategoryGrid = memo(function CategoryGrid({ t, cms }) {
  const { filterByCategory } = useStore()
  const sectionTitle    = cmsText(cms, 'categoryGridTitle',    t('shop_by_category'))
  const sectionSubtitle = cmsText(cms, 'categoryGridSubtitle', 'Explore crop protection chemicals, bio-stimulants, and soil nutrients')
  return (
    <section className="section" id="categoriesSection" style={{ padding: '40px 0', background: '#ffffff' }}>
      <div className="container">
        <div className="section-header-flex">
          <div>
            <h2 className="section-title" data-i18n="shop_by_category">{sectionTitle}</h2>
            <p className="section-subtitle">{sectionSubtitle}</p>
          </div>
          <Link to="/categories" className="btn btn-outline">Shop All Categories <i className="fa-solid fa-arrow-right"></i></Link>
        </div>

        <div className="bento-grid-3" id="categoryCards">
          {CATEGORY_CARDS.map(card => (
            <div
              key={card.value}
              className={`bento-card cat-card${card.value === 'All' ? ' cat-card--all' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => filterByCategory(card.value)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); filterByCategory(card.value) } }}
              style={{ cursor: 'pointer' }}
            >
              <img src={unsplash(card.image, 800)} srcSet={unsplashSet(card.image)} sizes="(max-width: 768px) 50vw, 40vw" className="bento-bg-img" alt={card.alt} loading="lazy" decoding="async" />
              <div className="bento-overlay">
                <span className="bento-tag" style={card.tagStyle}>{card.tag}</span>
                <h3 className="bento-title">{card.title}</h3>
                <p className="bento-desc">{card.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
})

export const CropGrid = memo(function CropGrid({ cms }) {
  const { filterByCrop } = useStore()
  const cropTitle    = cmsText(cms, 'cropGridTitle',    'Shop by Crop')
  const cropSubtitle = cmsText(cms, 'cropGridSubtitle', 'Select your crop to get customized pesticide & nutrient recommendations')
  return (
    <section className="section" id="cropSection" style={{ background: 'var(--bg-section)', padding: '40px 0' }}>
      <div className="container">
        <div className="section-header-flex">
          <div>
            <h2 className="section-title">{cropTitle}</h2>
            <p className="section-subtitle">{cropSubtitle}</p>
          </div>
        </div>

        <div className="bento-grid-4" id="cropCards">
          {CROP_CARDS.map(card => (
            <div
              key={card.value}
              className="bento-card crop-card"
              role="button"
              tabIndex={0}
              onClick={() => filterByCrop(card.value)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); filterByCrop(card.value) } }}
              style={{ cursor: 'pointer' }}
            >
              <img src={unsplash(card.image, 800)} srcSet={unsplashSet(card.image)} sizes="(max-width: 768px) 50vw, 25vw" className="bento-bg-img" alt={card.alt} loading="lazy" decoding="async" />
              <div className="bento-overlay">
                <span className="bento-tag">{card.tag}</span>
                <h3 className="bento-title" style={{ fontSize: '1.15rem' }}>{card.title}</h3>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
})

const CERTIFICATIONS = [
  { image: 'photo-1586281380349-632531db7ed4', alt: 'ICAR Certified', label: 'ICAR Approved', icon: 'fa-flask', caption: 'Research-backed formulas' },
  { image: 'photo-1560472354-b33ff0c44a43', alt: 'ISO 9001', label: 'ISO 9001:2015', icon: 'fa-certificate', caption: 'Certified quality system' },
  { image: 'photo-1587614382346-4ec70e388b28', alt: 'Organic India', label: 'Organic India', icon: 'fa-leaf', caption: 'Organic farming inputs' },
  { image: 'photo-1571019613454-1cb2f99b2d8b', alt: 'GreenTech Award', label: 'GreenTech 2025', icon: 'fa-award', caption: 'Innovation award winner' },
  { image: 'photo-1559757148-5c350d0d3c56', alt: 'APEDA', label: 'APEDA Member', icon: 'fa-earth-asia', caption: 'Registered export member' },
]

// Titles, labels and logos can be changed in the admin CMS.
export const Certifications = memo(function Certifications({ settings }) {
  return (
    <section className="cert-strip" id="certificationsSection">
      <div className="container">
        <div className="cert-strip-header" id="certificationsTitle">{settings.certificationsTitle || 'Certifications & Recognitions'}</div>
        <p id="certificationsSubtitle" style={{ textAlign: 'center', color: 'var(--text-muted)', margin: '-10px 0 20px', display: settings.certificationsSubtitle ? 'block' : 'none' }}>
          {settings.certificationsSubtitle || ''}
        </p>
        <div className="cert-logos-row">
          {CERTIFICATIONS.map((item, index) => {
            const label = settings[`certification${index + 1}Label`]
            const customImage = settings[`certification${index + 1}Image`]
            // The shipped images are placeholder stock photos: desktop shows an icon badge instead
            // (Font Awesome, because the store's all:revert reset strips lucide SVG geometry).
            const isStock = !customImage || customImage.includes(item.image)
            return (
              <div className={`cert-logo-card${isStock ? ' is-stock' : ''}`} key={item.image}>
                <span className="cert-badge" aria-hidden="true"><i className={`fa-solid ${item.icon}`} /></span>
                <img
                  id={`certification${index + 1}Image`}
                  src={settings[`certification${index + 1}Image`] || unsplash(item.image, 120)}
                  alt={label || item.alt}
                  loading="lazy"
                  decoding="async"
                />
                <span className="cert-text">
                  <span id={`certification${index + 1}Label`}>{label || item.label}</span>
                  {isStock && <small className="cert-caption">{item.caption}</small>}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
})
