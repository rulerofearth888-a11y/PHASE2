import { useState, useEffect } from 'react'
import axios from 'axios'
import { toast } from 'sonner'
import { Search, Clock, Mail, Phone, Building2, Calendar, ChevronRight, User, Loader, Shield, Banknote, MapPin, BookOpen, HeartPulse, Sprout, Sparkles, CheckCircle2 } from 'lucide-react'
import { agronomyService } from '../../services/agronomyService'

function ProfileDetail({ label, value }) {
  if (!value) return null
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: 500 }}>{value}</div>
    </div>
  )
}

function SectionHeading({ icon: Icon, label, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.78rem', color: color || 'var(--brand-600)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '18px 0 10px', borderBottom: `2px solid ${color || 'var(--brand-200)'}`, paddingBottom: 6 }}>
      <Icon size={13} /> {label}
    </div>
  )
}

export default function Employees() {
  const [employees, setEmployees] = useState([])
  const [agronomyExperts, setAgronomyExperts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedEmployee, setSelectedEmployee] = useState(null)

  const loadExperts = () => {
    agronomyService.getExperts().then(res => setAgronomyExperts(res || []))
  }

  useEffect(() => {
    let cancelled = false
    axios.get('/api/admin/staff-profiles')
      .then(res => {
        if (cancelled) return
        setEmployees(res.data?.data || [])
      })
      .catch(() => toast.error('Could not load employee profiles'))
      .finally(() => { if (!cancelled) setLoading(false) })

    loadExperts()
    window.addEventListener('sathyam:experts-updated', loadExperts)
    return () => {
      cancelled = true
      window.removeEventListener('sathyam:experts-updated', loadExperts)
    }
  }, [])

  const filtered = employees.filter(e => {
    const q = search.toLowerCase()
    return (
      (e.name || '').toLowerCase().includes(q) ||
      (e.mobile || '').includes(q) ||
      (e.email || '').toLowerCase().includes(q) ||
      (e.role || '').toLowerCase().includes(q) ||
      (e.profile?.designation || '').toLowerCase().includes(q) ||
      (e.profile?.department || '').toLowerCase().includes(q)
    )
  })

  const isExpert = (empId) => agronomyExperts.some(e => (e.employeeId === empId || e.id === empId) && e.isAgronomyExpert)

  const handleToggleAgronomyExpert = async (emp) => {
    const currentlyExpert = isExpert(emp.id)
    try {
      await agronomyService.toggleEmployeeAgronomyExpert(emp, !currentlyExpert, {
        specialization: emp.profile?.designation || emp.profile?.department || 'Field Agronomy & Crop Advisory',
        languages: emp.profile?.languages ? [emp.profile.languages] : ['Tamil', 'English']
      })
      toast.success(
        currentlyExpert
          ? `Removed ${emp.name} from Agronomy Experts directory`
          : `🎉 ${emp.name} is now designated as an Agronomy Expert!`
      )
      loadExperts()
    } catch {
      toast.error('Failed to update Agronomy Expert status')
    }
  }

  const sel = selectedEmployee
  const p = sel?.profile || {}

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <div className="eyebrow">Organization</div>
          <h1>👥 Employee Management</h1>
          <p>View employee information, profiles, and KYC data</p>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search by name, mobile, email, role, or department..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '0 4px' }}>
          {loading ? 'Loading...' : `${filtered.length} of ${employees.length} staff`}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <Loader size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <div>Loading staff profiles...</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: sel ? '1fr 400px' : '1fr', gap: '20px', alignItems: 'start' }}>
          {/* List */}
          <div>
            {filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🔍</div>
                <h3>No employees found</h3>
                <p>Try adjusting your search criteria</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filtered.map(emp => (
                  <div
                    key={emp.id}
                    className="card"
                    onClick={() => setSelectedEmployee(emp)}
                    style={{
                      cursor: 'pointer',
                      borderLeft: sel?.id === emp.id ? '4px solid var(--brand-500)' : '4px solid transparent',
                      background: sel?.id === emp.id ? 'rgba(94,99,255,0.05)' : 'rgba(255,255,255,0.8)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '16px 20px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
                      <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--brand-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--brand-600)', fontSize: '1rem', flexShrink: 0 }}>
                        {(emp.name || 'U').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>
                          {emp.name}
                          {emp.profile?.designation && (
                            <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-muted)', marginLeft: 8 }}>{emp.profile.designation}</span>
                          )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          <div>📱 {emp.mobile || '—'}</div>
                          <div>🏢 {emp.profile?.department || emp.role || '—'}</div>
                          <div>✉️ {emp.email || '—'}</div>
                          <div>
                            <span className={`badge ${emp.status === 'active' ? 'badge-green' : 'badge-gray'}`}>{emp.status || 'active'}</span>
                            <span className="badge badge-blue" style={{ marginLeft: 4, textTransform: 'capitalize' }}>{emp.role}</span>
                            {isExpert(emp.id) && (
                              <span style={{ marginLeft: 4, background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontSize: '0.7rem', fontWeight: 800, padding: '2px 8px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <Sprout size={11} /> Agronomy Expert
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {p && emp.profile ? (
                        <span style={{ fontSize: '0.7rem', background: '#f0fdf4', color: '#16a34a', fontWeight: 700, padding: '2px 8px', borderRadius: 20, border: '1px solid #bbf7d0' }}>Profile filled</span>
                      ) : (
                        <span style={{ fontSize: '0.7rem', background: '#fff7ed', color: '#b45309', fontWeight: 700, padding: '2px 8px', borderRadius: 20, border: '1px solid #fed7aa' }}>No profile</span>
                      )}
                      <ChevronRight size={20} color="var(--text-muted)" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Detail Panel */}
          {sel && (
            <div className="card" style={{ position: 'sticky', top: '80px', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid var(--surface-border-subtle)' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--brand-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--brand-600)', fontSize: '1.2rem', flexShrink: 0 }}>
                  {sel.name?.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() || 'U'}
                </div>
                <div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{sel.name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span className="badge badge-blue" style={{ textTransform: 'capitalize', marginRight: 6 }}>{sel.role}</span>
                    {p.designation && <span>{p.designation}</span>}
                  </div>
                </div>
              </div>

              {/* AGRONOMY EXPERT ASSIGNMENT BOX */}
              <div style={{ background: isExpert(sel.id) ? 'linear-gradient(135deg, #f0fdf4, #ecfdf5)' : '#f8fafc', border: `1px solid ${isExpert(sel.id) ? '#a7f3d0' : '#e2e8f0'}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: '0.82rem', color: isExpert(sel.id) ? '#047857' : '#475569' }}>
                    <Sprout size={16} /> AGRONOMY EXPERT ROLE
                  </div>
                  {isExpert(sel.id) ? (
                    <span style={{ background: '#16a34a', color: '#fff', fontSize: '0.7rem', fontWeight: 800, padding: '2px 8px', borderRadius: 12 }}>
                      Active on Storefront
                    </span>
                  ) : (
                    <span style={{ background: '#e2e8f0', color: '#64748b', fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 12 }}>
                      Standard Employee
                    </span>
                  )}
                </div>

                <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.4 }}>
                  {isExpert(sel.id)
                    ? 'This employee is certified as an Agronomy Expert. Farmers can book 1-on-1 consultation sessions and callbacks with them in the Agronomy Experts section.'
                    : 'Designate this employee as an Agronomy Expert so registered farmers can book consultations and request advisory callbacks with them.'}
                </p>

                <button
                  type="button"
                  onClick={() => handleToggleAgronomyExpert(sel)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    background: isExpert(sel.id) ? '#fee2e2' : 'linear-gradient(135deg, #047857, #065f46)',
                    color: isExpert(sel.id) ? '#b91c1c' : '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    boxShadow: isExpert(sel.id) ? 'none' : '0 2px 8px rgba(4, 120, 87, 0.2)'
                  }}
                >
                  {isExpert(sel.id) ? 'Remove Agronomy Expert Role' : '🌟 Assign as Agronomy Expert'}
                </button>
              </div>

              {/* Account info */}
              <SectionHeading icon={User} label="Account" color="#5e63ff" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                <ProfileDetail label="System Name" value={sel.name} />
                <ProfileDetail label="Full Name" value={p.fullName} />
                <ProfileDetail label="Mobile" value={sel.mobile} />
                <ProfileDetail label="Email" value={sel.email} />
                <ProfileDetail label="Store" value={sel.storeName || sel.storeId} />
                <ProfileDetail label="Status" value={sel.status} />
              </div>

              {/* Personal */}
              {(p.dateOfBirth || p.gender || p.bloodGroup || p.fatherName) && (
                <>
                  <SectionHeading icon={User} label="Personal" color="#8b5cf6" />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                    <ProfileDetail label="Date of Birth" value={p.dateOfBirth} />
                    <ProfileDetail label="Gender" value={p.gender} />
                    <ProfileDetail label="Blood Group" value={p.bloodGroup} />
                    <ProfileDetail label="Marital Status" value={p.maritalStatus} />
                    <ProfileDetail label="Father's Name" value={p.fatherName} />
                    <ProfileDetail label="Mother's Name" value={p.motherName} />
                    <ProfileDetail label="Nationality" value={p.nationality} />
                  </div>
                </>
              )}

              {/* Contact */}
              {(p.personalEmail || p.personalPhone) && (
                <>
                  <SectionHeading icon={Phone} label="Contact" color="#0ea5e9" />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                    <ProfileDetail label="Personal Email" value={p.personalEmail} />
                    <ProfileDetail label="Personal Phone" value={p.personalPhone} />
                    <ProfileDetail label="Alternate Phone" value={p.alternatePhone} />
                  </div>
                </>
              )}

              {/* Address */}
              {(p.city || p.currentAddress) && (
                <>
                  <SectionHeading icon={MapPin} label="Address" color="#f59e0b" />
                  <ProfileDetail label="Current Address" value={p.currentAddress} />
                  <ProfileDetail label="Permanent Address" value={p.permanentAddress} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                    <ProfileDetail label="City" value={p.city} />
                    <ProfileDetail label="State" value={p.state} />
                    <ProfileDetail label="PIN Code" value={p.pincode} />
                  </div>
                </>
              )}

              {/* Emergency */}
              {p.emergencyName && (
                <>
                  <SectionHeading icon={HeartPulse} label="Emergency Contact" color="#ef4444" />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                    <ProfileDetail label="Name" value={p.emergencyName} />
                    <ProfileDetail label="Relation" value={p.emergencyRelation} />
                    <ProfileDetail label="Phone" value={p.emergencyPhone} />
                  </div>
                </>
              )}

              {/* Employment */}
              {(p.designation || p.employeeCode) && (
                <>
                  <SectionHeading icon={Building2} label="Employment" color="#7c3aed" />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                    <ProfileDetail label="Employee Code" value={p.employeeCode} />
                    <ProfileDetail label="Designation" value={p.designation} />
                    <ProfileDetail label="Department" value={p.department} />
                    <ProfileDetail label="Joining Date" value={p.joiningDate} />
                  </div>
                </>
              )}

              {/* Education */}
              {p.qualification && (
                <>
                  <SectionHeading icon={BookOpen} label="Education" color="#10b981" />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                    <ProfileDetail label="Qualification" value={p.qualification} />
                    <ProfileDetail label="Institution" value={p.institution} />
                    <ProfileDetail label="Year of Passing" value={p.yearOfPassing} />
                    <ProfileDetail label="Skills" value={p.skills} />
                    <ProfileDetail label="Languages" value={p.languages} />
                  </div>
                </>
              )}

              {/* KYC */}
              {(p.aadharNumber || p.panNumber) && (
                <>
                  <SectionHeading icon={Shield} label="KYC Documents" color="#f97316" />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                    <ProfileDetail label="Aadhaar" value={p.aadharNumber ? '****-****-' + p.aadharNumber.slice(-4) : ''} />
                    <ProfileDetail label="PAN" value={p.panNumber} />
                  </div>
                </>
              )}

              {/* Bank */}
              {p.bankName && (
                <>
                  <SectionHeading icon={Banknote} label="Bank Details" color="#0f766e" />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                    <ProfileDetail label="Bank" value={p.bankName} />
                    <ProfileDetail label="Account No" value={p.bankAccountNumber ? '****' + p.bankAccountNumber.slice(-4) : ''} />
                    <ProfileDetail label="IFSC" value={p.ifscCode} />
                    <ProfileDetail label="Branch" value={p.bankBranch} />
                    <ProfileDetail label="UPI ID" value={p.upiId} />
                  </div>
                </>
              )}

              {!sel.profile && (
                <div style={{ textAlign: 'center', padding: '24px 16px', background: 'var(--surface-raised)', borderRadius: 10, color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 12 }}>
                  <User size={28} style={{ marginBottom: 8, opacity: 0.4 }} />
                  <div>This employee has not filled in their profile yet.</div>
                </div>
              )}

              {p.updatedAt && (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 16, textAlign: 'right' }}>
                  Profile last updated: {new Date(p.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
