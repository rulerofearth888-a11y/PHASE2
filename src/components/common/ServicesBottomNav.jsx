import { Link, useLocation } from 'react-router-dom'
import {
  PackageCheck,
  TicketCheck,
  UserCheck,
  FlaskConical,
  Store,
  ArrowRight
} from 'lucide-react'

// The farmer's main tools, at the foot of the Orders, Support Tickets,
// Agronomy Experts and Soil Test pages. Each is a full card - icon, name,
// what it does - so they read as the features they are, not as footnotes.
// The page you are on is marked. Styles: index.css, "Farmer services".
const SERVICES = [
  { to: '/orders', title: 'My Orders', desc: 'Track past orders & shipments', icon: PackageCheck, color: '#2563eb', bg: '#eff6ff' },
  { to: '/support-tickets', title: 'Support Tickets', desc: 'Order issues & direct admin resolution', icon: TicketCheck, color: '#ea580c', bg: '#fff7ed' },
  { to: '/agronomy-experts', title: 'Agronomy Experts', desc: 'Book free callbacks with farm specialists', icon: UserCheck, color: '#059669', bg: '#ecfdf5' },
  { to: '/soil-test-report', title: 'Soil Test Report', desc: 'Upload lab test & get crop prescription', icon: FlaskConical, color: '#0284c7', bg: '#f0f9ff' },
  { to: '/products', title: 'All Products', desc: 'Explore bio-inputs & fertilizers', icon: Store, color: '#7c3aed', bg: '#f5f3ff' },
]

export default function ServicesBottomNav({ currentPath: propPath }) {
  const location = useLocation()
  const currentPath = propPath || location.pathname

  return (
    <section className="farmer-services" aria-labelledby="farmerServicesTitle">
      <div className="farmer-services-head">
        <h2 id="farmerServicesTitle"><span aria-hidden="true">🌱</span> Farmer Services &amp; Quick Links</h2>
        <p>Jump directly to any of your farmer tools, orders, or support desks</p>
      </div>

      <div className="farmer-services-grid">
        {SERVICES.map(service => {
          const isActive = currentPath === service.to
          const Icon = service.icon
          return (
            <Link
              key={service.to}
              to={service.to}
              className={`farmer-service${isActive ? ' is-active' : ''}`}
              style={{ '--svc': service.color, '--svc-bg': service.bg }}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="farmer-service-icon" aria-hidden="true"><Icon size={22} /></span>
              <span className="farmer-service-title">{service.title}</span>
              <span className="farmer-service-desc">{service.desc}</span>
              <span className="farmer-service-cta">
                {isActive ? <span className="farmer-service-here">You are here</span> : <>Open page <ArrowRight size={15} aria-hidden="true" /></>}
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
