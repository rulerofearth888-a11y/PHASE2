import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import { Bell, Menu, Search, LayoutDashboard, Boxes, Send, ContactRound, Square, CheckSquare, PieChart, UserRound, Factory, FlaskConical, Sprout } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const EMP_NAV = [
  { title: 'Workspace', links: [
    { to: '/employee',        end: true, icon: <LayoutDashboard size={16} />, label: 'Dashboard' },
    { to: '/employee',                 icon: <Boxes size={16} />, label: 'Inventory & Stock' },
    { to: '/employee',                 icon: <Send size={16} />, label: 'Orders & Dispatch' },
    { to: '/employee',                 icon: <ContactRound size={16} />, label: 'Customer CRM' },
    { to: '/employee/tickets',         icon: <Square size={16} />, label: 'Support Tickets', badge: 'new' },
    { to: '/employee/soil-reports',    icon: <FlaskConical size={16} />, label: 'Soil Test Reports', badge: 'new' },
    { to: '/employee/agronomy-bookings', icon: <Sprout size={16} />, label: 'Agronomy Bookings' },
  ]},
  { title: 'My Account', links: [
    { to: '/employee',                 icon: <CheckSquare size={16} />, label: 'Tasks & Approvals' },
    { to: '/employee',                 icon: <PieChart size={16} />, label: 'Reports' },
    { to: '/employee/profile',         icon: <UserRound size={16} />, label: 'My Profile' },
  ]}
]

export default function EmployeeLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user } = useAuth()
  return (
    <div className="app-layout">
      <Sidebar items={EMP_NAV} roleName="Employee" roleIcon={Factory} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-content employee-workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button className="hamburger-btn" onClick={() => setSidebarOpen(true)} aria-label="Open navigation menu"><Menu size={20} /></button>
            <div>
              <div className="topbar-title">Employee ERP Portal</div>
              <div className="topbar-subtitle">
                {user?.storeName ? `Store: ${user.storeName} · ERP & Tasks` : 'Inventory, Stock & Task Management'}
              </div>
            </div>
          </div>
          <div className="topbar-right employee-header-actions">
            <button className="employee-icon-button" title="Search workspace"><Search size={18} /></button>
            <button className="employee-icon-button employee-notification" title="Notifications"><Bell size={18} /><span>3</span></button>
            <span className="employee-user-chip"><span className="employee-avatar">MK</span><span><strong>{user?.name || 'Muthuvel K'}</strong><small>Operations</small></span></span>
          </div>
        </header>
        <main className="page-content"><Outlet /></main>
      </div>
    </div>
  )
}

