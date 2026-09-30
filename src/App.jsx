import { Suspense, lazy, useEffect, useLayoutEffect } from 'react'
import PageLoader from './components/PageLoader'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { CmsProvider } from './context/CmsContext'
import { CheckoutProvider } from './hooks/useCheckout'
import { STAFF_HOME } from './hooks/checkoutRules'
import PrivateRoute from './components/PrivateRoute'

import MobileBottomNav from './components/home/MobileBottomNav'
import StoreTopChrome from './components/home/StoreTopChrome'
import PageTranslator from './components/PageTranslator'
import VoiceAnywhere from './components/VoiceAnywhere'
import Storefront from './storefront/Storefront'
import StoreLayout from './layouts/StoreLayout'
import StorePopups from './storefront/StorePopups'
import Checkout from './pages/Checkout'

// Store pages other than home are fetched when first opened, so a farmer on a
// budget phone downloads and parses only the home page before it can draw.
// The two most likely next pages are warmed while the phone is idle
// (WarmStorePages below), so opening a product still feels instant.
const loadProductDetail = () => import('./pages/ProductDetail')
const loadAllProducts = () => import('./pages/AllProducts')
const ProductDetail = lazy(loadProductDetail)
const AllProducts = lazy(loadAllProducts)
const IngredientDetail = lazy(() => import('./pages/IngredientDetail'))
const StoreSection = lazy(() => import('./pages/StoreSection'))
const Categories = lazy(() => import('./pages/Categories'))
const Wishlist = lazy(() => import('./pages/Wishlist'))
const OrderStatus = lazy(() => import('./pages/OrderStatus'))
const Blog = lazy(() => import('./pages/Blog'))
const BlogDetail = lazy(() => import('./pages/BlogDetail'))
const InformationPage = lazy(() => import('./pages/InformationPage'))
const SupportTicketsCustomer = lazy(() => import('./pages/SupportTicketsCustomer'))
const AgronomyExperts = lazy(() => import('./pages/AgronomyExperts'))
const SoilTestReport = lazy(() => import('./pages/SoilTestReport'))
// Staff sign-in and password reset: never needed by a shopper.
const Login = lazy(() => import('./pages/Login'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))

function WarmStorePages() {
  useEffect(() => {
    const warm = () => { loadProductDetail(); loadAllProducts() }
    // After the page has loaded and the main thread is free; never on a
    // connection the visitor asked to save data on.
    if (navigator.connection?.saveData) return undefined
    const idle = window.requestIdleCallback || (cb => setTimeout(cb, 2000))
    const cancel = window.cancelIdleCallback || clearTimeout
    let handle
    const start = () => { handle = idle(warm, { timeout: 5000 }) }
    if (document.readyState === 'complete') start()
    else window.addEventListener('load', start, { once: true })
    return () => { window.removeEventListener('load', start); if (handle) cancel(handle) }
  }, [])
  return null
}

// The staff portals. Every one of these used to be imported here, which put
// the whole of admin, employee, delivery and billing into the one bundle a
// farmer downloads before the catalogue can even be asked for - and no farmer
// ever opens them. They are fetched when a staff route is actually opened.
const AdminLayout    = lazy(() => import('./layouts/AdminLayout'))
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'))
const AdminCMS       = lazy(() => import('./pages/admin/CMS'))
const AdminProducts  = lazy(() => import('./pages/admin/Products'))
const AdminOrders    = lazy(() => import('./pages/admin/Orders'))
const AdminSubscribers = lazy(() => import('./pages/admin/Subscribers'))
const AdminEnquiries = lazy(() => import('./pages/admin/Enquiries'))
const AdminAnalytics = lazy(() => import('./pages/admin/Analytics'))
const AdminUsers     = lazy(() => import('./pages/admin/Users'))
const AdminProfileFields = lazy(() => import('./pages/admin/ProfileFields'))
const Employees = lazy(() => import('./pages/admin/Employees'))
const SupportTickets = lazy(() => import('./pages/admin/SupportTickets'))
const AdminBlogs = lazy(() => import('./pages/admin/Blogs'))
const AdminVideos = lazy(() => import('./pages/admin/Videos'))
const AdminCoupons = lazy(() => import('./pages/admin/Coupons'))
const AdminReferrals = lazy(() => import('./pages/admin/Referrals'))

const EmployeeLayout    = lazy(() => import('./layouts/EmployeeLayout'))
const EmployeeDashboard = lazy(() => import('./pages/employee/Dashboard'))
const EmployeeProfile   = lazy(() => import('./pages/employee/Profile'))

