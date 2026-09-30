import { Link, useLocation } from 'react-router-dom'
import {
  PackageCheck,
  TicketCheck,
  UserCheck,
  FlaskConical,
  Store,
  ArrowRight
} from 'lucide-react'

const SERVICES = [
  {
    to: '/orders',
    title: 'My Orders',
    desc: 'Track past orders & shipments',
    icon: PackageCheck,
    color: '#2563eb',
    bg: '#eff6ff',
    border: '#bfdbfe'
  },
  {
    to: '/support-tickets',
    title: 'Support Tickets',
    desc: 'Order issues & direct admin resolution',
    icon: TicketCheck,
    color: '#ea580c',
    bg: '#fff7ed',
    border: '#fed7aa'
  },
  {
    to: '/agronomy-experts',
    title: 'Agronomy Experts',
    desc: 'Book free callbacks with farm specialists',
    icon: UserCheck,
    color: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0'
  },
  {
    to: '/soil-test-report',
    title: 'Soil Test Report',
    desc: 'Upload lab test & get crop prescription',
    icon: FlaskConical,
    color: '#0284c7',
    bg: '#f0f9ff',
    border: '#bae6fd'
  },
  {
    to: '/products',
    title: 'All Products',
    desc: 'Explore bio-inputs & fertilizers',
    icon: Store,
    color: '#7c3aed',
    bg: '#f5f3ff',
    border: '#ddd6fe'
  }
]

export default function ServicesBottomNav({ currentPath: propPath }) {
  const location = useLocation()
  const currentPath = propPath || location.pathname

  return (
    <section
      aria-label="Explore other farmer services"
      style={{
        marginTop: 40,
        marginBottom: 20,
        padding: '24px 20px',
        background: '#ffffff',
        borderRadius: 16,
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🌱</span> Farmer Services &amp; Quick Links
          </h3>
          <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
            Jump directly to any of your farmer tools, orders, or support desks
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12
        }}
      >
        {SERVICES.map(service => {
          const isActive = currentPath === service.to
          const Icon = service.icon

          return (
            <Link
              key={service.to}
              to={service.to}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 12,
                textDecoration: 'none',
                background: isActive ? service.bg : '#f8fafc',
                border: `1.5px solid ${isActive ? service.color : '#e2e8f0'}`,
                transition: 'all 0.18s ease',
                position: 'relative',
                boxShadow: isActive ? `0 2px 8px ${service.color}25` : 'none'
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.background = service.bg
                  e.currentTarget.style.borderColor = service.border
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.background = '#f8fafc'
                  e.currentTarget.style.borderColor = '#e2e8f0'
                  e.currentTarget.style.transform = 'none'
                }
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: isActive ? '#fff' : service.bg,
                  border: `1px solid ${service.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: service.color,
                  flexShrink: 0
                }}
              >
                <Icon size={20} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      fontSize: '0.86rem',
                      fontWeight: 700,
                      color: isActive ? service.color : '#1e293b',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {service.title}
                  </span>
                  {isActive && (
                    <span
                      style={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        background: service.color,
                        color: '#fff',
                        padding: '1px 6px',
                        borderRadius: 10
                      }}
                    >
                      Active
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: '0.74rem',
                    color: '#64748b',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginTop: 2
                  }}
                >
                  {service.desc}
                </div>
              </div>

              {!isActive && (
                <ArrowRight size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
              )}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
