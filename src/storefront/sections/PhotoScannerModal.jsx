import { memo } from 'react'
import Modal from './Modal'
import ComingSoon from '../../components/ComingSoon'

// AI Image Recognition Scanner is Phase 3 work — not part of this
// presentation build. Real implementation kept below, commented out, to
// restore later.

/*
import { useEffect, useRef, useState } from 'react'
import { useStore } from '../StoreContext'
import { SAMPLE_DISEASE_DIAGNOSES } from '../data'
import { showToast } from '../toast'

const NO_FILE = 'JPG or PNG · a clear, close-up photo'

function PhotoScannerModalReal({ state, t }) {
  const { addToCart, closeModal, findRemedyProduct } = useStore()
  const inputRef = useRef(null)
  const timer = useRef(null)
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState(null) // null | 'scanning' | 'done'

  useEffect(() => () => clearTimeout(timer.current), [])

  const diagnose = () => {
    if (!inputRef.current?.files?.length) {
      showToast('Please select a leaf photo first.', 'warning')
      return
    }
    setResult('scanning')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setResult('done'), 1200)
  }

  const diag = SAMPLE_DISEASE_DIAGNOSES[0]
  const remedy = findRemedyProduct(diag.keyword)

  // This diagnosis is a fixed demo result (no real image analysis runs on the
  // uploaded photo) — but the remedy it offers must be a product that is
  // actually live in the catalog right now, not a hardcoded id from the old
  // static product list.
  const handleAddRemedy = () => {
    const product = findRemedyProduct(diag.keyword)
    if (!product) {
      showToast('No matching product is currently in stock for this diagnosis. Please call our agronomist helpline.', 'warning')
      return
    }
    addToCart(product.id)
    closeModal('photoScannerModal')
  }
  return (
    <Modal id="photoScannerModal" state={state}>
      <h3 style={{ color: 'var(--primary-dark)', marginBottom: '14px' }}><i className="fa-solid fa-camera"></i> <span data-i18n="scan_title">{t('scan_title')}</span></h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '14px' }} data-i18n="scan_desc">{t('scan_desc')}</p>
      <label className="upload-dropzone" htmlFor="diseasePhotoInput">
        <input ref={inputRef} type="file" accept="image/*" id="diseasePhotoInput" onChange={event => setFileName(event.target.files[0]?.name || '')} />
        <span className="upload-dropzone-icon"><i className="fa-solid fa-camera"></i></span>
        <strong>Take or upload a leaf photo</strong>
        <small id="diseasePhotoName">{fileName || NO_FILE}</small>
      </label>
      <button className="btn btn-gold" id="analyzePhotoBtn" style={{ width: '100%', justifyContent: 'center' }} onClick={diagnose}><i className="fa-solid fa-microscope"></i> Diagnose Crop Disease</button>
      <div id="photoScannerResult" style={{ marginTop: '14px' }}>
        {result === 'scanning' && (
          <div style={{ textAlign: 'center', padding: '16px' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '1.8rem', color: 'var(--primary)', marginBottom: '8px' }}></i>
            <p style={{ color: 'var(--primary)', fontWeight: 700, marginTop: '8px' }}>Scanning leaf structure for fungal spores...</p>
          </div>
        )}
        {result === 'done' && (
          <div style={{ background: '#ffffff', border: '1px solid var(--border-light)', padding: '14px', borderRadius: '8px', marginTop: '12px' }}>
            <span style={{ background: '#fef2f2', color: '#ef4444', padding: '3px 8px', borderRadius: '4px', fontWeight: 700, fontSize: '0.75rem' }}>Match: {diag.confidence}</span>
            <h3 style={{ margin: '8px 0 4px 0', fontSize: '1.05rem', color: 'var(--primary-dark)' }}>{diag.diseaseName}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '8px' }}>{diag.symptoms}</p>
            <div style={{ background: '#F1F7F3', padding: '8px', borderRadius: '6px', fontSize: '0.82rem', marginBottom: '10px' }}>
              <strong>Remedy:</strong> {remedy ? remedy.name : 'Ask our agronomist for a remedy that suits your field.'}
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={handleAddRemedy}>
              <i className="fa-solid fa-cart-plus"></i> Add Remedy to Cart
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
*/

export default memo(function PhotoScannerModal({ state }) {
  return (
    <Modal id="photoScannerModal" state={state}>
      <ComingSoon title="AI crop scanner — coming soon" message="Upload a leaf photo for an instant diagnosis, coming in the next phase." />
    </Modal>
  )
})