const DeliveryLayout    = lazy(() => import('./layouts/DeliveryLayout'))
const DeliveryDashboard = lazy(() => import('./pages/delivery/Dashboard'))

const BillingLayout    = lazy(() => import('./layouts/BillingLayout'))
const BillingDashboard = lazy(() => import('./pages/billing/Dashboard'))
const InvoiceHistory = lazy(() => import('./pages/billing/InvoiceHistory'))

// Super Admin portal (lazy like the other staff portals)
const SuperAdminLayout = lazy(() => import('./layouts/SuperAdminLayout'))
const SuperAdminDashboard = lazy(() => import('./pages/superadmin/Dashboard'))
const SuperAdminStores = lazy(() => import('./pages/superadmin/Stores'))
const SuperAdminUsers = lazy(() => import('./pages/superadmin/Users'))
const SuperAdminPermissions = lazy(() => import('./pages/superadmin/Permissions'))
const SuperAdminWorkLog = lazy(() => import('./pages/superadmin/WorkLog'))
const SuperAdminShopAnalytics = lazy(() => import('./pages/superadmin/ShopAnalytics'))
const SuperAdminSupportTickets = lazy(() => import('./pages/superadmin/SupportTicketSystem'))
const SuperAdminSoilReports = lazy(() => import('./pages/superadmin/SoilReportMonitor'))

// Admin & Employee Soil Reports
const AdminSoilReports = lazy(() => import('./pages/admin/SoilReports'))

// Tickets & Chat (shared between admin/employee)
const Tickets     = lazy(() => import('./pages/shared/Tickets'))
const ChatRecords = lazy(() => import('./pages/shared/ChatRecords'))

// Staff are taken to their portal; everyone else gets the storefront.
function HomePage() {
  const { user } = useAuth()
  const redirectPath = user && STAFF_HOME[user.role]
  return redirectPath ? <Navigate to={redirectPath} replace /> : <Storefront />
}

// The store pages: storefront, shop, blog, product, basket and orders.
const STORE_PAGES = /^\/(?:$|products|shop|categories|crops|brands|blog|product\/|wishlist|orders|support-tickets|agronomy-experts|soil-test-report|checkout|cart|privacy-policy|terms-of-sale|refund-policy|about-us|contact-us)/

const useStorePage = () => STORE_PAGES.test(useLocation().pathname)

// On store pages the top header (ticker + header row) and the phone bottom bar
// are drawn once here, outside the routes, so they stay mounted - same
// elements, same place - while the pages change between them.
function StoreTop() {
  return useStorePage() ? <StoreTopChrome /> : null
}

function StoreBottom() {
  const { pathname } = useLocation()
  // A new page starts at the top; a link to a section scrolls there instead.
  useLayoutEffect(() => {
    if (!window.location.hash) window.scrollTo(0, 0)
  }, [pathname])
  return STORE_PAGES.test(pathname) ? <MobileBottomNav /> : null
}

// Every page in the chosen language; staff portals add the staff phrases.
function StoreTranslation() {
  return <PageTranslator staff={!useStorePage()} />
}

