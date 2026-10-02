import { useState, useRef, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { toast } from 'sonner'
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  Sprout,
  ArrowRight,
  Download,
  Printer,
  PhoneCall,
  Activity,
  Layers,
  Info,
  Check,
  RotateCcw,
  ShoppingCart,
  Send,
  User,
  MapPin,
  Clock,
  ChevronRight,
  ShieldCheck,
  Calendar,
  X
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { soilTestService, SAMPLE_SOIL_PRESETS, CROP_SUITABILITY_RULES } from '../services/soilTestService'
import ServicesBottomNav from '../components/common/ServicesBottomNav'

const SOIL_TYPES = [
  'Clay Loam',
  'Black Cotton Soil',
  'Red Sandy Loam',
  'Alluvial Soil',
  'Laterite Soil',
  'Sandy Clay Loam'
]

const ALL_CROPS = CROP_SUITABILITY_RULES.map(c => c.name)

export default function SoilTestReport() {
  const { user } = useAuth()
    const navigate = useNavigate()
  const fileInputRef = useRef(null)

  // Upload state
  const [uploadedFile, setUploadedFile] = useState(null)

  // Active view tab: 'analysis' | 'crop-suitability' | 'target-crop' | 'my-submissions'
  const [activeTab, setActiveTab] = useState('crop-suitability')

  // Parameter state
  const [soilData, setSoilData] = useState({
    soilType: 'Clay Loam',
    crop: user?.crop || 'Paddy/Rice',
    areaAcres: user?.acreage || 3,
    ph: 8.2,
    ec: 1.3,
    oc: 0.42,
    nitrogen: 215,
    phosphorus: 11.2,
    potassium: 190,
    zinc: 'Deficient',
    boron: 'Deficient',
    iron: 'Sufficient',
    sulphur: 'Deficient'
  })

  // Target crop for specific premeasures & remedies
  const [targetCrop, setTargetCrop] = useState(user?.crop || 'Paddy/Rice')

  // Analysis result
  const [result, setResult] = useState(() => soilTestService.analyzeSoil(soilData))

  // User submitted reports tracking
  const [submittedReports, setSubmittedReports] = useState([])
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitFormData, setSubmitFormData] = useState({
    farmerName: user?.name || '',
    phone: user?.phone || user?.mobile || '',
    village: user?.village || '',
    district: user?.district || '',
    remarks: ''
  })

  // Load user submitted reports
  const loadSubmissions = useCallback(async () => {
    if (!user) { setSubmittedReports([]); return }
    try {
      setSubmittedReports(await soilTestService.getReports())
    } catch {
      setSubmittedReports([])
    }
  }, [user])

  useEffect(() => {
    loadSubmissions()
    const handleUpdate = () => loadSubmissions()
    window.addEventListener('sathyam:soil-reports-updated', handleUpdate)
    return () => window.removeEventListener('sathyam:soil-reports-updated', handleUpdate)
  }, [loadSubmissions])

  // Recalculate analysis when target crop changes
  useEffect(() => {
    const updatedSoil = { ...soilData, crop: targetCrop }
    setSoilData(updatedSoil)
    const analyzed = soilTestService.analyzeSoil(updatedSoil)
    setResult(analyzed)
  }, [targetCrop])

  // Handle Preset load
  const loadPreset = (preset) => {
    setSoilData(preset.values)
    setTargetCrop(preset.values.crop)
    const analyzed = soilTestService.analyzeSoil(preset.values)
    setResult(analyzed)
    toast.success(`Loaded preset: ${preset.name}`)
  }

  // Attach the farmer's soil card. The file is not read here: the farmer
  // types the values from the card below, and staff see the file name with
  // the submitted report.
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      toast.error('That file is over 10MB. Please choose a smaller photo or PDF.')
      e.target.value = ''
      return
    }
    setUploadedFile(file)
    toast.success(`Attached ${file.name}`, {
      description: 'Now type the values from your soil card into the form below.'
    })
  }

  // Handle Manual Form Calculation
  const handleRecalculate = (e) => {
    e?.preventDefault()
    const analyzed = soilTestService.analyzeSoil(soilData)
    setResult(analyzed)
    toast.success('Soil health analysis & recommendations updated')
  }

  // Recommended products are real catalogue items; photo, price and label
  // dose come from the live catalogue, and buying happens on the product page
  // (real packs and prices).
  const [catalog, setCatalog] = useState(() => new Map())
  useEffect(() => {
    let cancelled = false
    axios.get('/api/products')
      .then(res => { if (!cancelled && Array.isArray(res?.data?.data)) setCatalog(new Map(res.data.data.map(p => [String(p.id), p]))) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  const liveProduct = (prod) => {
    const live = catalog.get(String(prod.id))
    return {
      ...prod,
      name: live?.name || prod.name,
      image: live?.image || live?.images?.[0] || null,
      price: Number(live?.price) > 0 ? Number(live.price) : null,
      dosage: live?.dosage || ''
    }
  }
  const handleViewProduct = (product) => navigate(`/product/${encodeURIComponent(product.id)}`)


  // Handle Submit Report to Agronomist / Super Admin
  const handleOpenSubmitModal = () => {
    setSubmitFormData({
      farmerName: user?.name || submitFormData.farmerName || '',
      phone: user?.phone || user?.mobile || submitFormData.phone || '',
      village: user?.village || submitFormData.village || '',
      district: user?.district || submitFormData.district || '',
      remarks: ''
    })
    setShowSubmitModal(true)
  }

  const handleSubmitReport = async (e) => {
    e.preventDefault()
    if (!user) {
      toast.error('Please sign in to submit your soil report for expert review')
      return
    }
    if (!submitFormData.farmerName.trim() || !submitFormData.phone.trim()) {
      toast.error('Please enter your Name and Mobile Number')
      return
    }

    setSubmitting(true)
    try {
      const record = await soilTestService.submitReport({
        ...submitFormData,
        ...soilData,
        crop: targetCrop,
        score: result.score,
        grade: result.grade,
        uploadedFileName: uploadedFile ? uploadedFile.name : null,
        suggestedProducts: result.recommendedProducts?.map(p => p.id) || []
      })

      setShowSubmitModal(false)
      loadSubmissions()
      setActiveTab('my-submissions')

      toast.success(`Soil report submitted! Tracking Code: ${record.id}`, {
        description: 'Our agronomy team will review your report.'
      })
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Could not submit the soil report')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '24px 16px 80px' }}>
      {/* Top Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)',
          borderRadius: 20,
          padding: '36px 32px',
          color: '#fff',
          boxShadow: '0 12px 36px rgba(4, 120, 87, 0.25)',
          marginBottom: 24,
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 780 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(4px)', padding: '4px 12px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 700, marginBottom: 12 }}>
            <Sparkles size={14} /> AI-Powered Soil Lab &amp; Crop Prescription Engine
          </div>
          <h1 style={{ margin: '0 0 10px', fontSize: '2.1rem', fontWeight: 900, lineHeight: 1.2 }}>
            Soil Test Report &amp; Crop Advisory
          </h1>
          <p style={{ margin: 0, fontSize: '0.98rem', opacity: 0.92, lineHeight: 1.6 }}>
            Upload your laboratory Soil Health Card or test metrics. Our agronomic engine provides <strong>accurate crop suitability suggestions</strong>, detailed <strong>pre-measures for target crops</strong>, and required <strong>soil amendments to buy</strong>.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 20 }}>
            <button
              type="button"
              onClick={handleOpenSubmitModal}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: '#ffffff',
                color: '#065f46',
                border: 'none',
                borderRadius: 8,
                padding: '10px 20px',
                fontSize: '0.88rem',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
              }}
            >
              <Send size={16} /> Submit Report for Agronomist Review
            </button>

            <Link
              to="/agronomy-experts"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(255,255,255,0.16)',
                border: '1px solid rgba(255,255,255,0.3)',
                color: '#fff',
                borderRadius: 8,
                padding: '10px 18px',
                fontSize: '0.88rem',
                fontWeight: 700,
                textDecoration: 'none'
              }}
            >
              <PhoneCall size={16} /> Book Certified Agronomist Callback
            </Link>
          </div>
        </div>
      </div>

      {/* Preset soil scenarios picker */}
      <div style={{ background: '#f8fafc', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px 20px', marginBottom: 24 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#334155', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Layers size={16} color="#059669" /> Or try a pre-configured regional soil report scenario:
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
          {SAMPLE_SOIL_PRESETS.map(preset => (
            <button
              key={preset.name}
              type="button"
              onClick={() => loadPreset(preset)}
              style={{
                textAlign: 'left',
                background: '#fff',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: '10px 14px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#059669'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.transform = 'none' }}
            >
              <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f172a' }}>{preset.name}</div>
              <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 2 }}>{preset.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Two Column Layout: Parameters & Upload on Left, Output & Analysis on Right */}
      <div className="p2-split" style={{ display: 'grid', gridTemplateColumns: 'var(--p2-split, minmax(320px, 380px) 1fr)', gap: 24, alignItems: 'start' }}>
        
        {/* LEFT COLUMN: Input form & file upload */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24, boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
          
          {/* File Upload Zone */}
          <div style={{ marginBottom: 22 }}>
            <h3 style={{ margin: '0 0 6px', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
              Upload Soil Test File
            </h3>
            <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: '#64748b' }}>
              Attach a PDF or photo of your Govt Soil Health Card or lab report, then type its values below.
            </p>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".pdf,.jpg,.jpeg,.png"
              style={{ display: 'none' }}
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed #94a3b8',
                borderRadius: 12,
                padding: '20px 16px',
                textAlign: 'center',
                cursor: 'pointer',
                background: uploadedFile ? '#f0fdf4' : '#f8fafc',
                transition: 'all 0.2s ease'
              }}
            >
              <Upload size={32} color={uploadedFile ? '#059669' : '#64748b'} style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#1e293b' }}>
                {uploadedFile ? `Attached: ${uploadedFile.name}` : 'Click to Attach Soil Test Card'}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 3 }}>
                Supports PDF, JPG, PNG (Max 10MB)
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 18, marginBottom: 18 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
              Soil Parameters &amp; Lab Data
            </h3>

            <form onSubmit={handleRecalculate}>
              {/* Soil Type */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Soil Texture / Type *
                </label>
                <select
                  value={soilData.soilType}
                  onChange={e => setSoilData({ ...soilData, soilType: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                >
                  {SOIL_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              {/* Area */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Farm Land Area (Acres) *
                </label>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={soilData.areaAcres}
                  onChange={e => setSoilData({ ...soilData, areaAcres: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              {/* pH Range */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
                    Soil Reaction (pH): <strong>{soilData.ph}</strong>
                  </label>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: result.parameters.ph.color }}>
                    {result.parameters.ph.status}
                  </span>
                </div>
                <input
                  type="range"
                  min="4.5"
                  max="9.5"
                  step="0.1"
                  value={soilData.ph}
                  onChange={e => setSoilData({ ...soilData, ph: parseFloat(e.target.value) })}
                  style={{ width: '100%', accentColor: '#059669' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8' }}>
                  <span>4.5 (Acidic)</span>
                  <span>7.0 (Neutral)</span>
                  <span>9.5 (Alkaline)</span>
                </div>
              </div>

              {/* EC & Organic Carbon */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    EC Salinity (dS/m)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    value={soilData.ec}
                    onChange={e => setSoilData({ ...soilData, ec: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Target: &lt; 1.0 dS/m</span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Organic Carbon (%)
                  </label>
                  <input
                    type="number"
                    step="0.02"
                    value={soilData.oc}
                    onChange={e => setSoilData({ ...soilData, oc: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Target: &gt; 0.75 %</span>
                </div>
              </div>

              {/* Available NPK */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Primary Macronutrients (kg/ha)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: '#64748b' }}>Nitrogen (N)</label>
                    <input
                      type="number"
                      value={soilData.nitrogen}
                      onChange={e => setSoilData({ ...soilData, nitrogen: e.target.value })}
                      style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: '#64748b' }}>Phosphate (P)</label>
                    <input
                      type="number"
                      value={soilData.phosphorus}
                      onChange={e => setSoilData({ ...soilData, phosphorus: e.target.value })}
                      style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.7rem', color: '#64748b' }}>Potash (K)</label>
                    <input
                      type="number"
                      value={soilData.potassium}
                      onChange={e => setSoilData({ ...soilData, potassium: e.target.value })}
                      style={{ width: '100%', padding: '7px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                    />
                  </div>
                </div>
              </div>

              {/* Micronutrients toggles */}
              <div style={{ marginBottom: 18, background: '#f8fafc', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Micronutrient Status
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.8rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={soilData.zinc === 'Deficient'}
                      onChange={e => setSoilData({ ...soilData, zinc: e.target.checked ? 'Deficient' : 'Sufficient' })}
                    />
                    Zinc Deficient
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={soilData.boron === 'Deficient'}
                      onChange={e => setSoilData({ ...soilData, boron: e.target.checked ? 'Deficient' : 'Sufficient' })}
                    />
                    Boron Deficient
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={soilData.sulphur === 'Deficient'}
                      onChange={e => setSoilData({ ...soilData, sulphur: e.target.checked ? 'Deficient' : 'Sufficient' })}
                    />
                    Sulphur Deficient
                  </label>
                </div>
              </div>

              <button
                type="submit"
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #059669, #047857)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '11px',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)'
                }}
              >
                Recalculate Crop Suitability
              </button>
            </form>
          </div>
        </div>

        {/* RIGHT COLUMN: Output, Tabs, Crop Suggestions & Pre-measures */}
        <div>
          {/* Header Scorecard */}
          <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24, boxShadow: '0 4px 12px rgba(0,0,0,0.04)', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Laboratory Soil Diagnosis
                </span>
                <h2 style={{ margin: '4px 0 2px', fontSize: '1.45rem', fontWeight: 800, color: '#0f172a' }}>
                  Soil Health Index &amp; Advisory
                </h2>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  Texture: <strong>{soilData.soilType}</strong> · pH {soilData.ph} · Area: {soilData.areaAcres} Acre(s)
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: result.score >= 75 ? '#059669' : result.score >= 60 ? '#d97706' : '#dc2626', lineHeight: 1 }}>
                    {result.score}<span style={{ fontSize: '1rem', color: '#94a3b8' }}>/100</span>
                  </div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginTop: 2 }}>
                    {result.grade}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handlePrint}
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                  title="Print Soil Prescription"
                >
                  <Printer size={15} /> Print
                </button>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: 20, gap: 4, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setActiveTab('crop-suitability')}
              style={{
                padding: '10px 18px',
                border: 'none',
                background: 'none',
                fontSize: '0.9rem',
                fontWeight: 800,
                color: activeTab === 'crop-suitability' ? '#059669' : '#64748b',
                borderBottom: activeTab === 'crop-suitability' ? '3px solid #059669' : '3px solid transparent',
                cursor: 'pointer',
                marginBottom: -2,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <span>🌾</span> Crop Suitability Suggestions ({result.cropSuitability?.length || 0})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('target-crop')}
              style={{
                padding: '10px 18px',
                border: 'none',
                background: 'none',
                fontSize: '0.9rem',
                fontWeight: 800,
                color: activeTab === 'target-crop' ? '#059669' : '#64748b',
                borderBottom: activeTab === 'target-crop' ? '3px solid #059669' : '3px solid transparent',
                cursor: 'pointer',
                marginBottom: -2,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <span>🎯</span> Target Crop Pre-measures &amp; Products
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('analysis')}
              style={{
                padding: '10px 18px',
                border: 'none',
                background: 'none',
                fontSize: '0.9rem',
                fontWeight: 800,
                color: activeTab === 'analysis' ? '#059669' : '#64748b',
                borderBottom: activeTab === 'analysis' ? '3px solid #059669' : '3px solid transparent',
                cursor: 'pointer',
                marginBottom: -2,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <span>🧪</span> Soil Chemical Metrics
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('my-submissions')}
              style={{
                padding: '10px 18px',
                border: 'none',
                background: 'none',
                fontSize: '0.9rem',
                fontWeight: 800,
                color: activeTab === 'my-submissions' ? '#059669' : '#64748b',
                borderBottom: activeTab === 'my-submissions' ? '3px solid #059669' : '3px solid transparent',
                cursor: 'pointer',
                marginBottom: -2,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <span>📋</span> My Submitted Reports ({submittedReports.length})
            </button>
          </div>

          {/* TAB 1: CROP SUITABILITY SUGGESTIONS */}
          {activeTab === 'crop-suitability' && (
            <div>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
                <h4 style={{ margin: '0 0 4px', fontSize: '0.92rem', fontWeight: 800, color: '#166534', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={16} /> Scientifically Ranked Crops for Your Soil
                </h4>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#14532d', lineHeight: 1.5 }}>
                  Based on your soil's pH ({soilData.ph}), Salinity ({soilData.ec} dS/m), Organic Carbon ({soilData.oc}%), and {soilData.soilType} texture, here is how different crops will perform naturally. Click any crop to view specific pre-measures.
                </p>
              </div>

              {/* Crop Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                {result.cropSuitability?.map(crop => {
                  const isHighlySuitable = crop.suitability === 'Highly Suitable'
                  const isConditional = crop.suitability === 'Conditionally Suitable'
                  const isTarget = targetCrop === crop.name

                  return (
                    <div
                      key={crop.name}
                      style={{
                        background: '#fff',
                        borderRadius: 14,
                        border: `1.5px solid ${isTarget ? '#059669' : isHighlySuitable ? '#bbf7d0' : isConditional ? '#fed7aa' : '#fecaca'}`,
                        padding: '16px',
                        boxShadow: isTarget ? '0 4px 14px rgba(5, 150, 105, 0.2)' : '0 2px 6px rgba(0,0,0,0.03)',
                        position: 'relative'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '1.6rem' }}>{crop.icon}</span>
                          <div>
                            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                              {crop.name}
                            </h4>
                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{crop.category}</span>
                          </div>
                        </div>

                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: 12,
                            background: isHighlySuitable ? '#dcfce7' : isConditional ? '#ffedd5' : '#fee2e2',
                            color: isHighlySuitable ? '#166534' : isConditional ? '#9a3412' : '#991b1b'
                          }}
                        >
                          {crop.score}% · {crop.suitability}
                        </span>
                      </div>

                      <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: '#475569', lineHeight: 1.45 }}>
                        {crop.description}
                      </p>

                      {/* Suitability Reasons / Limitations */}
                      <div style={{ fontSize: '0.75rem', marginBottom: 14 }}>
                        {crop.reasons?.slice(0, 2).map((r, i) => (
                          <div key={i} style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <Check size={12} /> {r}
                          </div>
                        ))}
                        {crop.limitations?.slice(0, 2).map((l, i) => (
                          <div key={i} style={{ color: '#d97706', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                            <AlertCircle size={12} /> {l}
                          </div>
                        ))}
                      </div>

                      {/* Action to target this crop */}
                      <button
                        type="button"
                        onClick={() => {
                          setTargetCrop(crop.name)
                          setActiveTab('target-crop')
                          toast.success(`Selected ${crop.name} as target crop!`)
                        }}
                        style={{
                          width: '100%',
                          background: isTarget ? '#059669' : '#f8fafc',
                          color: isTarget ? '#fff' : '#334155',
                          border: `1px solid ${isTarget ? '#059669' : '#cbd5e1'}`,
                          borderRadius: 6,
                          padding: '7px 10px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6
                        }}
                      >
                        {isTarget ? '✓ Currently Selected Crop' : 'Target This Crop & See Pre-measures'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* TAB 2: TARGET CROP PRE-MEASURES & REMEDIES */}
          {activeTab === 'target-crop' && (
            <div>
              {/* Target Crop Selector Header */}
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '18px 20px', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                      Selected Target Crop
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                      <span style={{ fontSize: '1.5rem' }}>{result.specificEvaluation?.targetCrop?.icon || '🌱'}</span>
                      <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: '#0f172a' }}>
                        {targetCrop}
                      </h3>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 600 }}>Change Crop:</span>
                    <select
                      value={targetCrop}
                      onChange={e => setTargetCrop(e.target.value)}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #059669', fontSize: '0.88rem', fontWeight: 700, color: '#065f46', background: '#ecfdf5' }}
                    >
                      {ALL_CROPS.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Gap warnings if any */}
                {result.specificEvaluation?.gaps?.length > 0 ? (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#b45309', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AlertTriangle size={15} /> Identified Soil Limitations for {targetCrop}:
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
                      {result.specificEvaluation.gaps.map((g, i) => (
                        <div key={i} style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px' }}>
                          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#92400e' }}>{g.parameter}</div>
                          <div style={{ fontSize: '0.74rem', color: '#78350f', marginTop: 2 }}>
                            Current: <strong>{g.current}</strong> · Required: {g.required}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#a16207', marginTop: 3 }}>{g.impact}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 12, fontSize: '0.82rem', color: '#16a34a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={16} /> Your soil chemistry is fully aligned with {targetCrop}!
                  </div>
                )}
              </div>

              {/* Step-by-Step Pre-measures */}
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>📋</span> Required Pre-measures &amp; Land Preparation Protocol
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {result.specificEvaluation?.premeasures?.map((step, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: '#fff',
                        borderRadius: 12,
                        border: '1px solid #e2e8f0',
                        padding: '16px 20px',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#059669', color: '#fff', fontSize: '0.8rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {step.step}
                          </span>
                          <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 800, color: '#0f172a' }}>
                            {step.title}
                          </h4>
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, background: '#eff6ff', color: '#1d4ed8', padding: '3px 8px', borderRadius: 6 }}>
                          🕒 {step.timing}
                        </span>
                      </div>

                      <p style={{ margin: '6px 0 10px', fontSize: '0.85rem', color: '#334155', lineHeight: 1.5 }}>
                        {step.instruction}
                      </p>

                      {step.product && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', flexWrap: 'wrap', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {liveProduct(step.product).image && <img src={liveProduct(step.product).image} alt={liveProduct(step.product).name} style={{ width: 32, height: 32, objectFit: 'contain' }} />}
                            <div>
                              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>{liveProduct(step.product).name}</div>
                              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Dosage: {liveProduct(step.product).dosage || 'as per product label'}</div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleViewProduct(step.product)}
                            style={{
                              background: '#059669',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 6,
                              padding: '6px 12px',
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                          >
                            <ShoppingCart size={13} /> View product{liveProduct(step.product).price ? ` (from ₹${liveProduct(step.product).price})` : ''}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Suggested Products to Buy */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>🛒</span> Suggested Products to Buy for {targetCrop}
                    </h3>
                    <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                      Certified bio-fertilizers and soil amendments matched to correct your soil deficits
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
                  {result.specificEvaluation?.suggestedProducts?.map(liveProduct).map(prod => (
                    <div
                      key={prod.id}
                      style={{
                        background: '#fff',
                        borderRadius: 14,
                        border: '1px solid #e2e8f0',
                        padding: 16,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
                      }}
                    >
                      <div>
                        <div style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', borderRadius: 8, marginBottom: 12 }}>
                          {prod.image && <img src={prod.image} alt={prod.name} style={{ maxHeight: 90, objectFit: 'contain' }} />}
                        </div>
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase' }}>
                          {prod.category}
                        </span>
                        <h4 style={{ margin: '2px 0 4px', fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>
                          {prod.name}
                        </h4>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 8 }}>
                          Dose: {prod.dosage || 'as per product label'}
                        </div>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: '#475569', lineHeight: 1.4, marginBottom: 12 }}>
                          {prod.benefit}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleViewProduct(prod)}
                        style={{
                          width: '100%',
                          background: 'linear-gradient(135deg, #059669, #047857)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 6,
                          padding: '9px 14px',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6
                        }}
                      >
                        <ShoppingCart size={15} /> View product{prod.price ? ` (from ₹${prod.price})` : ''}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SOIL CHEMICAL METRICS */}
          {activeTab === 'analysis' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
                {/* pH Card */}
                <div style={{ background: '#fff', padding: '14px 16px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>Soil pH (Reaction)</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: result.parameters.ph.color, margin: '4px 0' }}>
                    {result.parameters.ph.value}
                  </div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: result.parameters.ph.color }}>
                    {result.parameters.ph.status} (Target: {result.parameters.ph.optimalRange})
                  </span>
                </div>

                {/* EC Card */}
                <div style={{ background: '#fff', padding: '14px 16px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>Salinity (EC dS/m)</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: result.parameters.ec.color, margin: '4px 0' }}>
                    {result.parameters.ec.value}
                  </div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: result.parameters.ec.color }}>
                    {result.parameters.ec.status} (Target: {result.parameters.ec.optimalRange})
                  </span>
                </div>

                {/* OC Card */}
                <div style={{ background: '#fff', padding: '14px 16px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>Organic Carbon (%)</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: result.parameters.oc.color, margin: '4px 0' }}>
                    {result.parameters.oc.value}%
                  </div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: result.parameters.oc.color }}>
                    {result.parameters.oc.status} (Target: {result.parameters.oc.optimalRange})
                  </span>
                </div>

                {/* Nitrogen */}
                <div style={{ background: '#fff', padding: '14px 16px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>Available Nitrogen (N)</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: result.parameters.nitrogen.color, margin: '4px 0' }}>
                    {result.parameters.nitrogen.value} <small style={{ fontSize: '0.75rem', color: '#94a3b8' }}>kg/ha</small>
                  </div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: result.parameters.nitrogen.color }}>
                    {result.parameters.nitrogen.status}
                  </span>
                </div>

                {/* Phosphorus */}
                <div style={{ background: '#fff', padding: '14px 16px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>Available Phosphorus (P)</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: result.parameters.phosphorus.color, margin: '4px 0' }}>
                    {result.parameters.phosphorus.value} <small style={{ fontSize: '0.75rem', color: '#94a3b8' }}>kg/ha</small>
                  </div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: result.parameters.phosphorus.color }}>
                    {result.parameters.phosphorus.status}
                  </span>
                </div>

                {/* Potassium */}
                <div style={{ background: '#fff', padding: '14px 16px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>Available Potash (K)</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: result.parameters.potassium.color, margin: '4px 0' }}>
                    {result.parameters.potassium.value} <small style={{ fontSize: '0.75rem', color: '#94a3b8' }}>kg/ha</small>
                  </div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: result.parameters.potassium.color }}>
                    {result.parameters.potassium.status}
                  </span>
                </div>
              </div>

              {/* Detailed Expert Diagnostic Notes */}
              <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20 }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                  Laboratory Interpretation Notes
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.85rem', color: '#334155' }}>
                  <div>• <strong>pH Diagnosis:</strong> {result.parameters.ph.advice}</div>
                  <div>• <strong>Salinity Diagnosis:</strong> {result.parameters.ec.advice}</div>
                  <div>• <strong>Organic Matter Diagnosis:</strong> {result.parameters.oc.advice}</div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: MY SUBMITTED REPORTS */}
          {activeTab === 'my-submissions' && (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                    My Submitted Soil Test Reports
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                    Track your reports reviewed by Super Admin and assigned Agronomists
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleOpenSubmitModal}
                  style={{
                    background: '#059669',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 16px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Send size={14} /> Submit New Report
                </button>
              </div>

              {submittedReports.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                  <FileText size={44} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
                  <h4>No Soil Reports Submitted Yet</h4>
                  <p style={{ fontSize: '0.85rem', margin: '4px 0 16px' }}>
                    Submit your current soil test analysis above to receive certified agronomist feedback.
                  </p>
                  <button
                    type="button"
                    onClick={handleOpenSubmitModal}
                    style={{ background: '#059669', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Submit Report Now
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {submittedReports.map(report => (
                    <div
                      key={report.id}
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 12,
                        padding: '16px 20px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>{report.id}</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: 4, border: '1px solid #a7f3d0' }}>
                              Crop: {report.crop}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              · {new Date(report.createdAt).toLocaleDateString('en-IN')}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 3 }}>
                            Farmer: <strong>{report.farmerName}</strong> ({report.phone}) · {report.village}, {report.district}
                          </div>
                        </div>

                        {/* Status Badge */}
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            padding: '4px 10px',
                            borderRadius: 12,
                            background: report.status === 'Prescription Issued' ? '#dcfce7' : report.status === 'Under Agronomist Analysis' ? '#dbeafe' : '#fef3c7',
                            color: report.status === 'Prescription Issued' ? '#166534' : report.status === 'Under Agronomist Analysis' ? '#1e40af' : '#92400e'
                          }}
                        >
                          {report.status}
                        </span>
                      </div>

                      {/* Soil Metrics Overview */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: '0.78rem', background: '#fff', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 10 }}>
                        <span>Texture: <strong>{report.soilType}</strong></span>
                        <span>pH: <strong>{report.ph}</strong></span>
                        <span>EC: <strong>{report.ec}</strong></span>
                        <span>OC: <strong>{report.oc}%</strong></span>
                        <span>Score: <strong>{report.score}/100</strong></span>
                      </div>

                      {/* Assigned Agronomist Banner */}
                      {report.assignedToName && (
                        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '10px 14px', marginBottom: 8, fontSize: '0.82rem', color: '#065f46' }}>
                          <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <ShieldCheck size={16} /> Assigned Agronomist: {report.assignedToName} ({report.assignedDesignation || report.assignedRole})
                          </div>
                          {report.agronomistNotes && (
                            <div style={{ marginTop: 6, color: '#166534', whiteSpace: 'pre-line', background: '#fff', padding: '8px 12px', borderRadius: 6, border: '1px solid #bbf7d0' }}>
                              <strong>Expert Recommendation: </strong>
                              {report.agronomistNotes}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MODAL: SUBMIT SOIL REPORT */}
      {showSubmitModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16
          }}
          onClick={() => setShowSubmitModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 18,
              maxWidth: 540,
              width: '100%',
              padding: '24px 26px',
              boxShadow: '0 25px 50px rgba(0,0,0,0.25)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 34, height: 34, borderRadius: 8, background: '#dcfce7', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Send size={18} />
                </span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                    Submit Soil Report for Agronomist Verification
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    Super Admin &amp; certified plant pathologists will analyze your field
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitReport}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Farmer Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={submitFormData.farmerName}
                    onChange={e => setSubmitFormData({ ...submitFormData, farmerName: e.target.value })}
                    placeholder="e.g. Rameshwar Patel"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Mobile / WhatsApp Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={submitFormData.phone}
                    onChange={e => setSubmitFormData({ ...submitFormData, phone: e.target.value })}
                    placeholder="e.g. 9876543210"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Village / Town
                  </label>
                  <input
                    type="text"
                    value={submitFormData.village}
                    onChange={e => setSubmitFormData({ ...submitFormData, village: e.target.value })}
                    placeholder="e.g. Valavanthankottai"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    District &amp; State
                  </label>
                  <input
                    type="text"
                    value={submitFormData.district}
                    onChange={e => setSubmitFormData({ ...submitFormData, district: e.target.value })}
                    placeholder="e.g. Thanjavur, Tamil Nadu"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 14, background: '#f8fafc', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.8rem' }}>
                <div style={{ color: '#0f172a', fontWeight: 700 }}>Submitting Current Soil Snapshot:</div>
                <div style={{ color: '#64748b', marginTop: 2 }}>
                  Target Crop: <strong>{targetCrop}</strong> · Soil: {soilData.soilType} · pH: {soilData.ph} · EC: {soilData.ec} · Acres: {soilData.areaAcres}
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Additional Field Symptoms or Questions (Optional)
                </label>
                <textarea
                  rows={2}
                  value={submitFormData.remarks}
                  onChange={e => setSubmitFormData({ ...submitFormData, remarks: e.target.value })}
                  placeholder="e.g. Noticeable leaf yellowing, irrigation with borewell water..."
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    background: 'linear-gradient(135deg, #059669, #047857)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 22px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)'
                  }}
                >
                  {submitting ? 'Submitting...' : 'Confirm Submission'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bottom navigation */}
      <ServicesBottomNav />
    </div>
  )
}
