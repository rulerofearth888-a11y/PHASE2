import { Mail, Phone, MapPin, Facebook, Instagram, MessageCircle, Youtube, ShieldCheck, Truck, LockKeyhole, Headphones, ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import FooterColumn from '../FooterColumn'
import HomeLogoLink from './HomeLogoLink'
import { socialLinksFrom } from '../../shared/socialLinks'
import { useCms } from '../../context/CmsContext'
import { cmsText } from '../../hooks/useCmsSettings'
import { SUPPORT_PHONE } from '../../shared/phoneLink'

// THE footer. One copy, on every store page including the home page, mounted
// outside .sb-home (see Storefront.jsx). Contact details come from the CMS so
// an admin's edits appear everywhere.
//
// Top to bottom: a band of four promises, then the brand, three link groups
// and the contact cards, then payment methods and the copyright line.
// Phones fold the link groups into tap-to-open rows (FooterColumn); the
// contact cards stay open there because calling is what farmers come for.
// Styles: storefront.css, "Footer 2026".

const ICONS = { WhatsApp: MessageCircle, Facebook, YouTube: Youtube, Instagram }

const PROMISES = [
  { Icon: ShieldCheck, title: 'Genuine Products', text: '100% bio-certified' },
  { Icon: Truck, title: 'Express Delivery', text: 'Fast dispatch across India' },
  { Icon: LockKeyhole, title: 'Secure Payment', text: 'UPI, Cards, NetBanking, COD' },
  { Icon: Headphones, title: '24/7 Support', text: 'Call, WhatsApp or email us' },
]

const CATEGORIES = [
  ['Bio-Fungicides', '/categories?category=Fungicide'],
  ['Insecticides', '/categories?category=Insecticide'],
  ['Herbicides', '/categories?category=Herbicide'],
  ['Bio-Stimulants', '/categories?category=Bio-Stimulant'],
  ['Nematicides', '/categories?category=Nematicide'],
  ['All Products', '/products'],
]

const CROPS = [
  ['Paddy / Rice Care', '/crops?crop=Paddy%20%2F%20Rice'],
  ['Cotton Protection', '/crops?crop=Cotton'],
  ['Tomato & Vegetables', '/crops?crop=Vegetables'],
  ['Sugarcane Care', '/crops?crop=Sugarcane'],
  ['Horticulture & Fruits', '/crops?crop=Horticulture'],
]

const HELP = [
  ['About Us', '/about-us'],
  ['Contact Us', '/contact-us'],
  ['My Orders', '/orders'],
  ['Support Tickets', '/support-tickets'],
  ['Agronomy Experts', '/agronomy-experts'],
  ['Soil Test Report', '/soil-test-report'],
  ['Blog', '/blog'],
  ['Privacy Policy', '/privacy-policy'],
  ['Terms of Sale', '/terms-of-sale'],
  ['Refund Policy', '/refund-policy'],
]

const PAYMENTS = ['UPI', 'Cards', 'NetBanking', 'Cash on Delivery']

function LinkGroup({ title, links }) {
  return (
    <FooterColumn base="public-footer-col" title={title}>
      <ul className="public-footer-col-body">
        {links.map(([label, to]) => (
          <li key={to}><Link to={to}>{label}</Link></li>
        ))}
      </ul>
    </FooterColumn>
  )
}

function SocialLinks() {
  const { cms } = useCms()
  return (
    <div className="public-social-links">
      {socialLinksFrom(cms).map(({ name, href }) => {
        const Icon = ICONS[name]
        return (
          <a key={name} href={href} target="_blank" rel="noopener noreferrer" aria-label={`Sathyam Agro Mart on ${name} (opens in a new tab)`}>
            <Icon size={18} aria-hidden="true" />
          </a>
        )
      })}
    </div>
  )
}

// A contact row that is also the action: dial, write, or open the map.
function ContactCard({ Icon, label, value, href, external }) {
  return (
    <li>
      <a className="public-footer-contact-card" href={href} {...(external && { target: '_blank', rel: 'noopener noreferrer' })}>
        <span className="public-footer-contact-icon" aria-hidden="true"><Icon size={18} /></span>
        <span className="public-footer-contact-text">
          <span className="public-footer-contact-label">{label}</span>
          <span className="public-footer-contact-value">{value}</span>
        </span>
        <ArrowUpRight className="public-footer-contact-go" size={16} aria-hidden="true" />
      </a>
    </li>
  )
}

export default function Footer() {
  const { cms } = useCms()
  const brandLine = cmsText(cms, 'footerBrand', "India's leading digital platform for high-efficacy bio-pesticides, crop protection chemicals, and soil health fertilizers.")
  const brandMore = cmsText(cms, 'footerBrandMore', 'Providing 100% bio-certified products with fast express dispatch to 15,000+ farmers across India.')
  const phone = cmsText(cms, 'phone', SUPPORT_PHONE)
  const email = cmsText(cms, 'email', 'support@sathyamagromart.com')
  const address = cmsText(cms, 'address', 'Sathyam Agro Mart, Hyderabad, India')
  const dial = `tel:${phone.replace(/[^\d+]/g, '')}`
  const map = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
  return (
    <footer className="public-site-footer">
      <ul className="public-footer-promises">
        {PROMISES.map(({ Icon, title, text }) => (
          <li key={title}>
            <span className="public-footer-promise-icon" aria-hidden="true"><Icon size={22} strokeWidth={1.8} /></span>
            <span>
              <strong>{title}</strong>
              <span>{text}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="public-footer-grid">
        <div className="public-footer-brand">
          <HomeLogoLink className="public-footer-logo">
            <img className="public-footer-logo-mark" src="/assets/brand/logo-mark.png" alt="" width="512" height="512" />
            <img className="public-footer-logo-wordmark" src="/assets/brand/logo-wordmark.png" alt="Sathyam Agro Mart" width="1200" height="254" />
          </HomeLogoLink>
          <p>{brandLine}</p>
          <p className="public-footer-brand-more">{brandMore}</p>
          <p className="public-footer-follow">Follow us</p>
          <SocialLinks />
        </div>

        <LinkGroup title="Store Categories" links={CATEGORIES} />
        <LinkGroup title="Top Crops" links={CROPS} />
        <LinkGroup title="Help & Info" links={HELP} />

        <div className="public-footer-support">
          <h4 className="public-footer-support-title">Customer Support</h4>
          <ul className="public-footer-contact">
            <ContactCard Icon={Phone} label="Toll Free" value={phone} href={dial} />
            <ContactCard Icon={Mail} label="Email" value={email} href={`mailto:${email}`} />
            <ContactCard Icon={MapPin} label="Address" value={address} href={map} external />
          </ul>
        </div>
      </div>

      <div className="public-footer-bottom">
        <div className="public-footer-pay">
          <span className="public-footer-pay-label">We accept</span>
          <ul>
            {PAYMENTS.map(method => <li key={method}>{method}</li>)}
          </ul>
        </div>
        <p className="public-footer-copy">© 2026 Sathyam Agro Mart. All rights reserved.</p>
        <p className="public-footer-credit">Designed by cupnsaucer</p>
      </div>
    </footer>
  )
}
