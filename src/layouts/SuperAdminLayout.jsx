import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import { Menu, LayoutDashboard, Store, Users, ShieldCheck, Activity, ShieldAlert, Sparkles, BarChart3, ChevronRight, Ticket, FlaskConical } from 'lucide-react'
import '../pages/superadmin/superadmin.css'

const SUPERADMIN_NAV = [
  {
    title: 'ENTERPRISE CONTROL',
    links: [
      { to: '/superadmin', end: true, icon: <LayoutDashboard size={16} />, label: 'Control Center' },
      { to: '/superadmin/analytics', icon: <BarChart3 size={16} />, label: 'All Shops Analytics' },
      { to: '/superadmin/support-tickets', icon: <Ticket size={16} />, label: 'Support Ticket System' },
      { to: '/superadmin/soil-reports', icon: <FlaskConical size={16} />, label: 'Soil Test Reports' },
      { to: '/superadmin/stores', icon: <Store size={16} />, label: 'Store Locations' },
    ]
  },
  {
    title: 'ACCESS & HIERARCHY',
    links: [
      { to: '/superadmin/users', icon: <Users size={16} />, label: 'Personnel & Hierarchy' },
      { to: '/superadmin/permissions', icon: <ShieldCheck size={16} />, label: 'Feature Permissions' },
    ]
  },
  {
    title: 'AUDIT & SURVEILLANCE',
    links: [
      { to: '/superadmin/logs', icon: <Activity size={16} />, label: 'Work Log & Audit' },
    ]
  }
]

export default function SuperAdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { pathname } = useLocation()

  const links = SUPERADMIN_NAV.flatMap(section => section.links)
  const current = links.find(l => l.to === pathname) || links.find(l => !l.end && pathname.startsWith(`${l.to}/`))

  return (
    <div className="app-layout superadmin-theme">
      <Sidebar
        items={SUPERADMIN_NAV}
        roleName="Super Admin"
        roleIcon={ShieldAlert}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="main-content">
        <header className="sa-topbar">
          <div className="sa-topbar-left">
            <button
              className="sa-hamburger"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu size={20} />
            </button>
            <div>
              <div className="sa-crumbs">Super Admin <ChevronRight size={12} /> Enterprise Console</div>
              <div className="sa-topbar-title">{current ? current.label : 'Control Center'}</div>
            </div>
          </div>
          <div className="sa-topbar-right">
            <span className="sa-live" title="Audit Surveillance Live">
              <span className="sa-live-dot" aria-hidden="true"></span>
              <span className="sa-live-text">Audit Surveillance Live</span>
            </span>
            <span className="sa-role-pill">
              <span className="sa-role-avatar"><ShieldAlert size={14} /></span>
              <span className="sa-role-text">Super Admin</span>
            </span>
          </div>
        </header>
        <main className="page-content sa-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