export default function App() {
  const storePage = useStorePage()
  // Every store page adds to the same basket and opens the same floating
  // checkout and sign-in card, drawn once here over whichever page is open.
  return (
    <CmsProvider>
    <CheckoutProvider enabled={storePage}>
      <StoreTop />
      {storePage && <WarmStorePages />}
      <Suspense fallback={<PageLoader late />}>
      <Routes>
        {/* Public Home - the storefront */}
        <Route path="/"        element={<HomePage />} />
        {/* Old links: the floating checkout, over the store home page */}
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/cart"    element={<Navigate to="/checkout" replace />} />
        <Route path="/login"   element={<Login />} />
        {/* Customers have no sign-up form any more: the WhatsApp code on the
            store's sign-in sheet both signs them in and creates the account. */}
        <Route path="/register" element={<Navigate to="/#login" replace />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/order-status" element={<Navigate to="/orders" replace />} />
        <Route path="/shop" element={<Navigate to="/products" replace />} />

        {/* Storefront pages other than home: one shared header/footer
            (StoreLayout), mounted once, with only the routed page inside
            <Outlet/> changing as these are navigated between. */}
        <Route element={<StoreLayout />}>
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/product/:id/ingredients" element={<IngredientDetail />} />
          <Route path="/wishlist" element={<Wishlist />} />
          <Route path="/orders" element={<OrderStatus />} />
          <Route path="/support-tickets" element={<PrivateRoute><SupportTicketsCustomer /></PrivateRoute>} />
          <Route path="/agronomy-experts" element={<AgronomyExperts />} />
          <Route path="/soil-test-report" element={<SoilTestReport />} />
          <Route path="/products" element={<AllProducts />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/crops" element={<StoreSection type="crops" />} />
          <Route path="/brands" element={<StoreSection type="brands" />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:id" element={<BlogDetail />} />
          <Route path="/privacy-policy" element={<InformationPage path="/privacy-policy" />} />
          <Route path="/terms-of-sale" element={<InformationPage path="/terms-of-sale" />} />
          <Route path="/refund-policy" element={<InformationPage path="/refund-policy" />} />
          <Route path="/about-us" element={<InformationPage path="/about-us" />} />
          <Route path="/contact-us" element={<InformationPage path="/contact-us" />} />
        </Route>

        {/* Super Admin Routes */}
        <Route path="/superadmin" element={<PrivateRoute allowedRoles={['superadmin']} signIn={<Login />}><SuperAdminLayout /></PrivateRoute>}>
          <Route index element={<SuperAdminDashboard />} />
          <Route path="analytics" element={<SuperAdminShopAnalytics />} />
          <Route path="support-tickets" element={<SuperAdminSupportTickets />} />
          <Route path="soil-reports" element={<SuperAdminSoilReports />} />
          <Route path="stores" element={<SuperAdminStores />} />
          <Route path="users" element={<SuperAdminUsers />} />
          <Route path="permissions" element={<SuperAdminPermissions />} />
          <Route path="logs" element={<SuperAdminWorkLog />} />
        </Route>

        {/* Admin Routes — signed-out visitors get the admin sign-in here */}
        <Route path="/admin" element={<PrivateRoute allowedRoles={['admin', 'superadmin']} signIn={<Login />}><AdminLayout /></PrivateRoute>}>
          <Route index             element={<AdminDashboard />} />
          <Route path="cms"        element={<AdminCMS />} />
          <Route path="users"      element={<AdminUsers />} />
          <Route path="profile-fields" element={<AdminProfileFields />} />
          <Route path="products"   element={<AdminProducts />} />
          <Route path="orders"     element={<AdminOrders />} />
          <Route path="subscribers" element={<AdminSubscribers />} />
          <Route path="enquiries"  element={<AdminEnquiries />} />
          <Route path="analytics"  element={<AdminAnalytics />} />
          <Route path="employees"  element={<Employees />} />
          <Route path="support-tickets" element={<SupportTickets />} />
          <Route path="soil-reports" element={<AdminSoilReports />} />
          <Route path="tickets"    element={<Tickets />} />
          <Route path="chat"       element={<ChatRecords />} />
          <Route path="blogs"      element={<AdminBlogs />} />
          <Route path="videos"     element={<AdminVideos />} />
          <Route path="coupons"    element={<AdminCoupons />} />
          <Route path="referrals"  element={<AdminReferrals />} />
        </Route>

        {/* Employee Routes */}
        <Route path="/employee" element={<PrivateRoute allowedRoles={['employee']} signIn={<Login />}><EmployeeLayout /></PrivateRoute>}>
          <Route index element={<EmployeeDashboard />} />
          <Route path="profile" element={<EmployeeProfile />} />
          <Route path="tickets" element={<Tickets />} />
          <Route path="soil-reports" element={<AdminSoilReports />} />
        </Route>

        {/* Delivery Routes */}
        <Route path="/delivery" element={<PrivateRoute allowedRoles={['delivery']} signIn={<Login />}><DeliveryLayout /></PrivateRoute>}>
          <Route index element={<DeliveryDashboard />} />
          <Route path="profile" element={<EmployeeProfile />} />
        </Route>

        {/* Billing Routes */}
        <Route path="/billing" element={<PrivateRoute allowedRoles={['billing', 'admin']} signIn={<Login />}><BillingLayout /></PrivateRoute>}>
          <Route index element={<BillingDashboard />} />
          <Route path="history" element={<InvoiceHistory />} />
          <Route path="profile" element={<EmployeeProfile />} />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      {storePage && <StorePopups />}
      <StoreBottom />
      <StoreTranslation />
      {storePage && <VoiceAnywhere />}
    </CheckoutProvider>
    </CmsProvider>
  )
}
