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

  const tone = s => (s >= 75 ? 'good' : s >= 60 ? 'mid' : 'bad')
  const suitTone = s => (s === 'Highly Suitable' ? 'good' : s === 'Conditionally Suitable' ? 'mid' : 'bad')
  const reportChip = s => (s === 'Prescription Issued' ? 'p2-chip--green' : s === 'Under Agronomist Analysis' ? 'p2-chip--blue' : 'p2-chip--amber')
  const METRICS = [
    ['ph', 'Soil pH (Reaction)', '', true],
    ['ec', 'Salinity (EC dS/m)', '', true],
    ['oc', 'Organic Carbon (%)', '%', true],
    ['nitrogen', 'Available Nitrogen (N)', 'kg/ha', false],
    ['phosphorus', 'Available Phosphorus (P)', 'kg/ha', false],
    ['potassium', 'Available Potash (K)', 'kg/ha', false]
  ]
  const TABS = [
    ['crop-suitability', '🌾', `Crop Suitability Suggestions (${result.cropSuitability?.length || 0})`],
    ['target-crop', '🎯', 'Target Crop Pre-measures & Products'],
    ['analysis', '🧪', 'Soil Chemical Metrics'],
    ['my-submissions', '📋', `My Submitted Reports (${submittedReports.length})`]
  ]

  return (
    <div className="p2-page p2-soil">
      {/* Top Banner (phones: compact, actions before the paragraph) */}
      <section className="p2-hero">
        <Layers className="p2-hero-art" aria-hidden="true" />
        <div className="p2-hero-inner">
          <div className="p2-eyebrow">
            <Sparkles size={14} /> AI-Powered Soil Lab &amp; Crop Prescription Engine
          </div>
          <h1 className="p2-hero-title">
            Soil Test Report &amp; Crop Advisory
          </h1>
          <p className="p2-hero-text">
            Upload your laboratory Soil Health Card or test metrics. Our agronomic engine provides <strong>accurate crop suitability suggestions</strong>, detailed <strong>pre-measures for target crops</strong>, and required <strong>soil amendments to buy</strong>.
          </p>

          <div className="p2-hero-actions">
            <button type="button" className="p2-btn p2-btn--light" onClick={handleOpenSubmitModal}>
              <Send size={16} /> Submit Report for Agronomist Review
            </button>
            <Link to="/agronomy-experts" className="p2-btn p2-btn--glass">
              <PhoneCall size={16} /> Book Certified Agronomist Callback
            </Link>
          </div>
        </div>
      </section>

      {/* Preset soil scenarios picker */}
      <div className="p2-card p2-presets">
        <div className="p2-section-label">
          <Layers size={16} /> Or try a pre-configured regional soil report scenario:
        </div>
        <div className="p2-preset-grid">
          {SAMPLE_SOIL_PRESETS.map(preset => (
            <button key={preset.name} type="button" className="p2-preset" onClick={() => loadPreset(preset)}>
              <strong>{preset.name}</strong>
              <span>{preset.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Two Column Layout: Parameters & Upload on Left, Output & Analysis on Right */}
      <div className="p2-split p2-split--soil">

        {/* LEFT COLUMN: Input form & file upload */}
        <div className="p2-card p2-card-pad p2-soil-form">

          {/* File Upload Zone */}
          <div>
            <h3 className="p2-card-title">Upload Soil Test File</h3>
            <p className="p2-card-sub">
              Attach a PDF or photo of your Govt Soil Health Card or lab report, then type its values below.
            </p>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".pdf,.jpg,.jpeg,.png"
              hidden
            />

            <button
              type="button"
              className={`p2-drop${uploadedFile ? ' is-attached' : ''}`}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadedFile ? <CheckCircle2 size={30} /> : <Upload size={30} />}
              <strong>{uploadedFile ? `Attached: ${uploadedFile.name}` : 'Click to Attach Soil Test Card'}</strong>
              <span>Supports PDF, JPG, PNG (Max 10MB)</span>
            </button>
          </div>

          <div className="p2-divider">
            <h3 className="p2-card-title" style={{ marginBottom: 14 }}>
              Soil Parameters &amp; Lab Data
            </h3>

            <form onSubmit={handleRecalculate}>
              {/* Soil Type */}
              <div className="p2-field">
                <label className="p2-label">Soil Texture / Type *</label>
                <select
                  className="p2-input"
                  value={soilData.soilType}
                  onChange={e => setSoilData({ ...soilData, soilType: e.target.value })}
                >
                  {SOIL_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              {/* Area */}
              <div className="p2-field">
                <label className="p2-label">Farm Land Area (Acres) *</label>
                <input
                  type="number"
                  className="p2-input"
                  min="0.5"
                  step="0.5"
                  value={soilData.areaAcres}
                  onChange={e => setSoilData({ ...soilData, areaAcres: e.target.value })}
                />
              </div>

              {/* pH Range */}
              <div className="p2-field">
                <div className="p2-range-head">
                  <label className="p2-label">
                    Soil Reaction (pH): <strong>{soilData.ph}</strong>
                  </label>
                  <span style={{ color: result.parameters.ph.color }}>{result.parameters.ph.status}</span>
                </div>
                <input
                  type="range"
                  className="p2-range"
                  min="4.5"
                  max="9.5"
                  step="0.1"
                  value={soilData.ph}
                  onChange={e => setSoilData({ ...soilData, ph: parseFloat(e.target.value) })}
                />
                <div className="p2-range-scale">
                  <span>4.5 (Acidic)</span>
                  <span>7.0 (Neutral)</span>
                  <span>9.5 (Alkaline)</span>
                </div>
              </div>

              {/* EC & Organic Carbon */}
              <div className="p2-grid-2 p2-grid-2--always">
                <div className="p2-field">
                  <label className="p2-label">EC Salinity (dS/m)</label>
                  <input
                    type="number"
                    className="p2-input"
                    step="0.05"
                    value={soilData.ec}
                    onChange={e => setSoilData({ ...soilData, ec: e.target.value })}
                  />
                  <span className="p2-hint">Target: &lt; 1.0 dS/m</span>
                </div>

                <div className="p2-field">
                  <label className="p2-label">Organic Carbon (%)</label>
                  <input
                    type="number"
                    className="p2-input"
                    step="0.02"
                    value={soilData.oc}
                    onChange={e => setSoilData({ ...soilData, oc: e.target.value })}
                  />
                  <span className="p2-hint">Target: &gt; 0.75 %</span>
                </div>
              </div>

              {/* Available NPK */}
              <fieldset className="p2-fieldset">
                <legend className="p2-label">Primary Macronutrients (kg/ha)</legend>
                <div className="p2-npk">
                  <label>
                    <span>Nitrogen (N)</span>
                    <input type="number" className="p2-input" value={soilData.nitrogen} onChange={e => setSoilData({ ...soilData, nitrogen: e.target.value })} />
                  </label>
                  <label>
                    <span>Phosphate (P)</span>
                    <input type="number" className="p2-input" value={soilData.phosphorus} onChange={e => setSoilData({ ...soilData, phosphorus: e.target.value })} />
                  </label>
                  <label>
                    <span>Potash (K)</span>
                    <input type="number" className="p2-input" value={soilData.potassium} onChange={e => setSoilData({ ...soilData, potassium: e.target.value })} />
                  </label>
                </div>
              </fieldset>

              {/* Micronutrients toggles */}
              <fieldset className="p2-fieldset p2-micro">
                <legend className="p2-label">Micronutrient Status</legend>
                <label className="p2-check">
                  <input
                    type="checkbox"
                    checked={soilData.zinc === 'Deficient'}
                    onChange={e => setSoilData({ ...soilData, zinc: e.target.checked ? 'Deficient' : 'Sufficient' })}
                  />
                  Zinc Deficient
                </label>
                <label className="p2-check">
                  <input
                    type="checkbox"
                    checked={soilData.boron === 'Deficient'}
                    onChange={e => setSoilData({ ...soilData, boron: e.target.checked ? 'Deficient' : 'Sufficient' })}
                  />
                  Boron Deficient
                </label>
                <label className="p2-check">
                  <input
                    type="checkbox"
                    checked={soilData.sulphur === 'Deficient'}
                    onChange={e => setSoilData({ ...soilData, sulphur: e.target.checked ? 'Deficient' : 'Sufficient' })}
                  />
                  Sulphur Deficient
                </label>
              </fieldset>

              <button type="submit" className="p2-btn p2-btn--primary p2-btn--block">
                <RotateCcw size={16} /> Recalculate Crop Suitability
              </button>
            </form>
          </div>
        </div>

        {/* RIGHT COLUMN: Output, Tabs, Crop Suggestions & Pre-measures */}
        <div className="p2-soil-out">
          {/* Header Scorecard */}
          <div className="p2-card p2-card-pad p2-score">
            <div className="p2-score-copy">
              <span className="p2-kicker">Laboratory Soil Diagnosis</span>
              <h2>Soil Health Index &amp; Advisory</h2>
              <div className="p2-card-sub">
                Texture: <strong>{soilData.soilType}</strong> · pH {soilData.ph} · Area: {soilData.areaAcres} Acre(s)
              </div>
            </div>

            <div className="p2-score-side">
              <div className={`p2-score-ring is-${tone(result.score)}`} style={{ '--p2-score': result.score }}>
                <span>{result.score}<small>/100</small></span>
              </div>
              <div className="p2-score-grade">{result.grade}</div>
              <button type="button" className="p2-btn p2-btn--ghost p2-btn--sm" onClick={handlePrint} title="Print Soil Prescription">
                <Printer size={15} /> Print
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="p2-tabs p2-tabs--wrap" role="tablist">
            {TABS.map(([key, icon, label]) => (
              <button key={key} type="button" role="tab" className="p2-tab" aria-selected={activeTab === key} onClick={() => setActiveTab(key)}>
                <span aria-hidden="true">{icon}</span> {label}
              </button>
            ))}
          </div>

          {/* TAB 1: CROP SUITABILITY SUGGESTIONS */}
          {activeTab === 'crop-suitability' && (
            <div>
              <div className="p2-note p2-note--stack">
                <strong><CheckCircle2 size={16} /> Scientifically Ranked Crops for Your Soil</strong>
                <p>
                  Based on your soil's pH ({soilData.ph}), Salinity ({soilData.ec} dS/m), Organic Carbon ({soilData.oc}%), and {soilData.soilType} texture, here is how different crops will perform naturally. Click any crop to view specific pre-measures.
                </p>
              </div>

              {/* Crop Grid */}
              <div className="p2-crop-grid">
                {result.cropSuitability?.map(crop => {
                  const isTarget = targetCrop === crop.name
                  return (
                    <div key={crop.name} className={`p2-crop is-${suitTone(crop.suitability)}${isTarget ? ' is-target' : ''}`}>
                      <div className="p2-crop-head">
                        <span className="p2-crop-icon" aria-hidden="true">{crop.icon}</span>
                        <div className="p2-crop-name">
                          <h4>{crop.name}</h4>
                          <span>{crop.category}</span>
                        </div>
                        <span className="p2-crop-score">{crop.score}% · {crop.suitability}</span>
                      </div>
                      <div className="p2-meter" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, crop.score))}%` }} /></div>

                      <p className="p2-crop-desc">{crop.description}</p>

                      {/* Suitability Reasons / Limitations */}
                      <ul className="p2-crop-notes">
                        {crop.reasons?.slice(0, 2).map((r, i) => (
                          <li key={`r${i}`} className="is-good"><Check size={12} /> {r}</li>
                        ))}
                        {crop.limitations?.slice(0, 2).map((l, i) => (
                          <li key={`l${i}`} className="is-mid"><AlertCircle size={12} /> {l}</li>
                        ))}
                      </ul>

                      {/* Action to target this crop */}
                      <button
                        type="button"
                        className={`p2-btn p2-btn--sm p2-btn--block ${isTarget ? 'p2-btn--primary' : 'p2-btn--ghost'}`}
                        onClick={() => {
                          setTargetCrop(crop.name)
                          setActiveTab('target-crop')
                          toast.success(`Selected ${crop.name} as target crop!`)
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
              <div className="p2-card p2-card-pad p2-target">
                <div className="p2-target-top">
                  <div>
                    <span className="p2-kicker p2-kicker--muted">Selected Target Crop</span>
                    <div className="p2-target-name">
                      <span aria-hidden="true">{result.specificEvaluation?.targetCrop?.icon || '🌱'}</span>
                      <h3>{targetCrop}</h3>
                    </div>
                  </div>

                  <label className="p2-target-pick">
                    <span>Change Crop:</span>
                    <select className="p2-input" value={targetCrop} onChange={e => setTargetCrop(e.target.value)}>
                      {ALL_CROPS.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                </div>

                {/* Gap warnings if any */}
                {result.specificEvaluation?.gaps?.length > 0 ? (
                  <div className="p2-gaps">
                    <div className="p2-gaps-title">
                      <AlertTriangle size={15} /> Identified Soil Limitations for {targetCrop}:
                    </div>
                    <div className="p2-gap-grid">
                      {result.specificEvaluation.gaps.map((g, i) => (
                        <div key={i} className="p2-gap">
                          <strong>{g.parameter}</strong>
                          <div>Current: <b>{g.current}</b> · Required: {g.required}</div>
                          <small>{g.impact}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p2-aligned">
                    <CheckCircle2 size={16} /> Your soil chemistry is fully aligned with {targetCrop}!
                  </div>
                )}
              </div>

              {/* Step-by-Step Pre-measures */}
              <h3 className="p2-h3"><span aria-hidden="true">📋</span> Required Pre-measures &amp; Land Preparation Protocol</h3>
              <ol className="p2-steps">
                {result.specificEvaluation?.premeasures?.map((step, idx) => {
                  const prod = step.product ? liveProduct(step.product) : null
                  return (
                    <li key={idx} className="p2-step">
                      <span className="p2-step-num">{step.step}</span>
                      <div className="p2-step-body">
                        <div className="p2-step-head">
                          <h4>{step.title}</h4>
                          <span className="p2-chip p2-chip--blue">🕒 {step.timing}</span>
                        </div>
                        <p>{step.instruction}</p>

                        {prod && (
                          <div className="p2-step-prod">
                            <div className="p2-step-prod-info">
                              {prod.image && <img src={prod.image} alt={prod.name} />}
                              <div>
                                <strong>{prod.name}</strong>
                                <span>Dosage: {prod.dosage || 'as per product label'}</span>
                              </div>
                            </div>
                            <button type="button" className="p2-btn p2-btn--primary p2-btn--sm" onClick={() => handleViewProduct(step.product)}>
                              <ShoppingCart size={13} /> View product{prod.price ? ` (from ₹${prod.price})` : ''}
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>

              {/* Suggested Products to Buy */}
              <h3 className="p2-h3"><span aria-hidden="true">🛒</span> Suggested Products to Buy for {targetCrop}</h3>
              <p className="p2-card-sub" style={{ margin: '-6px 0 14px' }}>
                Certified bio-fertilizers and soil amendments matched to correct your soil deficits
              </p>

              <div className="p2-prod-grid">
                {result.specificEvaluation?.suggestedProducts?.map(liveProduct).map(prod => (
                  <div key={prod.id} className="p2-card p2-prod">
                    <div>
                      <div className="p2-prod-img">
                        {prod.image ? <img src={prod.image} alt={prod.name} /> : <Sprout size={36} />}
                      </div>
                      <span className="p2-kicker">{prod.category}</span>
                      <h4>{prod.name}</h4>
                      <div className="p2-prod-dose">Dose: {prod.dosage || 'as per product label'}</div>
                      <p>{prod.benefit}</p>
                    </div>

                    <button type="button" className="p2-btn p2-btn--primary p2-btn--sm p2-btn--block" onClick={() => handleViewProduct(prod)}>
                      <ShoppingCart size={15} /> View product{prod.price ? ` (from ₹${prod.price})` : ''}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: SOIL CHEMICAL METRICS */}
          {activeTab === 'analysis' && (
            <div>
              <div className="p2-metric-grid">
                {METRICS.map(([key, label, unit, showRange]) => {
                  const m = result.parameters[key]
                  return (
                    <div key={key} className="p2-card p2-metric" style={{ '--p2-metric': m.color }}>
                      <div className="p2-metric-label">{label}</div>
                      <div className="p2-metric-value">
                        {m.value}{unit === '%' ? '%' : null} {unit === 'kg/ha' && <small>kg/ha</small>}
                      </div>
                      <span className="p2-metric-status">
                        {m.status}{showRange ? ` (Target: ${m.optimalRange})` : ''}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Detailed Expert Diagnostic Notes */}
              <div className="p2-card p2-card-pad">
                <h4 className="p2-card-title" style={{ fontSize: '1rem', marginBottom: 12 }}>Laboratory Interpretation Notes</h4>
                <ul className="p2-bullets">
                  <li><strong>pH Diagnosis:</strong> {result.parameters.ph.advice}</li>
                  <li><strong>Salinity Diagnosis:</strong> {result.parameters.ec.advice}</li>
                  <li><strong>Organic Matter Diagnosis:</strong> {result.parameters.oc.advice}</li>
                </ul>
              </div>
            </div>
          )}

          {/* TAB 4: MY SUBMITTED REPORTS */}
          {activeTab === 'my-submissions' && (
            <div className="p2-card p2-card-pad">
              <div className="p2-section-head">
                <div>
                  <h3 className="p2-card-title">My Submitted Soil Test Reports</h3>
                  <p className="p2-card-sub">Track your reports reviewed by Super Admin and assigned Agronomists</p>
                </div>
                <button type="button" className="p2-btn p2-btn--primary p2-btn--sm" onClick={handleOpenSubmitModal}>
                  <Send size={14} /> Submit New Report
                </button>
              </div>

              {submittedReports.length === 0 ? (
                <div className="p2-empty">
                  <div className="p2-empty-icon"><FileText size={28} /></div>
                  <h4>No Soil Reports Submitted Yet</h4>
                  <p>Submit your current soil test analysis above to receive certified agronomist feedback.</p>
                  <button type="button" className="p2-btn p2-btn--primary p2-btn--sm" onClick={handleOpenSubmitModal}>
                    Submit Report Now
                  </button>
                </div>
              ) : (
                <div className="p2-stack">
                  {submittedReports.map(report => (
                    <div key={report.id} className="p2-report">
                      <div className="p2-booking-top">
                        <div>
                          <div className="p2-thread-ids">
                            <span className="p2-list-id">{report.id}</span>
                            <span className="p2-chip p2-chip--green">Crop: {report.crop}</span>
                            <span className="p2-hint">· {new Date(report.createdAt).toLocaleDateString('en-IN')}</span>
                          </div>
                          <div className="p2-hint">
                            Farmer: <strong>{report.farmerName}</strong> ({report.phone}) · {report.village}, {report.district}
                          </div>
                        </div>

                        {/* Status Badge */}
                        <span className={`p2-chip ${reportChip(report.status)}`}>{report.status}</span>
                      </div>

                      {/* Soil Metrics Overview */}
                      <div className="p2-report-metrics">
                        <span>Texture: <strong>{report.soilType}</strong></span>
                        <span>pH: <strong>{report.ph}</strong></span>
                        <span>EC: <strong>{report.ec}</strong></span>
                        <span>OC: <strong>{report.oc}%</strong></span>
                        <span>Score: <strong>{report.score}/100</strong></span>
                      </div>

                      {/* Assigned Agronomist Banner */}
                      {report.assignedToName && (
                        <div className="p2-quote p2-quote--green">
                          <strong className="p2-inline-icon">
                            <ShieldCheck size={16} /> Assigned Agronomist: {report.assignedToName} ({report.assignedDesignation || report.assignedRole})
                          </strong>
                          {report.agronomistNotes && (
                            <div className="p2-quote" style={{ marginTop: 8, whiteSpace: 'pre-line' }}>
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
        <div className="p2-backdrop" onClick={() => setShowSubmitModal(false)}>
          <div className="p2-modal" role="dialog" aria-modal="true" aria-labelledby="p2-soil-title" onClick={e => e.stopPropagation()}>
            <div className="p2-modal-head">
              <div className="p2-modal-titlerow">
                <span className="p2-note-icon"><Send size={18} /></span>
                <div>
                  <h3 id="p2-soil-title">Submit Soil Report for Agronomist Verification</h3>
                  <p>Super Admin &amp; certified plant pathologists will analyze your field</p>
                </div>
              </div>
              <button type="button" className="p2-close" aria-label="Close" onClick={() => setShowSubmitModal(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitReport}>
              <div className="p2-modal-body">
                <div className="p2-grid-2">
                  <div className="p2-field">
                    <label className="p2-label">Farmer Full Name *</label>
                    <input
                      type="text"
                      className="p2-input"
                      required
                      value={submitFormData.farmerName}
                      onChange={e => setSubmitFormData({ ...submitFormData, farmerName: e.target.value })}
                      placeholder="e.g. Rameshwar Patel"
                    />
                  </div>

                  <div className="p2-field">
                    <label className="p2-label">Mobile / WhatsApp Number *</label>
                    <input
                      type="tel"
                      className="p2-input"
                      required
                      value={submitFormData.phone}
                      onChange={e => setSubmitFormData({ ...submitFormData, phone: e.target.value })}
                      placeholder="e.g. 9876543210"
                    />
                  </div>
                </div>

                <div className="p2-grid-2">
                  <div className="p2-field">
                    <label className="p2-label">Village / Town</label>
                    <input
                      type="text"
                      className="p2-input"
                      value={submitFormData.village}
                      onChange={e => setSubmitFormData({ ...submitFormData, village: e.target.value })}
                      placeholder="e.g. Valavanthankottai"
                    />
                  </div>

                  <div className="p2-field">
                    <label className="p2-label">District &amp; State</label>
                    <input
                      type="text"
                      className="p2-input"
                      value={submitFormData.district}
                      onChange={e => setSubmitFormData({ ...submitFormData, district: e.target.value })}
                      placeholder="e.g. Thanjavur, Tamil Nadu"
                    />
                  </div>
                </div>

                <div className="p2-quote" style={{ marginBottom: 14 }}>
                  <strong>Submitting Current Soil Snapshot:</strong>
                  <div className="p2-hint" style={{ marginTop: 2 }}>
                    Target Crop: <strong>{targetCrop}</strong> · Soil: {soilData.soilType} · pH: {soilData.ph} · EC: {soilData.ec} · Acres: {soilData.areaAcres}
                  </div>
                </div>

                <div className="p2-field">
                  <label className="p2-label">Additional Field Symptoms or Questions (Optional)</label>
                  <textarea
                    rows={2}
                    className="p2-input"
                    value={submitFormData.remarks}
                    onChange={e => setSubmitFormData({ ...submitFormData, remarks: e.target.value })}
                    placeholder="e.g. Noticeable leaf yellowing, irrigation with borewell water..."
                  />
                </div>
              </div>

              <div className="p2-modal-foot">
                <button type="button" className="p2-btn p2-btn--ghost" onClick={() => setShowSubmitModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="p2-btn p2-btn--primary" disabled={submitting}>
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
