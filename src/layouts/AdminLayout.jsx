import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../context/AuthContext'
import { Menu, BarChart3, LineChart, Pencil, Leaf, BookOpen, Video, UserRound, FileText, Package, Mail, ClipboardList, Users, Ticket, Gift, Bell, MessageCircle, ShieldCheck, MapPin, FlaskConical, Sprout } from 'lucide-react'

const ADMIN_NAV = [
  {
    title: 'DASHBOARD',
    links: [
      { to: '/admin',              end: true, icon: <BarChart3 size={16} />, label: 'Overview', moduleKey: 'overview' },
      { to: '/admin/analytics',              icon: <LineChart size={16} />, label: 'Analytics', moduleKey: 'analytics' },
    ]
  },
  {
    title: 'CONTENT',
    links: [
      { to: '/admin/cms',         icon: <Pencil size={16} />, label: 'Live CMS Editor', moduleKey: 'cms' },
      { to: '/admin/products',    icon: <Leaf size={16} />, label: 'Products Master', moduleKey: 'products' },
      { to: '/admin/blogs',       icon: <BookOpen size={16} />, label: 'Blog Articles', moduleKey: 'blogs' },
      { to: '/admin/videos',      icon: <Video size={16} />, label: 'Video Library', moduleKey: 'videos' },
    ]
  },
  {
    title: 'OPERATIONS',
    links: [
      { to: '/admin/users',        icon: <UserRound size={16} />, label: 'Users & Credentials', moduleKey: 'users' },
      { to: '/admin/profile-fields', icon: <FileText size={16} />, label: 'Profile Form Builder', moduleKey: 'profile-fields' },
      { to: '/admin/orders',       icon: <Package size={16} />, label: 'Order Management', moduleKey: 'orders' },
      { to: '/admin/subscribers',  icon: <Mail size={16} />, label: 'Advisory Subscribers', moduleKey: 'subscribers' },
      { to: '/admin/enquiries',    icon: <ClipboardList size={16} />, label: 'Farmer Enquiries', moduleKey: 'enquiries' },
      { to: '/admin/employees',    icon: <Users size={16} />, label: 'Employees', moduleKey: 'employees' },
    ]
  },
  {
    title: 'MARKETING & PROMOTIONS',
    links: [
      { to: '/admin/coupons',   icon: <Ticket size={16} />, label: 'Coupons & Credits', moduleKey: 'coupons' },
      { to: '/admin/referrals', icon: <Gift size={16} />, label: 'Referrals & Points', moduleKey: 'referrals' },
    ]
  },
  {
    title: 'SUPPORT',
    links: [
      { to: '/admin/support-tickets', icon: <Ticket size={16} />, label: 'Support Tickets', moduleKey: 'support-tickets' },
      { to: '/admin/soil-reports', icon: <FlaskConical size={16} />, label: 'Soil Test Reports', moduleKey: 'soil-reports' },
      { to: '/admin/agronomy-bookings', icon: <Sprout size={16} />, label: 'Agronomy Bookings', moduleKey: 'employees' },
      { to: '/admin/tickets', icon: <Bell size={16} />, label: 'Notifications', moduleKey: 'tickets' },
      { to: '/admin/chat',    icon: <MessageCircle size={16} />, label: 'Chat Records', moduleKey: 'chat' },
    ]
  }
]

export default function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { pathname } = useLocation()
  const { user } = useAuth()

  const userPermissions = user?.permissions
  const hasWildcard = !userPermissions || user?.role === 'superadmin' || (Array.isArray(userPermissions) && (userPermissions.length === 0 || userPermissions.includes('*')))

  const filteredNav = hasWildcard
    ? ADMIN_NAV
    : ADMIN_NAV.map(section => ({
        ...section,
        links: section.links.filter(l => !l.moduleKey || userPermissions.includes(l.moduleKey))
      })).filter(section => section.links.length > 0)

  const links = ADMIN_NAV.flatMap(section => section.links)
  const current = links.find(l => l.to === pathname) || links.find(l => !l.end && pathname.startsWith(`${l.to}/`))

  const isRestricted = !hasWildcard && current?.moduleKey && !userPermissions.includes(current.moduleKey)

  return (
    <div className="app-layout">
      <Sidebar items={filteredNav} roleName="Admin" roleIcon={ShieldCheck} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button className="hamburger-btn" onClick={() => setSidebarOpen(true)} aria-label="Open navigation menu"><Menu size={20} /></button>
            <div className="topbar-heading">
              <div className="topbar-title">{current ? current.label : 'Dashboard'}</div>
              <div className="topbar-subtitle">
                {user?.storeName ? `Store: ${user.storeName}` : 'Admin · Sathyam Agro Mart Enterprise Management'}
              </div>
            </div>
          </div>
          <div className="topbar-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {user?.storeLocation && (
              <span className="badge" style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#e2e8f0', color: '#334155', fontWeight: 600 }}>
                <MapPin size={12} /> {user.storeLocation}
              </span>
            )}
            <span className="badge badge-red topbar-role">ADMIN</span>
          </div>
        </header>
        <main className="page-content">
          {isRestricted ? (
            <div className="card" style={{ textAlign: 'center', padding: '60px 24px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>Module Access Restricted</h2>
              <p style={{ color: '#64748b', maxWidth: '440px', margin: '0 auto 20px' }}>
                Access to <strong>{current?.label}</strong> has not been enabled for your administrator account.
                Please contact the <strong>Super Admin</strong> to request access to this portal feature.
              </p>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  )
}
