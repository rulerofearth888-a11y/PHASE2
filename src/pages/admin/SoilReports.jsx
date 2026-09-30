import { useState, useEffect, useCallback } from 'react'
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

  const loadReports = useCallback(async () => {
    setLoading(true)
    try {
      const list = soilTestService.getReports({
        role: user?.role || 'employee',
        staffId: user?.id || user?._id || 'u3',
        hasAllAccess: hasFullAccess
      })
      setReports(list)
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
  }, [user, hasFullAccess, selectedReport])

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

  const handleSavePrescription = (e) => {
    e.preventDefault()
    if (!selectedReport) return

    setSaving(true)
    setTimeout(() => {
      soilTestService.updateReportStatus({
        reportId: selectedReport.id,
        status: status,
        agronomistNotes: notes
      })
      setSaving(false)
      toast.success('Diagnosis & prescription saved successfully!')
      loadReports()
    }, 500)
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

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 16px 80px' }}>
      {/* Top Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <FlaskConical size={24} color="#059669" /> Soil Test Reports &amp; Agronomy Prescriptions
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748b' }}>
            {hasFullAccess
              ? 'All farmer soil test submissions across stores and online portal.'
              : `Soil test submissions assigned to you (${user?.name || 'Staff Agronomist'}).`}
          </p>
        </div>

        <button
          type="button"
          onClick={loadReports}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: '#fff',
            border: '1px solid #cbd5e1',
            padding: '8px 14px',
            borderRadius: 8,
            fontSize: '0.82rem',
            fontWeight: 700,
            color: '#334155',
            cursor: 'pointer'
          }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Main Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) 1fr', gap: 20, alignItems: 'start' }}>
        
        {/* Left List */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Search reports or farmers..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.84rem' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '640px', overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                <FlaskConical size={32} color="#cbd5e1" style={{ margin: '0 auto 8px' }} />
                <div>No soil reports found</div>
              </div>
            ) : (
              filtered.map(r => {
                const isSelected = selectedReport?.id === r.id
                return (
                  <div
                    key={r.id}
                    onClick={() => handleSelect(r)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 8,
                      border: `1.5px solid ${isSelected ? '#059669' : '#e2e8f0'}`,
                      background: isSelected ? '#f0fdf4' : '#fff',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a' }}>{r.id}</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 6px', borderRadius: 6, background: r.status === 'Prescription Issued' ? '#dcfce7' : '#fef3c7', color: r.status === 'Prescription Issued' ? '#166534' : '#92400e' }}>
                        {r.status}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>
                      {r.farmerName} <small style={{ color: '#64748b' }}>({r.phone})</small>
                    </div>

                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 3 }}>
                      Crop: <strong>{r.crop}</strong> · pH: {r.ph} · Score: {r.score}/100
                    </div>

                    {r.assignedToName && (
                      <div style={{ fontSize: '0.72rem', color: '#047857', marginTop: 4 }}>
                        👤 Assigned: {r.assignedToName}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right Details & Diagnosis */}
        {selectedReport ? (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #f1f5f9', paddingBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                  {selectedReport.id} — {selectedReport.farmerName}
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>
                  📞 {selectedReport.phone} · {selectedReport.village}, {selectedReport.district}
                </div>
              </div>

              <span style={{ fontSize: '0.78rem', fontWeight: 800, background: '#ecfdf5', color: '#065f46', padding: '4px 10px', borderRadius: 10 }}>
                Score: {selectedReport.score}/100
              </span>
            </div>

            {/* Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 18 }}>
              <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>pH</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{selectedReport.ph}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>EC (dS/m)</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{selectedReport.ec}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>OC (%)</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{selectedReport.oc}%</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Nitrogen</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{selectedReport.nitrogen}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Phosphorus</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{selectedReport.phosphorus}</div>
              </div>
              <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 6, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Potash</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>{selectedReport.potassium}</div>
              </div>
            </div>

            {/* Target Crop Objective */}
            <div style={{ background: '#f0fdf4', padding: '12px 16px', borderRadius: 8, border: '1px solid #bbf7d0', marginBottom: 18 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#166534' }}>
                Farmer's Target Crop: <strong>{selectedReport.crop}</strong> ({selectedReport.areaAcres} Acres, {selectedReport.soilType})
              </div>
              <div style={{ fontSize: '0.75rem', color: '#14532d', marginTop: 2 }}>
                Please review soil limits and provide pre-sowing soil amendment &amp; bio-fertilizer guidance.
              </div>
            </div>

            {/* Prescription Form */}
            <form onSubmit={handleSavePrescription}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Prescription Status
                </label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  style={{ width: '100%', maxWidth: 280, padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}
                >
                  <option value="Under Agronomist Analysis">Under Agronomist Analysis</option>
                  <option value="Prescription Issued">Prescription Issued (Verified)</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Agronomist Follow-up Remarks &amp; Remedy Prescription
                </label>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Enter pre-measures: Gypsum/Lime dosage, PSB application, Zinc spray schedule..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.85rem', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    background: '#059669',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 20px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {saving ? 'Saving...' : 'Save & Issue Prescription'}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  )
}
