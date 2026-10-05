import { useEffect, useState } from 'react'
import { ArrowLeft, FlaskConical, ShieldCheck } from 'lucide-react'
import axios from 'axios'
import { useNavigate, useParams } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext'
import { productText } from '../shared/productText'

export default function IngredientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [product, setProduct] = useState(null)
  const { lang } = useLanguage()

  useEffect(() => {
    axios.get(`/api/products/${encodeURIComponent(id)}`).then(({ data }) => setProduct(data.data)).catch(() => setProduct(null))
  }, [id])

  if (!product) return <div className="product-detail-page"><div className="empty-state"><p>Ingredient information is unavailable.</p><button className="btn btn-primary" onClick={() => navigate(`/product/${id}`)}>Back to product</button></div></div>

  return (
    <div className="product-detail-page animate-fade-in">
      <button className="btn btn-ghost product-back-button" onClick={() => navigate(`/product/${product.id}`)}><ArrowLeft size={17} /> Back to product</button>
      <section className="ingredient-page-hero">
        <div className="ingredient-icon"><FlaskConical size={36} /></div>
        <span className="badge badge-blue">Ingredient profile</span>
        <h1>{product.activeIngredient || 'Active ingredient information'}</h1>
        <p>{product.name}</p>
      </section>
      <div className="product-detail-content-grid">
        <section className="product-detail-section"><h2>What it contains</h2><p>{product.activeIngredient || 'The administrator has not published ingredient information yet.'}</p></section>
        <section className="product-detail-section"><h2>Application dosage</h2><p>{productText(product, 'dosage', lang) || 'Dosage guidance has not been published yet.'}</p></section>
      </div>
      <section className="product-detail-section"><h2><ShieldCheck size={20} /> Handling and application note</h2><p>{productText(product, 'howToUse', lang) || 'Follow the product label and local agricultural guidance. Do not apply beyond the published dosage.'}</p></section>
    </div>
  )
}
