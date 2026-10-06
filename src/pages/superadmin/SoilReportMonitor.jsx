import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { toast } from 'sonner'
import {
  FlaskConical,
  Search,
  Filter,
  UserCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  User,
  ShieldCheck,
  RefreshCw,
  Phone,
  Calendar,
  Layers,
  ChevronDown,
  Sparkles,
  Sprout,
  Send,
  Lock,
  ExternalLink,
  X
} from 'lucide-react'
import { soilTestService } from '../../services/soilTestService'
import { useAuth } from '../../context/AuthContext'

export default function SoilReportMonitor() {
  const { user } = useAuth()
  const [reports, setReports] = useState([])
  const [staffList, setStaffList] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedReport, setSelectedReport] = useState(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [search, setSearch] = useState('')

  // Assignment Modal
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedStaffId, setSelectedStaffId] = useState('')
  const [assignNotes, setAssignNotes] = useState('')
  const [assigning, setAssigning] = useState(false)

  // Status & Note Update
  const [editNotes, setEditNotes] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [updating, setUpdating] = useState(false)

  // Load staff profiles from backend
  const loadStaff = useCallback(async () => {
    try {
      const res = await axios.get('/api/admin/staff-profiles').catch(() => null)
      if (res?.data?.data && Array.isArray(res.data.data) && res.data.data.length > 0) {
        const mapped = res.data.data.map(s => ({
          id: s.id || s._id,
          name: s.name,
          role: s.role,
          designation: s.profile?.designation || (s.role === 'admin' ? 'Store Administrator' : 'Operations Agronomist')
        }))
        setStaffList(mapped)
      }
    } catch {}
  }, [])

  // Load soil reports
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
        setEditNotes(list[0].agronomistNotes || '')
        setEditStatus(list[0].status)
      } else if (selectedReport) {
        const refreshed = list.find(r => r.id === selectedReport.id)
        if (refreshed) {
          setSelectedReport(refreshed)
          setEditNotes(refreshed.agronomistNotes || '')
          setEditStatus(refreshed.status)
        }
      }
    } catch {
      toast.error('Failed to load soil reports')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStaff()
    loadReports()

    const handleUpdate = () => loadReports()
    window.addEventListener('sathyam:soil-reports-updated', handleUpdate)
    return () => window.removeEventListener('sathyam:soil-reports-updated', handleUpdate)
  }, [loadStaff, loadReports])

  // Select Report
  const handleSelectReport = (r) => {
    setSelectedReport(r)
    setEditNotes(r.agronomistNotes || '')
    setEditStatus(r.status)
  }

  // Handle Assign to Staff / Employee
  const handleOpenAssignModal = () => {
    if (!selectedReport) return
    setSelectedStaffId(selectedReport.assignedToId || '')
    setAssignNotes('')
    setShowAssignModal(true)
  }

  const handleConfirmAssignment = async (e) => {
    e.preventDefault()
    if (!selectedStaffId) {
      toast.error('Please select an employee or admin to assign')
      return
    }

    const staffMember = staffList.find(s => s.id === selectedStaffId)
    if (!staffMember) return

    setAssigning(true)
    try {
      await soilTestService.assignReport({
        reportId: selectedReport.id,
        staffId: staffMember.id,
        staffDesignation: staffMember.designation,
        notes: assignNotes
      })

      setShowAssignModal(false)
      toast.success(`Soil report ${selectedReport.id} assigned to ${staffMember.name}!`, {
        description: `Designation: ${staffMember.designation}. They now have access to inspect and manage this report.`
      })
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not assign the report')
    } finally {
      setAssigning(false)
    }
  }

  // Handle Save Status & Notes
  const handleSavePrescription = async (e) => {
    e.preventDefault()
    if (!selectedReport) return

    setUpdating(true)
    try {
      await soilTestService.updateReportStatus({
        reportId: selectedReport.id,
        status: editStatus,
        agronomistNotes: editNotes
      })
      toast.success('Soil report status & prescription notes updated!')
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not update the report')
    } finally {
      setUpdating(false)
    }
  }

  // Filtered reports
  const filtered = reports.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (assigneeFilter === 'unassigned' && r.assignedToId) return false
    if (assigneeFilter !== 'all' && assigneeFilter !== 'unassigned' && r.assignedToId !== assigneeFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const match =
        r.id?.toLowerCase().includes(q) ||
        r.farmerName?.toLowerCase().includes(q) ||
        r.phone?.includes(q) ||
        r.crop?.toLowerCase().includes(q) ||
        r.district?.toLowerCase().includes(q)
      if (!match) return false
    }
    return true
  })

  // Metrics
  const totalCount = reports.length
  const pendingCount = reports.filter(r => r.status === 'Pending Review').length
  const assignedCount = reports.filter(r => r.assignedToId).length
  const completedCount = reports.filter(r => r.status === 'Prescription Issued' || r.status === 'Completed').length
  const avgScore = totalCount > 0 ? Math.round(reports.reduce((acc, r) => acc + (r.score || 70), 0) / totalCount) : 0

  const statusChip = s => (s === 'Prescription Issued' || s === 'Completed' ? 'p2-chip--green' : s === 'Under Agronomist Analysis' ? 'p2-chip--blue' : 'p2-chip--amber')
  const KPIS = [
    ['all', 'Total Soil Submissions', totalCount, 'From all online & store farmers', '', <FlaskConical size={18} key="i" />],
    ['Pending Review', 'Pending Agronomist Review', pendingCount, 'Awaiting analysis & delegation', 'is-amber', <Clock size={18} key="i" />],
    ['assigned', 'Assigned to Staff', assignedCount, 'Delegated to Agronomists / Admins', 'is-blue', <UserCheck size={18} key="i" />],
    ['Prescription Issued', 'Prescriptions Issued', completedCount, 'Verified & sent to farmers', 'is-green', <CheckCircle2 size={18} key="i" />]
  ]
  const LAB = [
    ['pH Reaction', selectedReport?.ph],
    ['EC Salinity', selectedReport ? `${selectedReport.ec} dS/m` : ''],
    ['Organic Carbon', selectedReport ? `${selectedReport.oc}%` : ''],
    ['Nitrogen (N)', selectedReport?.nitrogen],
    ['Phosphorus (P)', selectedReport?.phosphorus],
    ['Potash (K)', selectedReport?.potassium]
  ]

  return (
    <div className="sa-page p2-staff">
      {/* Header */}
      <div className="sa-page-head">
        <div>
          <div className="sa-eyebrow p2-inline-icon">
            <FlaskConical size={14} /> Enterprise Soil Health Surveillance
          </div>
          <h1 className="sa-title">Farmer Soil Test Reports Monitor</h1>
          <p className="sa-subtitle">
            Track incoming soil laboratory submissions from farmers across all regions. Delegate diagnostic tasks to certified Agronomists or store Admins and supervise expert prescriptions.
          </p>
        </div>

        <div className="p2-row">
          <Link to="/superadmin/permissions" className="p2-btn p2-btn--ghost p2-btn--sm">
            <ShieldCheck size={15} /> Manage Staff Module Permissions
          </Link>
          <button type="button" onClick={loadReports} className="p2-btn p2-btn--outline p2-btn--sm">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI Metrics (tap to filter) */}
      <div className="p2-stats p2-stats--4">
        {KPIS.map(([key, label, value, hint, tone, icon]) => (
          <button key={key} type="button" className={`p2-stat ${tone}`} aria-pressed={statusFilter === key} onClick={() => setStatusFilter(key === 'assigned' ? 'all' : key)} title={hint}>
            <span className="p2-stat-icon">{icon}</span>
            <span className="p2-stat-value">{value}</span>
            <span className="p2-stat-label">{label}</span>
          </button>
        ))}
      </div>
      <p className="p2-hint" style={{ margin: '-6px 0 14px' }}>
        Avg Soil Health Index: <strong>{avgScore}/100</strong> · Overall fertility baseline
      </p>

      {/* Main Two-Panel Layout */}
      <div className="p2-split">

        {/* LEFT PANEL: Filters & Submissions List */}
        <div className="p2-card p2-queue">
          <div className="p2-queue-head">
            <div className="p2-search">
              <Search size={16} />
              <input
                type="text"
                className="p2-input"
                placeholder="Search by ID, Farmer, Mobile, Crop..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="p2-grid-2 p2-grid-2--always">
              <select className="p2-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">All Statuses ({reports.length})</option>
                <option value="Pending Review">Pending Review ({reports.filter(r => r.status === 'Pending Review').length})</option>
                <option value="Under Agronomist Analysis">Under Analysis ({reports.filter(r => r.status === 'Under Agronomist Analysis').length})</option>
                <option value="Prescription Issued">Prescription Issued ({reports.filter(r => r.status === 'Prescription Issued').length})</option>
                <option value="Completed">Completed ({reports.filter(r => r.status === 'Completed').length})</option>
              </select>

              <select className="p2-input" value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}>
                <option value="all">All Staff Assignments</option>
                <option value="unassigned">Unassigned Only</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                ))}
              </select>
            </div>
          </div>

          {/* List */}
          <div className="p2-queue-list">
            {filtered.length === 0 ? (
              <div className="p2-empty">
                <div className="p2-empty-icon"><FlaskConical size={28} /></div>
                <p>No soil reports match the filters</p>
              </div>
            ) : (
              filtered.map(r => (
                <button
                  key={r.id}
                  type="button"
                  className="p2-list-item"
                  aria-current={selectedReport?.id === r.id}
                  onClick={() => handleSelectReport(r)}
                >
                  <span className="p2-list-top">
                    <span className="p2-list-id">{r.id}</span>
                    <span className={`p2-chip ${statusChip(r.status)}`}>{r.status}</span>
                  </span>
                  <span className="p2-list-title">
                    {r.farmerName} <small className="p2-hint">({r.phone})</small>
                  </span>
                  <span className="p2-list-meta">
                    <span>Crop: <strong>{r.crop}</strong> · {r.soilType} · pH {r.ph} · {r.areaAcres} Acres</span>
                  </span>
                  <span className="p2-list-meta" style={{ marginTop: 6 }}>
                    <span className={r.assignedToName ? 'p2-tone-green' : 'p2-tone-amber'}>
                      {r.assignedToName ? `👤 ${r.assignedToName}` : '⚠️ Unassigned'}
                    </span>
                    <span>{new Date(r.createdAt).toLocaleDateString('en-IN')}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Report Details, Delegation & Prescription Writing */}
        {selectedReport ? (
          <div className="p2-card p2-thread">

            {/* Report Header */}
            <div className="p2-thread-head">
              <div className="p2-thread-top">
                <div>
                  <div className="p2-thread-ids">
                    <span className="p2-thread-id">{selectedReport.id}</span>
                    <span className={`p2-chip ${statusChip(selectedReport.status)}`}>{selectedReport.status}</span>
                  </div>
                  <div className="p2-hint">
                    Submitted on {new Date(selectedReport.createdAt).toLocaleString('en-IN')}
                  </div>
                </div>

                {/* Assignment Button */}
                <button type="button" className="p2-btn p2-btn--primary p2-btn--sm" onClick={handleOpenAssignModal}>
                  <UserCheck size={16} /> {selectedReport.assignedToName ? 'Reassign Employee / Admin' : 'Assign to Agronomist / Employee'}
                </button>
              </div>
            </div>

            <div className="p2-detail-pad">
              {/* Current Assignment Status Banner */}
              <div className={`p2-assign-banner${selectedReport.assignedToName ? '' : ' is-open'}`}>
                <div>
                  <strong className="p2-inline-icon">
                    {selectedReport.assignedToName ? <ShieldCheck size={16} /> : <AlertTriangle size={16} />}
                    {selectedReport.assignedToName
                      ? `Assigned Staff: ${selectedReport.assignedToName} (${selectedReport.assignedDesignation || selectedReport.assignedRole})`
                      : 'Currently Unassigned — Assign an employee or store admin to investigate'}
                  </strong>
                  {selectedReport.assignedAt && (
                    <div className="p2-hint" style={{ marginTop: 2 }}>
                      Delegated by {selectedReport.assignedBy || 'Super Admin'} on {new Date(selectedReport.assignedAt).toLocaleString('en-IN')}
                    </div>
                  )}
                </div>

                {selectedReport.assignedToName && (
                  <button type="button" className="p2-btn p2-btn--outline p2-btn--sm" onClick={handleOpenAssignModal}>
                    Change Assignee
                  </button>
                )}
              </div>

              {/* Farmer & Land Card */}
              <div className="p2-info-grid">
                <div>
                  <span className="p2-kicker p2-kicker--muted">FARMER PROFILE</span>
                  <strong>{selectedReport.farmerName}</strong>
                  <a href={`tel:+91${selectedReport.phone}`} className="p2-link"><Phone size={13} /> {selectedReport.phone}</a>
                  <span>📍 {selectedReport.village || 'Local'}, {selectedReport.district || 'India'}</span>
                </div>
                <div>
                  <span className="p2-kicker p2-kicker--muted">LAND &amp; CROP OBJECTIVE</span>
                  <strong className="p2-tone-green">🌾 {selectedReport.crop}</strong>
                  <span>Area: <b>{selectedReport.areaAcres} Acres</b></span>
                  <span>Soil Texture: <b>{selectedReport.soilType}</b></span>
                </div>
                <div>
                  <span className="p2-kicker p2-kicker--muted">OVERALL SOIL INDEX</span>
                  <strong className="p2-big">{selectedReport.score}<small>/100</small></strong>
                  <span className="p2-tone-green">{selectedReport.grade}</span>
                </div>
              </div>

              {/* Soil Lab Parameters Grid */}
              <div className="p2-label" style={{ marginTop: 18 }}>Soil Chemical Metrics (Lab Values)</div>
              <dl className="p2-kv p2-kv--8">
                {LAB.map(([label, value]) => (
                  <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
                ))}
                <div><dt>Zinc Status</dt><dd className={selectedReport.zinc === 'Deficient' || !selectedReport.zinc ? 'p2-tone-red' : 'p2-tone-green'}>{selectedReport.zinc || 'Deficient'}</dd></div>
                <div><dt>Boron Status</dt><dd className={selectedReport.boron === 'Deficient' || !selectedReport.boron ? 'p2-tone-red' : 'p2-tone-green'}>{selectedReport.boron || 'Deficient'}</dd></div>
              </dl>

              {/* Agronomist Notes & Status Form */}
              <form onSubmit={handleSavePrescription} className="p2-form-box">
                <div className="p2-h3" style={{ fontSize: '0.95rem' }}>
                  <Sparkles size={16} /> Official Agronomist Prescription &amp; Action Notes
                </div>

                <div className="p2-field" style={{ maxWidth: 340 }}>
                  <label className="p2-label">Report Verification Status</label>
                  <select className="p2-input" value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                    <option value="Pending Review">Pending Review</option>
                    <option value="Under Agronomist Analysis">Under Agronomist Analysis</option>
                    <option value="Prescription Issued">Prescription Issued (Verified)</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>

                <div className="p2-field">
                  <label className="p2-label">Agronomist Technical Remarks / Pre-measure Recommendations</label>
                  <textarea
                    rows={4}
                    className="p2-input"
                    value={editNotes}
                    onChange={e => setEditNotes(e.target.value)}
                    placeholder="Enter detailed prescription: e.g. Gypsum application 300kg/acre basal, PSB drenching, Zinc foliar timing..."
                  />
                  <span className="p2-hint">
                    These remarks will be displayed on the farmer's portal dashboard under their submitted report.
                  </span>
                </div>

                <div className="p2-row" style={{ justifyContent: 'flex-end' }}>
                  <button type="submit" className="p2-btn p2-btn--primary" disabled={updating}>
                    <Send size={15} /> {updating ? 'Saving...' : 'Save Prescription & Sync'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          <div className="p2-card p2-empty">
            <div className="p2-empty-icon"><FlaskConical size={28} /></div>
            <h3>Select a soil report from the left</h3>
            <p>View complete soil diagnostics or delegate to an Agronomist.</p>
          </div>
        )}
      </div>

      {/* ASSIGNMENT MODAL */}
      {showAssignModal && selectedReport && (
        <div className="p2-backdrop" onClick={() => setShowAssignModal(false)}>
          <div className="p2-modal p2-staff" role="dialog" aria-modal="true" aria-labelledby="p2-assign-title" onClick={e => e.stopPropagation()}>
            <div className="p2-modal-head">
              <div>
                <h3 id="p2-assign-title">Assign Soil Report to Employee / Admin</h3>
                <p>Target Report: <strong>{selectedReport.id}</strong> ({selectedReport.farmerName})</p>
              </div>
              <button type="button" className="p2-close" aria-label="Close" onClick={() => setShowAssignModal(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleConfirmAssignment}>
              <div className="p2-modal-body">
                <div className="p2-field">
                  <label className="p2-label">Select Certified Employee / Store Admin *</label>
                  <select required className="p2-input" value={selectedStaffId} onChange={e => setSelectedStaffId(e.target.value)}>
                    <option value="">-- Choose Staff Personnel --</option>
                    {staffList.map(staff => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name} — {staff.designation} ({staff.role.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p2-field">
                  <label className="p2-label">Instructions / Guidance for the Assignee (Optional)</label>
                  <textarea
                    rows={3}
                    className="p2-input"
                    value={assignNotes}
                    onChange={e => setAssignNotes(e.target.value)}
                    placeholder="e.g. Please verify Cauvery delta alkalinity and recommend blast-resistant variety..."
                  />
                </div>
              </div>

              <div className="p2-modal-foot">
                <button type="button" className="p2-btn p2-btn--ghost" onClick={() => setShowAssignModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="p2-btn p2-btn--primary" disabled={assigning || !selectedStaffId}>
                  {assigning ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
