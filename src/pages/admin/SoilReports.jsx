import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import {
  FlaskConical,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  User,
  ShieldCheck,
  RefreshCw,
  Phone,
  Sparkles,
  Sprout,
  Send,
  Calendar,
  Layers,
  ArrowRight
} from 'lucide-react'
import { soilTestService } from '../../services/soilTestService'
import { useAuth } from '../../context/AuthContext'

export default function AdminSoilReports() {
  const { user } = useAuth()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedReport, setSelectedReport] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Edit prescription state
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)

  // Check if current staff user has permission or is admin/employee
  const hasFullAccess = user?.role === 'superadmin' || user?.role === 'admin' || (user?.permissions && user.permissions.includes('*'))

  // Read the selection through a ref so loadReports stays stable; depending
  // on selectedReport re-ran the load effect after every refresh, forever.
  const selectedRef = useRef(null)
  useEffect(() => { selectedRef.current = selectedReport }, [selectedReport])

  const loadReports = useCallback(async () => {
    setLoading(true)
    try {
      const list = await soilTestService.getReports()
      setReports(list)
      const selectedReport = selectedRef.current
      if (list.length > 0 && !selectedReport) {
        setSelectedReport(list[0])
        setNotes(list[0].agronomistNotes || '')
        setStatus(list[0].status)
      } else if (selectedReport) {
        const refreshed = list.find(r => r.id === selectedReport.id)
        if (refreshed) {
          setSelectedReport(refreshed)
          setNotes(refreshed.agronomistNotes || '')
          setStatus(refreshed.status)
        }
      }
    } catch {
      toast.error('Failed to load soil reports')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReports()
    const handleUpdate = () => loadReports()
    window.addEventListener('sathyam:soil-reports-updated', handleUpdate)
    return () => window.removeEventListener('sathyam:soil-reports-updated', handleUpdate)
  }, [loadReports])

  const handleSelect = (r) => {
    setSelectedReport(r)
    setNotes(r.agronomistNotes || '')
    setStatus(r.status)
  }

  const handleSavePrescription = async (e) => {
    e.preventDefault()
    if (!selectedReport) return

    setSaving(true)
    try {
      await soilTestService.updateReportStatus({
        reportId: selectedReport.id,
        status: status,
        agronomistNotes: notes
      })
      toast.success('Diagnosis & prescription saved successfully!')
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not save the prescription')
    } finally {
      setSaving(false)
    }
  }

  const filtered = reports.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (
        r.id?.toLowerCase().includes(q) ||
        r.farmerName?.toLowerCase().includes(q) ||
        r.phone?.includes(q) ||
        r.crop?.toLowerCase().includes(q)
      )
    }
    return true
  })

  const count = s => reports.filter(r => r.status === s).length
  const STATS = [
    ['Under Agronomist Analysis', 'Under analysis', 'is-amber', <Clock size={18} key="i" />],
    ['Prescription Issued', 'Prescription issued', 'is-green', <CheckCircle2 size={18} key="i" />],
    ['Completed', 'Completed', 'is-blue', <ShieldCheck size={18} key="i" />],
    ['all', 'All reports', '', <FlaskConical size={18} key="i" />]
  ]
  const statusChip = s => (s === 'Prescription Issued' ? 'p2-chip--green' : s === 'Completed' ? 'p2-chip--blue' : 'p2-chip--amber')
  const METRICS = [['pH', 'ph', ''], ['EC (dS/m)', 'ec', ''], ['OC (%)', 'oc', '%'], ['Nitrogen', 'nitrogen', ''], ['Phosphorus', 'phosphorus', ''], ['Potash', 'potassium', '']]

  return (
    <div className="animate-fade-in p2-staff">
      {/* Top Banner */}
      <div className="admin-hero">
        <div>
          <div className="eyebrow">Farmer services</div>
          <h1>Soil Test Reports &amp; Agronomy Prescriptions</h1>
          <p>
            {hasFullAccess
              ? 'All farmer soil test submissions across stores and online portal.'
              : `Soil test submissions assigned to you (${user?.name || 'Staff Agronomist'}).`}
          </p>
        </div>
        <button type="button" className="p2-btn p2-btn--outline p2-btn--sm" onClick={loadReports}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="p2-stats p2-stats--4">
        {STATS.map(([key, label, tone, icon]) => (
          <button key={key} type="button" className={`p2-stat ${tone}`} aria-pressed={statusFilter === key} onClick={() => setStatusFilter(key)}>
            <span className="p2-stat-icon">{icon}</span>
            <span className="p2-stat-value">{key === 'all' ? reports.length : count(key)}</span>
            <span className="p2-stat-label">{label}</span>
          </button>
        ))}
      </div>

      {/* Main Layout */}
      <div className="p2-split">

        {/* Left List */}
        <div className="p2-card p2-queue">
          <div className="p2-queue-head">
            <div className="p2-search">
              <Search size={16} />
              <input
                type="text"
                className="p2-input"
                placeholder="Search reports or farmers..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="p2-queue-list">
            {loading && reports.length === 0 ? (
              <div className="p2-loading">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="p2-empty">
                <div className="p2-empty-icon"><FlaskConical size={28} /></div>
                <p>No soil reports found</p>
              </div>
            ) : (
              filtered.map(r => (
                <button
                  key={r.id}
                  type="button"
                  className="p2-list-item"
                  aria-current={selectedReport?.id === r.id}
                  onClick={() => handleSelect(r)}
                >
                  <span className="p2-list-top">
                    <span className="p2-list-id">{r.id}</span>
                    <span className={`p2-chip ${statusChip(r.status)}`}>{r.status}</span>
                  </span>
                  <span className="p2-list-title">
                    {r.farmerName} <small className="p2-hint">({r.phone})</small>
                  </span>
                  <span className="p2-list-meta">
                    <span><Sprout size={13} /> Crop: <strong>{r.crop}</strong> · pH: {r.ph} · Score: {r.score}/100</span>
                  </span>
                  {r.assignedToName && (
                    <span className="p2-list-assigned">
                      <User size={12} /> Assigned: {r.assignedToName}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Details & Diagnosis */}
        {selectedReport ? (
          <div className="p2-card p2-thread">
            <div className="p2-thread-head">
              <div className="p2-thread-top">
                <div>
                  <div className="p2-thread-ids">
                    <span className={`p2-chip ${statusChip(selectedReport.status)}`}>{selectedReport.status}</span>
                  </div>
                  <h2>{selectedReport.id} — {selectedReport.farmerName}</h2>
                  <div className="p2-booking-meta" style={{ marginTop: 6 }}>
                    <a href={`tel:+91${selectedReport.phone}`} className="p2-link"><Phone size={14} /> {selectedReport.phone}</a>
                    <span>{selectedReport.village}, {selectedReport.district}</span>
                  </div>
                </div>
                <span className="p2-chip p2-chip--green">Score: {selectedReport.score}/100</span>
              </div>
            </div>

            <div className="p2-detail-pad">
              {/* Metrics */}
              <dl className="p2-kv">
                {METRICS.map(([label, key, unit]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>{selectedReport[key]}{unit}</dd>
                  </div>
                ))}
              </dl>

              {/* Target Crop Objective */}
              <div className="p2-quote p2-quote--green" style={{ marginBottom: 18 }}>
                <strong>Farmer's Target Crop: {selectedReport.crop} ({selectedReport.areaAcres} Acres, {selectedReport.soilType})</strong>
                <div style={{ marginTop: 2 }}>
                  Please review soil limits and provide pre-sowing soil amendment &amp; bio-fertilizer guidance.
                </div>
              </div>

              {/* Prescription Form */}
              <form onSubmit={handleSavePrescription}>
                <div className="p2-field" style={{ maxWidth: 320 }}>
                  <label className="p2-label">Prescription Status</label>
                  <select className="p2-input" value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="Under Agronomist Analysis">Under Agronomist Analysis</option>
                    <option value="Prescription Issued">Prescription Issued (Verified)</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>

                <div className="p2-field">
                  <label className="p2-label">Agronomist Follow-up Remarks &amp; Remedy Prescription</label>
                  <textarea
                    rows={4}
                    className="p2-input"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Enter pre-measures: Gypsum/Lime dosage, PSB application, Zinc spray schedule..."
                  />
                </div>

                <div className="p2-row" style={{ justifyContent: 'flex-end' }}>
                  <button type="submit" className="p2-btn p2-btn--primary" disabled={saving}>
                    <Send size={15} /> {saving ? 'Saving...' : 'Save & Issue Prescription'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
