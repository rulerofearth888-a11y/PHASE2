import { useState, useEffect, useCallback } from 'react'
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

// Default staff if API is unreachable
const DEFAULT_STAFF = [
  { id: 'USR-0002', name: 'Store Admin - Coimbatore HQ', role: 'admin', designation: 'General Store Admin' },
  { id: 'USR-0004', name: 'Branch Admin - Madurai', role: 'admin', designation: 'Regional Admin' },
  { id: 'USR-0003', name: 'Dr. K. Senthil Kumar', role: 'employee', designation: 'Senior Agronomist (Plant Pathology)' },
  { id: 'u6', name: 'Dr. Priya Sharma', role: 'employee', designation: 'Agronomist & Soil Chemist' },
  { id: 'u7', name: 'Arun Kumar', role: 'employee', designation: 'Horticulture & Fertigation Specialist' },
  { id: 'u3', name: 'Muthuvel K', role: 'employee', designation: 'Quality Control Lead' }
]

export default function SoilReportMonitor() {
  const { user } = useAuth()
  const [reports, setReports] = useState([])
  const [staffList, setStaffList] = useState(DEFAULT_STAFF)
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
  const loadReports = useCallback(async () => {
    setLoading(true)
    try {
      const list = soilTestService.getReports({ role: 'superadmin' })
      setReports(list)
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
  }, [selectedReport])

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

  const handleConfirmAssignment = (e) => {
    e.preventDefault()
    if (!selectedStaffId) {
      toast.error('Please select an employee or admin to assign')
      return
    }

    const staffMember = staffList.find(s => s.id === selectedStaffId)
    if (!staffMember) return

    setAssigning(true)
    setTimeout(() => {
      soilTestService.assignReport({
        reportId: selectedReport.id,
        staffId: staffMember.id,
        staffName: staffMember.name,
        staffRole: staffMember.role,
        staffDesignation: staffMember.designation,
        assignedBy: user?.name || 'Super Admin',
        notes: assignNotes
      })

      setAssigning(false)
      setShowAssignModal(false)
      toast.success(`Soil report ${selectedReport.id} assigned to ${staffMember.name}!`, {
        description: `Designation: ${staffMember.designation}. They now have access to inspect and manage this report.`
      })
      loadReports()
    }, 600)
  }

  // Handle Save Status & Notes
  const handleSavePrescription = (e) => {
    e.preventDefault()
    if (!selectedReport) return

    setUpdating(true)
    setTimeout(() => {
      soilTestService.updateReportStatus({
        reportId: selectedReport.id,
        status: editStatus,
        agronomistNotes: editNotes
      })
      setUpdating(false)
      toast.success('Soil report status & prescription notes updated!')
      loadReports()
    }, 500)
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

  return (
    <div className="sa-page">
      {/* Header */}
      <div className="sa-page-head">
        <div>
          <div className="sa-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FlaskConical size={14} color="#059669" /> Enterprise Soil Health Surveillance
          </div>
          <h1 className="sa-title">Farmer Soil Test Reports Monitor</h1>
          <p className="sa-subtitle">
            Track incoming soil laboratory submissions from farmers across all regions. Delegate diagnostic tasks to certified Agronomists or store Admins and supervise expert prescriptions.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <Link
            to="/superadmin/permissions"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#f1f5f9',
              border: '1px solid #cbd5e1',
              color: '#334155',
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: '0.82rem',
              fontWeight: 700,
              textDecoration: 'none'
            }}
          >
            <ShieldCheck size={15} color="#059669" /> Manage Staff Module Permissions
          </Link>

          <button
            type="button"
            onClick={loadReports}
            className="sa-btn sa-btn--secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 22 }}>
        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700 }}>Total Soil Submissions</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#0f172a', margin: '4px 0' }}>{totalCount}</div>
          <div style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 600 }}>From all online &amp; store farmers</div>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '0.78rem', color: '#d97706', fontWeight: 700 }}>Pending Agronomist Review</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#b45309', margin: '4px 0' }}>{pendingCount}</div>
          <div style={{ fontSize: '0.72rem', color: '#92400e', fontWeight: 600 }}>Awaiting analysis &amp; delegation</div>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '0.78rem', color: '#2563eb', fontWeight: 700 }}>Assigned to Staff</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#1d4ed8', margin: '4px 0' }}>{assignedCount}</div>
          <div style={{ fontSize: '0.72rem', color: '#1e40af', fontWeight: 600 }}>Delegated to Agronomists / Admins</div>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '0.78rem', color: '#059669', fontWeight: 700 }}>Prescriptions Issued</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#047857', margin: '4px 0' }}>{completedCount}</div>
          <div style={{ fontSize: '0.72rem', color: '#065f46', fontWeight: 600 }}>Verified &amp; sent to farmers</div>
        </div>

        <div style={{ background: '#fff', padding: '16px 20px', borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '0.78rem', color: '#7c3aed', fontWeight: 700 }}>Avg Soil Health Index</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#6d28d9', margin: '4px 0' }}>{avgScore}<small style={{ fontSize: '1rem', color: '#94a3b8' }}>/100</small></div>
          <div style={{ fontSize: '0.72rem', color: '#6d28d9', fontWeight: 600 }}>Overall fertility baseline</div>
        </div>
      </div>

      {/* Main Two-Panel Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 420px) 1fr', gap: 20, alignItems: 'start' }}>
        
        {/* LEFT PANEL: Filters & Submissions List */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: '18px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          
          {/* Search */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: 10, top: 10 }} />
              <input
                type="text"
                placeholder="Search by ID, Farmer, Mobile, Crop..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', padding: '8px 10px 8px 34px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.84rem' }}
              />
            </div>
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.78rem', fontWeight: 600 }}
            >
              <option value="all">All Statuses ({reports.length})</option>
              <option value="Pending Review">Pending Review ({reports.filter(r => r.status === 'Pending Review').length})</option>
              <option value="Under Agronomist Analysis">Under Analysis ({reports.filter(r => r.status === 'Under Agronomist Analysis').length})</option>
              <option value="Prescription Issued">Prescription Issued ({reports.filter(r => r.status === 'Prescription Issued').length})</option>
              <option value="Completed">Completed ({reports.filter(r => r.status === 'Completed').length})</option>
            </select>

            <select
              value={assigneeFilter}
              onChange={e => setAssigneeFilter(e.target.value)}
              style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.78rem', fontWeight: 600 }}
            >
              <option value="all">All Staff Assignments</option>
              <option value="unassigned">Unassigned Only</option>
              {staffList.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
              ))}
            </select>
          </div>

          {/* List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '680px', overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '36px 16px', textAlign: 'center', color: '#94a3b8' }}>
                <FlaskConical size={36} color="#cbd5e1" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: '0.85rem' }}>No soil reports match the filters</div>
              </div>
            ) : (
              filtered.map(r => {
                const isSelected = selectedReport?.id === r.id
                return (
                  <div
                    key={r.id}
                    onClick={() => handleSelectReport(r)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: `1.5px solid ${isSelected ? '#059669' : '#e2e8f0'}`,
                      background: isSelected ? '#f0fdf4' : '#fff',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a' }}>{r.id}</span>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          padding: '2px 7px',
                          borderRadius: 8,
                          background: r.status === 'Prescription Issued' ? '#dcfce7' : r.status === 'Under Agronomist Analysis' ? '#dbeafe' : '#fef3c7',
                          color: r.status === 'Prescription Issued' ? '#166534' : r.status === 'Under Agronomist Analysis' ? '#1e40af' : '#92400e'
                        }}
                      >
                        {r.status}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b' }}>
                      {r.farmerName} <span style={{ fontWeight: 400, color: '#64748b' }}>({r.phone})</span>
                    </div>

                    <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 2 }}>
                      Crop: <strong>{r.crop}</strong> · {r.soilType} · pH {r.ph} · {r.areaAcres} Acres
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 6, borderTop: '1px solid #f1f5f9', fontSize: '0.72rem' }}>
                      <span style={{ color: r.assignedToName ? '#047857' : '#d97706', fontWeight: 600 }}>
                        {r.assignedToName ? `👤 ${r.assignedToName}` : '⚠️ Unassigned'}
                      </span>
                      <span style={{ color: '#94a3b8' }}>{new Date(r.createdAt).toLocaleDateString('en-IN')}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Report Details, Delegation & Prescription Writing */}
        {selectedReport ? (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            
            {/* Report Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14, marginBottom: 18, borderBottom: '1px solid #f1f5f9', paddingBottom: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a' }}>{selectedReport.id}</span>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      padding: '3px 10px',
                      borderRadius: 12,
                      background: selectedReport.status === 'Prescription Issued' ? '#dcfce7' : selectedReport.status === 'Under Agronomist Analysis' ? '#dbeafe' : '#fef3c7',
                      color: selectedReport.status === 'Prescription Issued' ? '#166534' : selectedReport.status === 'Under Agronomist Analysis' ? '#1e40af' : '#92400e'
                    }}
                  >
                    {selectedReport.status}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 4 }}>
                  Submitted on {new Date(selectedReport.createdAt).toLocaleString('en-IN')}
                </div>
              </div>

              {/* Assignment Button */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={handleOpenAssignModal}
                  style={{
                    background: 'linear-gradient(135deg, #059669, #047857)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '9px 18px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)'
                  }}
                >
                  <UserCheck size={16} /> {selectedReport.assignedToName ? 'Reassign Employee / Admin' : 'Assign to Agronomist / Employee'}
                </button>
              </div>
            </div>

            {/* Current Assignment Status Banner */}
            <div style={{ background: selectedReport.assignedToName ? '#ecfdf5' : '#fffbeb', border: `1px solid ${selectedReport.assignedToName ? '#a7f3d0' : '#fde68a'}`, borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: selectedReport.assignedToName ? '#065f46' : '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {selectedReport.assignedToName ? <ShieldCheck size={16} /> : <AlertTriangle size={16} />}
                  {selectedReport.assignedToName
                    ? `Assigned Staff: ${selectedReport.assignedToName} (${selectedReport.assignedDesignation || selectedReport.assignedRole})`
                    : 'Currently Unassigned — Assign an employee or store admin to investigate'}
                </div>
                {selectedReport.assignedAt && (
                  <div style={{ fontSize: '0.74rem', color: '#047857', marginTop: 2 }}>
                    Delegated by {selectedReport.assignedBy || 'Super Admin'} on {new Date(selectedReport.assignedAt).toLocaleString('en-IN')}
                  </div>
                )}
              </div>

              {selectedReport.assignedToName && (
                <button
                  type="button"
                  onClick={handleOpenAssignModal}
                  style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '5px 12px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', color: '#334155' }}
                >
                  Change Assignee
                </button>
              )}
            </div>

            {/* Farmer & Land Card */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>FARMER PROFILE</div>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                  {selectedReport.farmerName}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: 2 }}>
                  📞 {selectedReport.phone}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                  📍 {selectedReport.village || 'Local'}, {selectedReport.district || 'India'}
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>LAND &amp; CROP OBJECTIVE</div>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#059669', marginTop: 2 }}>
                  🌾 {selectedReport.crop}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: 2 }}>
                  Area: <strong>{selectedReport.areaAcres} Acres</strong>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                  Soil Texture: <strong>{selectedReport.soilType}</strong>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>OVERALL SOIL INDEX</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', marginTop: 2 }}>
                  {selectedReport.score}<small style={{ fontSize: '0.85rem', color: '#94a3b8' }}>/100</small>
                </div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669' }}>
                  {selectedReport.grade}
                </div>
              </div>
            </div>

            {/* Soil Lab Parameters Grid */}
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#334155', marginBottom: 10 }}>
                Soil Chemical Metrics (Lab Values)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>pH Reaction</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{selectedReport.ph}</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>EC Salinity</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{selectedReport.ec} <small style={{ fontSize: '0.65rem' }}>dS/m</small></div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Organic Carbon</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{selectedReport.oc}%</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Nitrogen (N)</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{selectedReport.nitrogen}</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Phosphorus (P)</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{selectedReport.phosphorus}</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Potash (K)</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{selectedReport.potassium}</div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Zinc Status</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: selectedReport.zinc === 'Deficient' ? '#dc2626' : '#16a34a' }}>
                    {selectedReport.zinc || 'Deficient'}
                  </div>
                </div>
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Boron Status</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: selectedReport.boron === 'Deficient' ? '#dc2626' : '#16a34a' }}>
                    {selectedReport.boron || 'Deficient'}
                  </div>
                </div>
              </div>
            </div>

            {/* Agronomist Notes & Status Form */}
            <form onSubmit={handleSavePrescription} style={{ background: '#f8fafc', padding: '18px 20px', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sparkles size={16} color="#059669" /> Official Agronomist Prescription &amp; Action Notes
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Report Verification Status
                </label>
                <select
                  value={editStatus}
                  onChange={e => setEditStatus(e.target.value)}
                  style={{ width: '100%', maxWidth: 320, padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.85rem', fontWeight: 600 }}
                >
                  <option value="Pending Review">Pending Review</option>
                  <option value="Under Agronomist Analysis">Under Agronomist Analysis</option>
                  <option value="Prescription Issued">Prescription Issued (Verified)</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Agronomist Technical Remarks / Pre-measure Recommendations
                </label>
                <textarea
                  rows={4}
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  placeholder="Enter detailed prescription: e.g. Gypsum application 300kg/acre basal, PSB drenching, Zinc foliar timing..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.85rem', fontFamily: 'inherit' }}
                />
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>
                  These remarks will be displayed on the farmer's portal dashboard under their submitted report.
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="submit"
                  disabled={updating}
                  style={{
                    background: 'linear-gradient(135deg, #059669, #047857)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 20px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(5, 150, 105, 0.25)'
                  }}
                >
                  {updating ? 'Saving...' : 'Save Prescription & Sync'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 60, textAlign: 'center', color: '#94a3b8' }}>
            <FlaskConical size={48} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
            <h3>Select a soil report from the left</h3>
            <p style={{ fontSize: '0.85rem' }}>View complete soil diagnostics or delegate to an Agronomist.</p>
          </div>
        )}
      </div>

      {/* ASSIGNMENT MODAL */}
      {showAssignModal && selectedReport && (
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
          onClick={() => setShowAssignModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 16,
              maxWidth: 520,
              width: '100%',
              padding: '24px 26px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                  Assign Soil Report to Employee / Admin
                </h3>
                <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  Target Report: <strong>{selectedReport.id}</strong> ({selectedReport.farmerName})
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleConfirmAssignment}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Select Certified Employee / Store Admin *
                </label>
                <select
                  required
                  value={selectedStaffId}
                  onChange={e => setSelectedStaffId(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.88rem', fontWeight: 600 }}
                >
                  <option value="">-- Choose Staff Personnel --</option>
                  {staffList.map(staff => (
                    <option key={staff.id} value={staff.id}>
                      {staff.name} — {staff.designation} ({staff.role.toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Instructions / Guidance for the Assignee (Optional)
                </label>
                <textarea
                  rows={3}
                  value={assignNotes}
                  onChange={e => setAssignNotes(e.target.value)}
                  placeholder="e.g. Please verify Cauvery delta alkalinity and recommend blast-resistant variety..."
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.84rem', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assigning || !selectedStaffId}
                  style={{
                    background: 'linear-gradient(135deg, #059669, #047857)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 22px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)'
                  }}
                >
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
