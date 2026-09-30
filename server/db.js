/**
 * Sathyam Agro Mart - High Performance Structured Database Engine
 * Persistent, MongoDB-backed relational store (via Mongoose) with the same
 * business logic, filtering, sorting and computed-field behavior as the
 * original JSON-file engine, but safe for Vercel's read-only filesystem.
 */

import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { hashPassword, isPasswordHash, passwordProblems, weakPasswordMessage } from './security.js';
import { matchesCrop, matchesCategory, matchesDisease } from '../src/utils/catalogUtils.js';
import { findSameNamedProduct } from '../src/shared/productName.js';
import { DEFAULT_PROFILE_FIELDS, cropList, normalizeProfileFields, splitProfileValues, validateProfileValues } from '../src/shared/profileFieldRules.js';
import { cleanGeo } from './geo.js';
import { referralIdFor } from './referrals.js';

// ================= CONNECTION (serverless-safe, cached across invocations) =================

let cached = global._mongooseConn;
if (!cached) {
    cached = global._mongooseConn = { conn: null, promise: null };
}

let seedPromise = null;

export async function connectDB() {
    if (cached.conn) return cached.conn;

  if (!cached.promise) {
        const uri = process.env.MONGODB_URI;
        if (!uri) {
                throw new Error(
                          'MONGODB_URI environment variable is not set. Configure it (e.g. a MongoDB Atlas connection string) before the API can serve requests.'
                        );
        }
        mongoose.set('strictQuery', false);
            cached.promise = mongoose.connect(uri, {
                  bufferCommands: false,
                  serverSelectionTimeoutMS: 5000,
                  connectTimeoutMS: 5000,
            }).then(m => m);
  }

  try {
        cached.conn = await cached.promise;
  } catch (err) {
        cached.promise = null;
        throw err;
  }

  if (!seedPromise) {
        seedPromise = seedIfEmpty()
          .then(() => ensureSuperAdminAndStores())
          .catch(err => {
                console.error('Database seed error:', err);
                seedPromise = null;
        });
  }
    await seedPromise;

  return cached.conn;
}

// ================= SCHEMAS / MODELS =================
// _id is kept as the existing human-readable string id (USR-1001, sb-01,
// SAM-ORD-8821, etc.) instead of switching to Mongo ObjectIds, and every
// schema is permissive (strict:false) so no field present in the original
// loosely-typed JSON records is ever silently dropped.

const permissive = { strict: false, minimize: false, versionKey: '__v' };

// phone+role is unique, not phone alone: a staff account and a farmer account
// may share a number (one person, two separate identities), but the same
// person cannot hold two accounts of the same role on one number. A partial
// index, not sparse: sparse on a COMPOUND index only skips a document that is
// missing every indexed field, so an admin with no phone but a role would
// still collide with every other phone-less admin on { phone: null, role:
// "admin" }. The partial filter excludes any document missing phone, full
// stop. The index only builds once existing duplicates are removed
// (dedupe-phones.js, migrate-phone-role-index.mjs).
const userSchema = new mongoose.Schema(
    { _id: String, phone: String, role: String },
    permissive
);
userSchema.index(
    { phone: 1, role: 1 },
    { unique: true, partialFilterExpression: { phone: { $exists: true } } }
);
const productSchema = new mongoose.Schema({ _id: String }, permissive);
const orderSchema = new mongoose.Schema({ _id: String }, permissive);
const advisorySubscriberSchema = new mongoose.Schema({ _id: String }, permissive);
const advisoryBroadcastSchema = new mongoose.Schema({ _id: String }, permissive);
const inventoryItemSchema = new mongoose.Schema({ _id: String }, permissive);
const staffTaskSchema = new mongoose.Schema({ _id: String }, permissive);
const ticketSchema = new mongoose.Schema({ _id: String }, permissive);
const farmerEnquirySchema = new mongoose.Schema({ _id: String }, permissive);
const chatRecordSchema = new mongoose.Schema({ _id: String }, permissive);
// One cart per user: _id is the user's id.
const cartSchema = new mongoose.Schema({ _id: String }, permissive);
const wishlistItemSchema = new mongoose.Schema({ _id: String }, permissive);
// One per browser (its own random id): the guest's self-reported name/phone
// (POST /api/visitor-contact) and, once asked, their location - granted (with
// a point, POST /api/visitor-location), denied, or still pending
// (locationStatus). Registered visitors are the same doc plus userId; their
// identity of record stays the User collection, not this one.
const visitorLocationSchema = new mongoose.Schema({ _id: String }, permissive);
const settingsSchema = new mongoose.Schema(
  {
        _id: String,
        cms: mongoose.Schema.Types.Mixed,
        catalogOptions: mongoose.Schema.Types.Mixed,
        profileFields: mongoose.Schema.Types.Mixed
  },
  { strict: false, minimize: false }
  );

// Razorpay order ids are single-use: a replayed or double-submitted payment can
// never produce a second order. Older orders without one are left out of the index.
orderSchema.index(
  { razorpayOrderId: 1 },
  { unique: true, partialFilterExpression: { razorpayOrderId: { $type: 'string' } } }
);

// Short-lived server state (OTP codes, rate-limit counters, checkout sessions).
// Kept in MongoDB rather than process memory so it survives across serverless
// instances; MongoDB deletes each record once purgeAt has passed.
const ephemeralSchema = new mongoose.Schema(
  { _id: String, value: mongoose.Schema.Types.Mixed, purgeAt: Date },
  { strict: false, minimize: false, versionKey: false }
);
ephemeralSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Product = mongoose.models.Product || mongoose.model('Product', productSchema);
const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);
const AdvisorySubscriber =
    mongoose.models.AdvisorySubscriber || mongoose.model('AdvisorySubscriber', advisorySubscriberSchema);
const AdvisoryBroadcast =
    mongoose.models.AdvisoryBroadcast || mongoose.model('AdvisoryBroadcast', advisoryBroadcastSchema);
const InventoryItem = mongoose.models.InventoryItem || mongoose.model('InventoryItem', inventoryItemSchema);
const StaffTask = mongoose.models.StaffTask || mongoose.model('StaffTask', staffTaskSchema);
const Ticket = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);
const FarmerEnquiry = mongoose.models.FarmerEnquiry || mongoose.model('FarmerEnquiry', farmerEnquirySchema);
const ChatRecord = mongoose.models.ChatRecord || mongoose.model('ChatRecord', chatRecordSchema);
const Cart = mongoose.models.Cart || mongoose.model('Cart', cartSchema);
const WishlistItem = mongoose.models.WishlistItem || mongoose.model('WishlistItem', wishlistItemSchema);
const VisitorLocation = mongoose.models.VisitorLocation || mongoose.model('VisitorLocation', visitorLocationSchema);
const Settings = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);
const Ephemeral = mongoose.models.Ephemeral || mongoose.model('Ephemeral', ephemeralSchema);
const blogSchema = new mongoose.Schema({ _id: String }, permissive);
const videoSchema = new mongoose.Schema({ _id: String }, permissive);
const Blog = mongoose.models.Blog || mongoose.model('Blog', blogSchema);
const Video = mongoose.models.Video || mongoose.model('Video', videoSchema);
const invoiceSchema = new mongoose.Schema({ _id: String }, permissive);
const Invoice = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);
const couponSchema = new mongoose.Schema({ _id: String }, permissive);
const Coupon = mongoose.models.Coupon || mongoose.model('Coupon', couponSchema);
const couponUsageSchema = new mongoose.Schema({ _id: String }, permissive);
const CouponUsage = mongoose.models.CouponUsage || mongoose.model('CouponUsage', couponUsageSchema);
const referralSchema = new mongoose.Schema({ _id: String }, permissive);
const Referral = mongoose.models.Referral || mongoose.model('Referral', referralSchema);
const pointsLedgerSchema = new mongoose.Schema({ _id: String }, permissive);
const PointsLedger = mongoose.models.PointsLedger || mongoose.model('PointsLedger', pointsLedgerSchema);

// Images uploaded from the admin CMS. Small files (images) are stored as base64
// in MongoDB for backward compatibility. Large files (videos) are saved to disk
// and only metadata is stored in MongoDB to avoid the 16MB document size limit.
const uploadSchema = new mongoose.Schema({ _id: String }, permissive);
const Upload = mongoose.models.Upload || mongoose.model('Upload', uploadSchema);

// Lightweight metadata for disk-stored uploads (no binary field).
const uploadMetaSchema = new mongoose.Schema({ _id: String }, permissive);
const UploadMeta = mongoose.models.UploadMeta || mongoose.model('UploadMeta', uploadMetaSchema);

const storeSchema = new mongoose.Schema({ _id: String }, permissive);
export const Store = mongoose.models.Store || mongoose.model('Store', storeSchema);
const agronomyBookingSchema = new mongoose.Schema({ _id: String }, permissive);
export const AgronomyBooking = mongoose.models.AgronomyBooking || mongoose.model('AgronomyBooking', agronomyBookingSchema);

const activityLogSchema = new mongoose.Schema({ _id: String }, permissive);
export const ActivityLog = mongoose.models.ActivityLog || mongoose.model('ActivityLog', activityLogSchema);

// One profile document per staff user: _id mirrors the User._id.
const staffProfileSchema = new mongoose.Schema({ _id: String }, permissive);
export const StaffProfile = mongoose.models.StaffProfile || mongoose.model('StaffProfile', staffProfileSchema);

export const USER_ROLES = ['superadmin', 'farmer', 'admin', 'employee', 'delivery', 'billing'];
// Every role except farmer: the accounts that sign in with a password at /login.
export const STAFF_ROLES = USER_ROLES.filter(role => role !== 'farmer');

// Human-readable ids with enough randomness that records created in the same
// millisecond (or by concurrent serverless instances) cannot collide.
// Online order numbers: SAM-ORD-<time><random> (Sathyam Agro Mart). Orders
// placed before this change keep their SB-ORD-... number.
export const ORDER_ID_PREFIX = 'SAM-ORD';

// { size: price } kept only for sizes the product has and prices above 0.
export function packPriceMap(input, packSizes) {
    const out = {};
    if (!input || typeof input !== 'object') return out;
    for (const size of packSizes) {
        const value = Number(input[size]);
        if (Number.isFinite(value) && value > 0) out[size] = value;
    }
    return out;
}

export function newId(prefix) {
    const time = Date.now().toString(36).toUpperCase();
    const random = crypto.randomInt(0, 36 ** 4).toString(36).toUpperCase().padStart(4, '0');
    return `${prefix}-${time}${random}`;
}

function inputError(code, message) {
    const err = new Error(message);
    err.code = code;
    return err;
}

// ================= SERIALIZATION HELPERS =================

// Strips Mongo's _id/__v and re-exposes the record's own `id` field
// (mirrored from _id), matching the shape the original JSON records had.
function serialize(doc) {
    if (!doc) return doc;
    const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    const { _id, __v, ...rest } = obj;
    return { id: _id, ...rest };
}

// Users never leave the database layer with their password unless the caller
// explicitly needs it to check a login.
function serializeUser(doc, { includePassword = false } = {}) {
    const user = serialize(doc);
    if (!user || includePassword) return user;
    const { password, ...safe } = user;
    return safe;
}

// Strips Mongo's _id/__v without adding an `id` field - used for records
// (like chat sessions) whose natural key isn't called `id`.
function stripMongoFields(doc) {
    if (!doc) return doc;
    const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    const { _id, __v, ...rest } = obj;
    return rest;
}

// Replicates the defaulting + review-rating aggregation logic that the
// original db.js applied once at load() time - applied here on every read.
function normalizeProduct(product) {
    const reviews = Array.isArray(product.reviews) ? product.reviews : [];
    const visibility = product.visibility || (product.online === false ? 'offline' : 'both');
    return {
          ...product,
          visibility,
          online: visibility !== 'offline',
          taggedVideos: Array.isArray(product.taggedVideos) ? product.taggedVideos : [],
          images:
            Array.isArray(product.images) && product.images.length
              ? product.images
                    : product.image
              ? [product.image]
                    : [],
          howToUse: product.howToUse || '',
          whenToUse: product.whenToUse || '',
          relatedBlogs: Array.isArray(product.relatedBlogs) ? product.relatedBlogs : [],
          relatedProductIds: Array.isArray(product.relatedProductIds) ? product.relatedProductIds : [],
          reviewsEnabled: product.reviewsEnabled === true,
          // How many units have ever been sold, which is what the trending
          // rows rank by. Products from before this existed read as 0.
          unitsSold: Math.max(0, Number(product.unitsSold) || 0),
          reviews,
          rating: reviews.length
            ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length
                  : null,
          reviewsCount: reviews.length
    };
}

// The catalogue is read on nearly every page view and changes only when an
// admin edits it, but the cluster is an Atlas shared tier: it refuses
// `hostInfo` and returns the 78 products (84 KB) at about 90 KB/s, a full
// second, whatever compression is asked for. Nothing here can make that faster,
// so the whole collection is held for a short while instead and every filter is
// applied to it in memory, which is what getProducts already did.
//
// Every write below drops it, so an admin's edit is live at once on this
// instance; the TTL is what bounds staleness anywhere else (each serverless
// instance keeps its own).
const PRODUCT_CACHE_MS = Number(process.env.PRODUCT_CACHE_MS || 30000);
let productCache = null;
let productCacheAt = 0;
let productCacheInFlight = null;

function invalidateProductCache() {
    productCache = null;
    productCacheAt = 0;
}

async function allProducts() {
    if (productCache && Date.now() - productCacheAt < PRODUCT_CACHE_MS) return productCache;
    // Two requests arriving together wait on one read, not two.
    if (productCacheInFlight) return productCacheInFlight;
    productCacheInFlight = Product.find({}).lean()
          .then(docs => {
                    productCache = docs.map(serialize).map(normalizeProduct);
                    productCacheAt = Date.now();
                    return productCache;
          })
          .finally(() => { productCacheInFlight = null; });
    return productCacheInFlight;
}

// ================= DEFAULT / SEED DATA =================

const DEFAULT_CATALOG_OPTIONS = {
    categories: ['Fungicide', 'Insecticide', 'Herbicide', 'Bio-Stimulant', 'Fertilizer', 'Nematicide', 'Adjuvant', 'Seeds', 'Equipments', 'Animal Husbandry'],
    crops: [
          'Paddy / Rice',
          'Wheat',
          'Cotton',
          'Tomato',
          'Corn / Maize',
          'Sugarcane',
          'Citrus / Fruits',
          'Grapes / Fruits',
          'Potato'
        ],
    storageBatches: ['250g', '500g', '1kg', '250ml', '500ml', '1 Litre', '5 Litres'],
    diseases: ['Blast', 'Blight', 'Rust', 'Aphids', 'Whitefly', 'Downy Mildew', 'Leaf Miner', 'Pinworm', 'Leaf hopper', 'Thrips', 'Mites', 'Stem Borer', 'Weeds'],
    // Kept in step with src/shared/productForm.js's PRODUCT_FORMS, the
    // built-in fallback the admin form and storefront filter fall back to
    // before this registry has loaded, or if it somehow arrives empty.
    physicalForms: ['Powder', 'Pellets', 'Tablets', 'Granules', 'Liquid', 'Gel']
};


const INITIAL_CMS = {
    heroTitle: 'SATHYAM AGRO MART-PESTICIDES & CROP CARE',
    heroSubtitle: 'Government & 100% Bio-Certified Solutions for High Yield & Zero Chemical Residue Farming',
    bannerAnnouncement:
          '🎉 KHARIF SPECIAL: Flat 20% OFF on Bio-Fungicides + Farmer Helpline +91 87786 13372',
    advisoryTitle: 'Get Weekly Crop & Pesticide Recommendations',
    advisorySubtitle:
          'Join 15,000+ farmers receiving our free seasonal advisory newsletter. Kharif & Rabi crop schedules, disease alerts, and exclusive offers every week.',
    contactPhone: '+91-8778613372',
    contactEmail: 'care@sathyambio.in',
    razorpayKeyId: 'rzp_test_sathyaBioLiveKey102',
    razorpaySecret: 'rzp_secret_mock_live_9988',
    razorpayMode: 'test'
};

const INITIAL_USERS = [
  {
        id: 'USR-1001',
        name: 'Rameshwar Patel',
        phone: '9876543210',
        email: 'rameshwar@farm.in',
        password: 'password123',
        role: 'farmer',
        crop: 'Paddy / Rice',
        acreage: 5,
        village: 'Karur',
        district: 'Coimbatore',
        state: 'Tamil Nadu',
        status: 'active',
        createdBy: 'admin',
        createdAt: '2026-08-01T08:00:00.000Z',
        lastLogin: '2026-09-05T14:30:00.000Z'
  },
  {
        id: 'USR-1002',
        name: 'Sathyam Admin',
        phone: '9123456789',
        email: 'admin@sathyamagromart.com',
        password: 'admin',
        role: 'admin',
        crop: 'All Crops',
        acreage: 0,
        village: 'Headquarters',
        district: 'Coimbatore',
        state: 'Tamil Nadu',
        status: 'active',
        createdBy: 'system',
        createdAt: '2026-01-01T00:00:00.000Z',
        lastLogin: '2026-09-06T10:00:00.000Z'
  },
  {
        id: 'USR-1003',
        name: 'Muthuvel K. (QC)',
        phone: '9234567890',
        email: 'muthuvel@sathyamagromart.com',
        password: 'password123',
        role: 'employee',
        crop: 'Cotton',
        acreage: 12,
        village: 'Tiruppur',
        district: 'Tiruppur',
        state: 'Tamil Nadu',
        department: 'Quality Control',
        status: 'active',
        createdBy: 'admin',
        createdAt: '2026-06-15T09:00:00.000Z',
        lastLogin: '2026-09-04T16:20:00.000Z'
  },
  {
        id: 'USR-1004',
        name: 'Karthik Raja',
        phone: '9345678901',
        email: 'karthik@sathyamagromart.com',
        password: 'password123',
        role: 'delivery',
        crop: 'N/A',
        acreage: 0,
        village: 'Erode Central',
        district: 'Erode',
        state: 'Tamil Nadu',
        status: 'active',
        createdBy: 'admin',
        createdAt: '2026-07-10T11:00:00.000Z',
        lastLogin: '2026-09-06T08:15:00.000Z'
  },
  {
        id: 'USR-1005',
        name: 'Billing Operator #04',
        phone: '9456789012',
        email: 'billing@sathyamagromart.com',
        password: 'password123',
        role: 'billing',
        crop: 'N/A',
        acreage: 0,
        village: 'Coimbatore Hub',
        district: 'Coimbatore',
        state: 'Tamil Nadu',
        status: 'active',
        createdBy: 'admin',
        createdAt: '2026-07-20T12:00:00.000Z',
        lastLogin: '2026-09-05T18:00:00.000Z'
  },
  {
        id: 'USR-1006',
        name: 'Suresh Reddy',
        phone: '9884255667',
        email: 'suresh@farm.in',
        password: 'password123',
        role: 'farmer',
        crop: 'Sugarcane',
        acreage: 8,
        village: 'Nandyal',
        district: 'Kurnool',
        state: 'Andhra Pradesh',
        status: 'active',
        createdBy: 'self-registered',
        createdAt: '2026-08-15T10:00:00.000Z',
        lastLogin: '2026-09-02T11:00:00.000Z'
  },
  {
        id: 'USR-1007',
        name: 'Gurpreet Singh',
        phone: '9814077889',
        email: 'gurpreet@punjabfarm.in',
        password: 'password123',
        role: 'farmer',
        crop: 'Wheat',
        acreage: 15,
        village: 'Karnal Suburbs',
        district: 'Karnal',
        state: 'Haryana',
        status: 'active',
        createdBy: 'admin',
        createdAt: '2026-08-20T14:00:00.000Z',
        lastLogin: '2026-09-01T09:45:00.000Z'
  }
  ];

const INITIAL_PRODUCTS = [
  {
        id: 'sb-01',
        name: 'Sathyam Agro Mart BlastShield 75 WP',
        tagline: 'Systemic Bio-Fungicide for Paddy Blast & Neck Rot',
        category: 'Fungicide',
        price: 680,
        originalPrice: 850,
        discount: '20% OFF',
        stock: 420,
        crops: ['Paddy/Rice', 'Wheat', 'Corn'],
        diseases: ['Blast', 'Rust', 'Downy Mildew'],
        activeIngredient: 'Tricyclazole 75% WP + Bio-Enzyme Fortifier',
        dosage: '120g - 150g per Acre',
        packSizes: ['250g', '500g', '1kg'],
        selectedPack: '500g',
        badge: 'Best Seller',
        rating: 4.9,
        reviewsCount: 142,
        image: './assets/p1.png',
        description:
                'Advanced systemic bio-fortified fungicide providing protective and curative control against Blast disease in Paddy, Leaf Rust in Wheat, and Neck Blast.',
        detailedDescription:
                'Sathyam Agro Mart BlastShield 75 WP rapidly penetrates plant tissue, establishing a protective barrier that stops fungal spore germination.',
        targetUserId: 'USR-1001',
        targetUserName: 'Rameshwar Patel (Paddy / Rice)',
        sortOrder: 1,
        createdAt: '2026-08-01T10:00:00.000Z',
        updatedAt: '2026-08-01T10:00:00.000Z'
  },
  {
        id: 'sb-02',
        name: 'Sathyam Agro Mart FlyKill Ultra',
        tagline: 'Multi-Action Insecticide for Whitefly & Aphids',
        category: 'Insecticide',
        price: 840,
        originalPrice: 1050,
        discount: '20% OFF',
        stock: 185,
        crops: ['Cotton', 'Tomato', 'Citrus', 'Potato'],
        diseases: ['Whitefly', 'Aphids', 'Caterpillars'],
        activeIngredient: 'Diafenthiuron 50% WP + Botanical Neem Extract',
        dosage: '250g per Acre',
        packSizes: ['250g', '500g'],
        selectedPack: '250g',
        badge: 'Top Rated',
        rating: 4.8,
        reviewsCount: 98,
        image: './assets/p2.png',
        description:
                'Penetrates leaf cuticle rapidly to paralyze sucking pests like Whiteflies, Aphids, and Thrips. Prevents leaf curl virus spread.',
        detailedDescription:
                'FlyKill Ultra combines the fast knock-down power of modern chemistry with sustained botanical repellency.',
        targetUserId: 'USR-1003',
        targetUserName: 'Muthuvel K. (Cotton)',
        sortOrder: 2,
        createdAt: '2026-08-02T10:00:00.000Z',
        updatedAt: '2026-08-02T10:00:00.000Z'
  },
  {
        id: 'sb-03',
        name: 'Sathyam Agro Mart BlightStop Pro',
        tagline: 'Dual Action Systemic Fungicide for Blight Control',
        category: 'Fungicide',
        price: 750,
        originalPrice: 900,
        discount: '17% OFF',
        stock: 65,
        crops: ['Tomato', 'Potato', 'Grapes', 'Citrus'],
        diseases: ['Blight', 'Downy Mildew'],
        activeIngredient: 'Mancozeb 64% + Metalaxyl 8% WP',
        dosage: '500g per Acre',
        packSizes: ['500g', '1kg', '5kg'],
        selectedPack: '1kg',
        badge: 'Expert Choice',
        rating: 4.9,
        reviewsCount: 215,
        image: './assets/p1.png',
        description:
                'Gold standard dual-action fungicide specifically formulated for Late Blight in Potato/Tomato and Downy Mildew in Grapevines.',
        detailedDescription:
                'Forms a protective film on plant surface while systemically inhibiting protein synthesis in pathogens.',
        targetUserId: 'all',
        targetUserName: 'All Users (General Catalog)',
        sortOrder: 3,
        createdAt: '2026-08-03T10:00:00.000Z',
        updatedAt: '2026-08-03T10:00:00.000Z'
  },
  {
        id: 'sb-04',
        name: 'Sathyam Agro Mart RootVigor Gold',
        tagline: '100% Organic Bio-Stimulant & Root Enhancer',
        category: 'Bio-Stimulant',
        price: 990,
        originalPrice: 1250,
        discount: '21% OFF',
        stock: 310,
        crops: ['Paddy/Rice', 'Wheat', 'Cotton', 'Sugarcane', 'Corn', 'Tomato', 'Grapes'],
        diseases: [],
        activeIngredient: 'Humic Acid 18% + Seaweed Extract (Ascophyllum nodosum)',
        dosage: '500ml per Acre',
        packSizes: ['500ml', '1 Litre', '5 Litres'],
        selectedPack: '1 Litre',
        badge: '100% Organic',
        rating: 4.9,
        reviewsCount: 310,
        image: './assets/p3.png',
        description:
                'Accelerates root branching, enhances micro-nutrient absorption, and restores degraded soils. Boosts drought resilience.',
        detailedDescription:
                'Stimulates root cell division and chelates bound soil nutrients into plant-absorbable forms.',
        targetUserId: 'USR-1006',
        targetUserName: 'Suresh Reddy (Sugarcane)',
        sortOrder: 4,
        createdAt: '2026-08-04T10:00:00.000Z',
        updatedAt: '2026-08-04T10:00:00.000Z'
  },
  {
        id: 'sb-26',
        name: 'Sathyam Agro Mart WeedClear 24-D',
        tagline: 'Systemic Broadleaf Herbicide',
        category: 'Herbicide',
        price: 340,
        originalPrice: 400,
        discount: '15% OFF',
        stock: 150,
        crops: ['Wheat', 'Corn', 'Sugarcane'],
        diseases: ['Weeds'],
        activeIngredient: '2,4-D Amine Salt 58% SL',
        dosage: '400ml per Acre',
        packSizes: ['400ml', '1 Litre', '5 Litres'],
        selectedPack: '1 Litre',
        badge: 'Broadleaf Killer',
        rating: 4.6,
        reviewsCount: 156,
        image: './assets/p4.png',
        description:
                'Effective and economical post-emergence herbicide for control of broadleaf weeds in cereals and sugarcane.',
        detailedDescription:
                'Acts as a synthetic auxin, causing rapid, uncontrolled cell division and growth in susceptible weeds.',
        targetUserId: 'USR-1007',
        targetUserName: 'Gurpreet Singh (Wheat)',
        sortOrder: 5,
        createdAt: '2026-08-05T10:00:00.000Z',
        updatedAt: '2026-08-05T10:00:00.000Z'
  },
  {
        id: 'sb-27',
        name: 'Sathyam Agro Mart AminoBoost Liquid',
        tagline: 'Advanced Amino Acid Bio-Stimulant',
        category: 'Bio-Stimulant',
        price: 460,
        originalPrice: 550,
        discount: '16% OFF',
        stock: 240,
        crops: ['Tomato', 'Cotton', 'Grapes', 'Citrus', 'Paddy/Rice'],
        diseases: [],
        activeIngredient: 'L-Amino Acids 20% + Seaweed Extract',
        dosage: '250ml per Acre',
        packSizes: ['250ml', '500ml', '1 Litre'],
        selectedPack: '500ml',
        badge: 'Stress Reliever',
        rating: 4.9,
        reviewsCount: 212,
        image: './assets/p3.png',
        description:
                'A powerful anti-stress bio-stimulant that helps crops recover from weather, transplant, and chemical stress.',
        detailedDescription:
                'Provides plants with ready-made L-amino acids, redirecting plant energy towards growth and flowering.',
        targetUserId: 'all',
        targetUserName: 'All Users (General Catalog)',
        sortOrder: 6,
        createdAt: '2026-08-06T10:00:00.000Z',
        updatedAt: '2026-08-06T10:00:00.000Z'
  }
  ];

const INITIAL_ORDERS = [
  {
        id: 'SAM-ORD-8821',
        userId: 'USR-1001',
        customerName: 'Rameshwar Patel',
        customerPhone: '9876543210',
        address: 'Plot 42, Green Valley Farm, Karur, Tamil Nadu - 613001',
        items: [
          { id: 'sb-01', name: 'Sathyam Agro Mart BlastShield 75 WP', qty: 2, price: 680, packSize: '500g' },
          { id: 'sb-04', name: 'Sathyam Agro Mart RootVigor Gold', qty: 1, price: 990, packSize: '1 Litre' }
              ],
        subtotal: 2350,
        gst: 423,
        total: 2773,
        paymentMethod: 'Razorpay (UPI)',
        paymentStatus: 'Paid',
        deliveryStatus: 'Out for Delivery',
        assignedDeliveryBoy: 'Karthik Raja',
        deliveryBoyPhone: '9345678901',
        otp: '4829',
        createdAt: '2026-08-30T10:00:00.000Z'
  },
  {
        id: 'SAM-ORD-8822',
        userId: 'USR-1007',
        customerName: 'Gurpreet Singh',
        customerPhone: '9814077889',
        address: 'Khasra 104, GT Road, Karnal, Haryana - 132001',
        items: [{ id: 'sb-02', name: 'Sathyam Agro Mart FlyKill Ultra', qty: 3, price: 840, packSize: '250g' }],
        subtotal: 2520,
        gst: 453.6,
        total: 2973.6,
        paymentMethod: 'Cash on Delivery',
        paymentStatus: 'Pending',
        deliveryStatus: 'Dispatched',
        assignedDeliveryBoy: 'Karthik Raja',
        deliveryBoyPhone: '9345678901',
        otp: '9152',
        createdAt: '2026-08-30T12:30:00.000Z'
  }
  ];

const INITIAL_ADVISORY_SUBSCRIBERS = [
  {
        id: 'adv-101',
        name: 'Rameshwar Patel',
        phone: '9876543210',
        crop: 'Paddy/Rice',
        season: 'Kharif',
        acreage: 5,
        subscribedAt: '2026-08-25T10:30:00.000Z',
        status: 'Active',
        lastAdvisorySent: 'BlastShield Dosage Schedule (Week 4)'
  }
  ];

const INITIAL_INVENTORY = [
  {
        id: 'INV-01',
        sku: 'SB-BLAST-75',
        name: 'BlastShield 75 WP (500g)',
        batchNo: 'BATCH-2026-08A',
        warehouse: 'Warehouse 1 (Coimbatore)',
        stockQty: 420,
        minThreshold: 100,
        expiryDate: '2028-08-01',
        costPrice: 420,
        sellingPrice: 680
  },
  {
        id: 'INV-02',
        sku: 'SB-FLY-50',
        name: 'FlyKill Ultra (250g)',
        batchNo: 'BATCH-2026-07B',
        warehouse: 'Warehouse 1 (Coimbatore)',
        stockQty: 185,
        minThreshold: 50,
        expiryDate: '2028-07-15',
        costPrice: 530,
        sellingPrice: 840
  }
  ];

const INITIAL_STAFF_TASKS = [
  {
        id: 'TSK-301',
        title: 'Batch 2026-08A Quality Audit',
        assignedTo: 'Dr. K. Senthil (Agronomist)',
        priority: 'High',
        status: 'In Progress',
        dueDate: '2026-08-31'
  }
  ];

const INITIAL_TICKETS = [
  {
        id: 'TCK-901',
        farmerName: 'Rameshwar Patel',
        phone: '9876543210',
        crop: 'Paddy/Rice',
        subject: 'Leaf yellowing and blast patches in 25-day old paddy',
        category: 'Field Advisory',
        priority: 'High',
        status: 'In Progress',
        assignedTo: 'Dr. K. Senthil',
        createdAt: '2026-08-29T11:00:00.000Z',
        replies: [
          { from: 'Farmer', text: 'Leaves showing spindle shaped brown spots near tips.', time: '11:00 AM' },
          {
                    from: 'Dr. K. Senthil',
                    text: 'Apply Sathyam Agro Mart BlastShield 75 WP @ 120g/acre mixed in 150L water immediately.',
                    time: '11:45 AM'
          }
              ]
  }
  ];

const INITIAL_CHAT_RECORDS = [
  {
        sessionId: 'CHAT-SESS-01',
        farmerName: 'Muthuvel K.',
        farmerPhone: '9234567890',
        channel: 'Web Live Chat',
        status: 'Active',
        updatedAt: '2026-08-30T14:40:00.000Z',
        messages: [
          {
                    sender: 'Farmer',
                    text: 'Hello, what is the best biological insecticide for cotton whitefly?',
                    timestamp: '02:30 PM'
          },
          {
                    sender: 'Sathyam Agro Mart Bot',
                    text: 'Hello Muthuvel ji! We recommend Sathyam Agro Mart FlyKill Ultra @ 250g per acre.',
                    timestamp: '02:30 PM'
          }
              ]
  }
  ];

async function seedIfEmpty() {
    const userCount = await User.estimatedDocumentCount();
    if (userCount > 0) return;

  console.log('Seeding Sathyam Agro Mart database with initial demo data...');

  await User.insertMany(
        await Promise.all(INITIAL_USERS.map(async u => ({ ...u, _id: u.id, password: await hashPassword(u.password) })))
  );
    await Product.insertMany(INITIAL_PRODUCTS.map(p => ({ ...p, _id: p.id })));
    invalidateProductCache();
    await Order.insertMany(INITIAL_ORDERS.map(o => ({ ...o, _id: o.id })));
    await AdvisorySubscriber.insertMany(INITIAL_ADVISORY_SUBSCRIBERS.map(a => ({ ...a, _id: a.id })));
    await InventoryItem.insertMany(INITIAL_INVENTORY.map(i => ({ ...i, _id: i.id })));
    await StaffTask.insertMany(INITIAL_STAFF_TASKS.map(t => ({ ...t, _id: t.id })));
    await Ticket.insertMany(INITIAL_TICKETS.map(t => ({ ...t, _id: t.id })));
    await ChatRecord.insertMany(INITIAL_CHAT_RECORDS.map(c => ({ ...c, _id: c.sessionId })));

  await Settings.findByIdAndUpdate(
        'global',
    {
            $set: {
                      cms: INITIAL_CMS,
                      catalogOptions: DEFAULT_CATALOG_OPTIONS,
                      profileFields: DEFAULT_PROFILE_FIELDS
            }
    },
    { upsert: true }
      );

  console.log('Sathyam Agro Mart database seed complete.');
}

// Demo records (stores, sample invoices, coupons, referrals) are written only
// when SEED_DEMO_DATA=true. This runs on every API start against whatever
// database MONGODB_URI names - the live one included - so nothing here may
// write by default: made-up coupons would be redeemable, made-up invoices would
// count as sales, and existing staff would be moved into a made-up store.
const SEED_DEMO_DATA = () => process.env.SEED_DEMO_DATA === 'true';

export async function ensureSuperAdminAndStores() {
  try {
    // The first super admin comes from SUPERADMIN_PHONE / SUPERADMIN_PASSWORD.
    // There is no built-in fallback: a known default password on an account
    // that passes every role check would be an open door.
    const superAdmin = await User.findOne({ role: 'superadmin' }).lean();
    const saPhone = String(process.env.SUPERADMIN_PHONE || '').replace(/\D/g, '');
    const saPassword = String(process.env.SUPERADMIN_PASSWORD || '');
    if (!superAdmin && saPhone && saPassword.length >= 12) {
      console.log('⚡ Creating the Super Admin from SUPERADMIN_PHONE...');
      const hashedPassword = await hashPassword(saPassword);
      await User.create({
        _id: 'USR-0001',
        id: 'USR-0001',
        name: process.env.SUPERADMIN_NAME || 'Sathyam Super Admin',
        phone: saPhone,
        email: process.env.SUPERADMIN_EMAIL || '',
        password: hashedPassword,
        role: 'superadmin',
        crop: 'All Crops',
        acreage: 0,
        village: 'Headquarters',
        district: 'Coimbatore',
        state: 'Tamil Nadu',
        status: 'active',
        createdBy: 'system',
        createdAt: new Date().toISOString(),
        permissions: ['*']
      });
      console.log(`✅ Super Admin created for ${saPhone}.`);
    } else if (!superAdmin) {
      console.log('ℹ️ No Super Admin account. Set SUPERADMIN_PHONE and SUPERADMIN_PASSWORD (12+ characters) to create one.');
    }

    if (!SEED_DEMO_DATA()) return;

    const storeCount = await Store.estimatedDocumentCount();
    if (storeCount === 0) {
      console.log('⚡ Initializing default stores...');
      await Store.insertMany([
        {
          _id: 'STR-1001',
          id: 'STR-1001',
          name: 'Coimbatore Flagship Hub',
          code: 'CBE-01',
          location: 'Coimbatore',
          address: '42 Avinashi Road, Peelamedu, Coimbatore - 641004',
          phone: '0422-2900100',
          email: 'cbe-hub@sathyambio.com',
          adminId: 'USR-1002',
          adminName: 'Sathyam Admin',
          status: 'active',
          createdAt: new Date().toISOString()
        },
        {
          _id: 'STR-1002',
          id: 'STR-1002',
          name: 'Tiruppur Agri Center',
          code: 'TPR-01',
          location: 'Tiruppur',
          address: '15 Kangeyam Road, Tiruppur - 641604',
          phone: '0421-2900200',
          email: 'tpr-store@sathyambio.com',
          adminId: null,
          adminName: null,
          status: 'active',
          createdAt: new Date().toISOString()
        }
      ]);

      await User.updateOne(
        { _id: 'USR-1002' },
        {
          $set: {
            storeId: 'STR-1001',
            storeName: 'Coimbatore Flagship Hub',
            storeLocation: 'Coimbatore'
          }
        }
      );

      await User.updateMany(
        { _id: { $in: ['USR-1003', 'USR-1004', 'USR-1005'] } },
        {
          $set: {
            storeId: 'STR-1001',
            storeName: 'Coimbatore Flagship Hub',
            storeLocation: 'Coimbatore',
            assignedAdminId: 'USR-1002',
            assignedAdminName: 'Sathyam Admin'
          }
        }
      );
      console.log('✅ Default stores initialized and existing users assigned.');
    }

    const invoiceCount = await Invoice.estimatedDocumentCount();
    if (invoiceCount === 0) {
      console.log('⚡ Initializing demo invoices with SAM prefix for default stores...');
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

      await Invoice.insertMany([
        {
          _id: 'INV-1001',
          id: 'INV-1001',
          invoiceNo: 'SAM CBE-01 1001',
          documentType: 'TAX INVOICE',
          date: twoDaysAgo.toISOString(),
          customerName: 'Vignesh Kumar',
          customerPhone: '9842111222',
          storeId: 'STR-1001',
          storeCode: 'CBE-01',
          storeName: 'Coimbatore Flagship Hub',
          paymentMode: 'Cash',
          paymentTerms: 'Immediate',
          items: [
            { id: 'ITM-1', name: 'Sathyam Bio BlastShield 75 WP', qty: 2, price: 680, rate: 680, lineTotal: 1360, gstRate: 18, lineCgst: 122.4, lineSgst: 122.4 },
            { id: 'ITM-2', name: 'Sathyam Bio RootVigor Gold', qty: 1, price: 990, rate: 990, lineTotal: 990, gstRate: 18, lineCgst: 89.1, lineSgst: 89.1 }
          ],
          subtotal: 2350,
          discountAmount: 0,
          taxableAmount: 2350,
          cgst: 211.5,
          sgst: 211.5,
          igst: 0,
          totalGst: 423,
          roundOff: 0,
          grandTotal: 2773,
          cashier: 'Sathyam Admin',
          status: 'PAID'
        },
        {
          _id: 'INV-1002',
          id: 'INV-1002',
          invoiceNo: 'SAM CBE-01 1002',
          documentType: 'TAX INVOICE',
          date: yesterday.toISOString(),
          customerName: 'Selvamurugan R',
          customerPhone: '9786012345',
          storeId: 'STR-1001',
          storeCode: 'CBE-01',
          storeName: 'Coimbatore Flagship Hub',
          paymentMode: 'UPI',
          paymentTerms: 'Immediate',
          items: [
            { id: 'ITM-3', name: 'Sathyam Bio WeedClear 24-D', qty: 3, price: 340, rate: 340, lineTotal: 1020, gstRate: 18, lineCgst: 91.8, lineSgst: 91.8 }
          ],
          subtotal: 1020,
          discountAmount: 20,
          taxableAmount: 1000,
          cgst: 90,
          sgst: 90,
          igst: 0,
          totalGst: 180,
          roundOff: 0,
          grandTotal: 1180,
          cashier: 'Sathyam Admin',
          status: 'PAID'
        },
        {
          _id: 'INV-1003',
          id: 'INV-1003',
          invoiceNo: 'SAM CBE-01 1003',
          documentType: 'TAX INVOICE',
          date: now.toISOString(),
          customerName: 'Kannan Palanisamy',
          customerPhone: '9443388776',
          storeId: 'STR-1001',
          storeCode: 'CBE-01',
          storeName: 'Coimbatore Flagship Hub',
          paymentMode: 'Credit Purchase',
          paymentTerms: '30 Days Credit',
          items: [
            { id: 'ITM-4', name: 'Sathyam Bio AminoBoost Liquid', qty: 3, price: 460, rate: 460, lineTotal: 1380, gstRate: 18, lineCgst: 124.2, lineSgst: 124.2 }
          ],
          subtotal: 1380,
          discountAmount: 0,
          taxableAmount: 1380,
          cgst: 124.2,
          sgst: 124.2,
          igst: 0,
          totalGst: 248.4,
          roundOff: 0.6,
          grandTotal: 1629,
          cashier: 'Sathyam Admin',
          status: 'CREDIT'
        },
        {
          _id: 'INV-1004',
          id: 'INV-1004',
          invoiceNo: 'SAM TPR-01 1001',
          documentType: 'TAX INVOICE',
          date: yesterday.toISOString(),
          customerName: 'Dharmalingam P',
          customerPhone: '9865123987',
          storeId: 'STR-1002',
          storeCode: 'TPR-01',
          storeName: 'Tiruppur Agri Center',
          paymentMode: 'UPI',
          paymentTerms: 'Immediate',
          items: [
            { id: 'ITM-5', name: 'Sathyam Bio FlyKill Ultra', qty: 2, price: 840, rate: 840, lineTotal: 1680, gstRate: 18, lineCgst: 151.2, lineSgst: 151.2 }
          ],
          subtotal: 1680,
          discountAmount: 0,
          taxableAmount: 1680,
          cgst: 151.2,
          sgst: 151.2,
          igst: 0,
          totalGst: 302.4,
          roundOff: 0.6,
          grandTotal: 1983,
          cashier: 'Tiruppur Counter',
          status: 'PAID'
        },
        {
          _id: 'INV-1005',
          id: 'INV-1005',
          invoiceNo: 'SAM TPR-01 1002',
          documentType: 'TAX INVOICE',
          date: now.toISOString(),
          customerName: 'Murugesan K',
          customerPhone: '9344123890',
          storeId: 'STR-1002',
          storeCode: 'TPR-01',
          storeName: 'Tiruppur Agri Center',
          paymentMode: 'Cash',
          paymentTerms: 'Immediate',
          items: [
            { id: 'ITM-6', name: 'Sathyam Bio RootVigor Gold', qty: 3, price: 990, rate: 990, lineTotal: 2970, gstRate: 18, lineCgst: 267.3, lineSgst: 267.3 }
          ],
          subtotal: 2970,
          discountAmount: 100,
          taxableAmount: 2870,
          cgst: 258.3,
          sgst: 258.3,
          igst: 0,
          totalGst: 516.6,
          roundOff: 0.4,
          grandTotal: 3387,
          cashier: 'Tiruppur Counter',
          status: 'PAID'
        }
      ]);
      console.log('✅ Demo invoices initialized with SAM prefix for default stores.');
    }
  } catch (err) {
    console.error('Error ensuring superadmin and stores:', err);
  }
}

// ================= DATABASE MANAGER (Mongoose-backed) =================

class DatabaseManager {
    // ================= USERS TABLE =================

  async getUsers(filters = {}) {
        await connectDB();
        let result = (await User.find({}).lean()).map(u => serializeUser(u));

      if (filters.role && filters.role !== 'all') {
              result = result.filter(u => u.role.toLowerCase() === filters.role.toLowerCase());
      }

      if (filters.search) {
              const q = filters.search.toLowerCase().trim();
              result = result.filter(
                        u =>
                                    u.name?.toLowerCase().includes(q) ||
                                    u.phone?.includes(q) ||
                                    u.email?.toLowerCase().includes(q) ||
                                    u.village?.toLowerCase().includes(q) ||
                                    u.crop?.toLowerCase().includes(q)
                      );
      }

      if (filters.sortBy === 'name') {
              result.sort((a, b) => a.name.localeCompare(b.name));
      } else if (filters.sortBy === 'recent') {
              result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      } else {
              result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }

      const products = (await Product.find({}, { targetUserId: 1 }).lean());
        return result.map(user => {
                const targetProductCount = products.filter(p => p.targetUserId === user.id).length;
                return {
                          ...user,
                          targetProductCount
                };
        });
  }

  async getUserById(id, options = {}) {
        if (!id || typeof id !== 'string') return null;
        await connectDB();
        const u = await User.findById(id).lean();
        return serializeUser(u, options);
  }

  // The one active session id for this account (server.js's issueToken, on
  // every login/register). Overwriting it here is what signs out whichever
  // other device was holding the previous token.
  async setUserSessionId(id, sessionId) {
        await connectDB();
        await User.updateOne({ _id: id }, { $set: { sessionId } });
  }

  // options.roles restricts the match to those roles - required wherever the
  // caller cares which account it gets: a phone number can now hold both a
  // staff account and a separate farmer account, so an unscoped lookup could
  // return either one.
  async getUserByIdentifier(identifier, options = {}) {
        // Coerce defensively: callers may pass a non-string from a JSON body.
        if (!identifier || typeof identifier !== 'string') return null;
        await connectDB();
        const clean = identifier.trim().toLowerCase();
        if (!clean) return null;
        const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const query = { $or: [{ phone: clean }, { email: new RegExp(`^${escaped}$`, 'i') }] };
        if (Array.isArray(options.roles) && options.roles.length) query.role = { $in: options.roles };
        // Fetch only the matching accounts instead of loading every user.
        const matches = (await User.find(query).lean()).map(u => serializeUser(u, options));

        // Legacy data can hold several accounts of the same role on one number;
        // the newest one wins.
        matches.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        return matches[0] || null;
  }

  async getProfileFields() {
        await connectDB();
        const settings = await Settings.findById('global').lean();
        // Normalised on every read, so a form saved by an older version still renders.
        return normalizeProfileFields((settings && settings.profileFields) || DEFAULT_PROFILE_FIELDS);
  }

  async saveProfileFields(fields) {
        await connectDB();
        const cleaned = normalizeProfileFields(fields);

      await Settings.findByIdAndUpdate('global', { $set: { profileFields: cleaned } }, { upsert: true });
        return cleaned;
  }

  async updateUserProfile(id, profileUpdates) {
        await connectDB();
        const user = await User.findById(id);
        if (!user) return null;

      const fields = await this.getProfileFields();
        // Only fields the admin left editable; the mobile number never is.
        const editable = fields.filter(field => field.editable && field.id !== 'phone').map(field => field.id);
        const { values, errors } = validateProfileValues(fields, profileUpdates, { only: editable, partial: true });
        const firstProblem = Object.values(errors)[0];
        if (firstProblem) throw inputError('INVALID_PROFILE', firstProblem);

      // Built-in answers live on the user (read by orders, advisories...);
        // answers to fields an admin added live under profile.
        const { core, profile } = splitProfileValues(values);
        if (core.acreage === null) core.acreage = 0;
        const existingProfile = (user.toObject().profile) || {};

      user.set(core);
        user.set('profile', { ...existingProfile, ...profile });
        user.set('updatedAt', new Date().toISOString());
        await user.save();

      return serializeUser(user.toObject());
  }

  // ================= SAVED DELIVERY ADDRESSES =================

  async getAddresses(userId) {
        if (!userId) return [];
        await connectDB();
        const user = await User.findById(String(userId), { addresses: 1 }).lean();
        return Array.isArray(user?.addresses) ? user.addresses : [];
  }

  async saveAddress(userId, address) {
        if (!userId) return [];
        await connectDB();
        const cleaned = {
            id: typeof address.id === 'string' && address.id ? address.id.slice(0, 40) : newId('ADDR'),
            label: String(address.label || 'Home').trim().slice(0, 30) || 'Home',
            // Who receives there, and the number the delivery team calls
            name: String(address.name || '').trim().slice(0, 80),
            // at this address (optional for older clients).
            phone: /^[6-9]\d{9}$/.test(String(address.phone || '').replace(/\D/g, '').slice(-10)) ? String(address.phone).replace(/\D/g, '').slice(-10) : '',
            doorNo: String(address.doorNo || '').trim().slice(0, 40),
            street: String(address.street || '').trim().slice(0, 120),
            area: String(address.area || '').trim().slice(0, 100),
            taluk: String(address.taluk || '').trim().slice(0, 80),
            pincode: String(address.pincode || '').replace(/\D/g, '').slice(0, 6),
            district: String(address.district || '').trim().slice(0, 80),
            state: String(address.state || '').trim().slice(0, 80),
            updatedAt: new Date().toISOString()
        };
        // Optional GPS point ("Use my current location"), checked in geo.js.
        const geo = cleanGeo(address.geo);
        if (geo) cleaned.geo = geo;
        // Same fields checkout requires, so a saved address can always be used to order.
        if (!cleaned.doorNo || !cleaned.street || !cleaned.area || !cleaned.taluk || !/^\d{6}$/.test(cleaned.pincode) || !cleaned.district || !cleaned.state) {
            throw inputError('INVALID_ADDRESS', 'Please complete every delivery address field.');
        }
        const user = await User.findById(String(userId), { addresses: 1 });
        if (!user) return [];
        const addresses = (Array.isArray(user.addresses) ? user.addresses : []).filter(item => item.id !== cleaned.id);
        addresses.push(cleaned);
        user.set('addresses', addresses.slice(-20));
        await user.save();
        return addresses.slice(-20);
  }

  async deleteAddress(userId, addressId) {
        if (!userId || !addressId) return false;
        await connectDB();
        const user = await User.findById(String(userId), { addresses: 1 });
        if (!user) return false;
        const addresses = Array.isArray(user.addresses) ? user.addresses : [];
        const next = addresses.filter(item => item.id !== String(addressId));
        if (next.length === addresses.length) return false;
        user.set('addresses', next);
        await user.save();
        return true;
  }

  async createUser(userData) {
        await connectDB();

        // A number holds at most one customer account and one staff account (one
        // person may shop and also work here; the sign-ins are separate: the
        // store's WhatsApp code finds the farmer, /login the staff account).
        // Two staff accounts on one number would make /login ambiguous.
        const phone = String(userData.phone || '').trim();
        if (phone) {
            const sameKind = (userData.role || 'farmer') === 'farmer' ? 'farmer' : { $in: STAFF_ROLES };
            const clash = await User.findOne({ phone, role: sameKind }).lean();
            if (clash) {
                const err = new Error(sameKind === 'farmer'
                    ? 'This mobile number already has a customer account.'
                    : 'This mobile number is already registered to a staff account.');
                err.code = 'PHONE_TAKEN';
                throw err;
            }
        }

        const role = userData.role || 'farmer';
        if (!USER_ROLES.includes(role)) {
            throw inputError('INVALID_ROLE', 'Unknown user role.');
        }
        // Never fall back to a shared default password.
        const passwordIssues = passwordProblems(userData.password, { role, phone });
        if (passwordIssues.length) {
            throw inputError('WEAK_PASSWORD', weakPasswordMessage(passwordIssues));
        }

        const id = newId('USR');
        const newUser = {
                _id: id,
                id,
                name: userData.name || 'New User',
                // Omitted rather than '' so the unique phone index ignores email-only accounts.
                phone: phone || undefined,
                email: userData.email || '',
                password: await hashPassword(userData.password),
                role,
                // Only a caller that says nothing about these gets the sample
                // values; a blank answer is kept blank. An account made from a
                // mobile number alone must not claim a village it invented —
                // deliveries and advisories read these fields.
                crop: userData.crop ?? 'All Crops',
                acreage: Number(userData.acreage) || 0,
                village: userData.village ?? 'Farm Village',
                district: userData.district ?? 'Coimbatore',
                state: userData.state ?? 'Tamil Nadu',
                department: userData.department || '',
                status: userData.status || 'active',
                storeId: userData.storeId || '',
                storeName: userData.storeName || '',
                storeLocation: userData.storeLocation || '',
                assignedAdminId: userData.assignedAdminId || '',
                assignedAdminName: userData.assignedAdminName || '',
                permissions: Array.isArray(userData.permissions) ? userData.permissions : [],
                createdBy: userData.createdBy || 'admin',
                createdAt: new Date().toISOString(),
                lastLogin: null
        };
        if (userData.profile && typeof userData.profile === 'object') newUser.profile = userData.profile;

      const created = await User.create(newUser);
        return serializeUser(created.toObject());
  }

  async updateUser(id, updates) {
        await connectDB();
        const user = await User.findById(id);
        if (!user) return null;

      const { _id, id: _ignoredId, password, ...rest } = updates || {};
        if (rest.role !== undefined && !USER_ROLES.includes(rest.role)) {
            throw inputError('INVALID_ROLE', 'Unknown user role.');
        }
        if (typeof password === 'string' && password !== '') {
            if (isPasswordHash(password)) {
                rest.password = password;
            } else {
                const passwordIssues = passwordProblems(password, {
                    role: rest.role || user.get('role'),
                    phone: rest.phone ?? user.get('phone')
                });
                if (passwordIssues.length) {
                    throw inputError('WEAK_PASSWORD', weakPasswordMessage(passwordIssues));
                }
                rest.password = await hashPassword(password);
            }
        }
        if (rest.phone === '') {
            delete rest.phone;
            user.set('phone', undefined);
        }

      user.set({ ...rest, updatedAt: new Date().toISOString() });
        await user.save();
        return serializeUser(user.toObject());
  }

  // Removes every account holding this number. Used for whitelisted test
  // numbers, which re-register repeatedly and must not leave duplicates behind.
  async deleteUsersByPhone(phone) {
        if (!phone) return 0;
        await connectDB();
        const result = await User.deleteMany({ phone: String(phone) });
        return result.deletedCount || 0;
  }

  async deleteUser(id) {
        await connectDB();
        const user = await User.findById(id).lean();
        if (!user) return false;

      await Product.updateMany(
        { targetUserId: id },
        { $set: { targetUserId: 'all', targetUserName: 'All Users (General Catalog)' } }
            );
      invalidateProductCache();

      await User.deleteOne({ _id: id });
        return true;
  }

  // ================= PRODUCTS TABLE =================

  async getProducts(options = {}) {
        await connectDB();
        const { userId, category, crop, disease, search, sortBy, onlineOnly, channel } = options;
        // A copy: the sorts further down reorder in place, and the cached array
        // is shared with every other request. (Alagu's channel filter reads the
        // same list; it does not need its own trip to the cluster.)
        let list = [...(await allProducts())];

      // Visibility channel filtering:
      // Online: website only or both (online !== false)
      // Offline: billing counter only or both
      // Both: explicitly available on both
      if (onlineOnly) {
              list = list.filter(p => p.visibility === 'online' || p.visibility === 'both' || (p.visibility === undefined && p.online !== false));
      } else if (channel && channel !== 'all') {
          if (channel === 'online') {
              list = list.filter(p => p.visibility === 'online' || p.visibility === 'both' || p.online !== false);
          } else if (channel === 'offline') {
              list = list.filter(p => p.visibility === 'offline' || p.visibility === 'both' || p.online === false);
          } else if (channel === 'both') {
              list = list.filter(p => p.visibility === 'both');
          }
      }

      if (category && category !== 'All') {
              list = list.filter(p => matchesCategory(p.category, category));
      }

      if (crop && crop !== 'all' && crop !== 'All Crops') {
              list = list.filter(p => matchesCrop(p.crops, crop));
      }

      if (disease && disease !== 'all') {
              list = list.filter(p => matchesDisease(p.diseases, disease));
      }

      if (search) {
              const q = search.toLowerCase().trim();
              list = list.filter(
                        p =>
                                    p.name.toLowerCase().includes(q) ||
                                    p.description?.toLowerCase().includes(q) ||
                                    p.activeIngredient?.toLowerCase().includes(q) ||
                                    p.category.toLowerCase().includes(q) ||
                                    p.targetUserName?.toLowerCase().includes(q)
                      );
      }

      if (userId) {
              const targetUser = await this.getUserById(userId);
              list.sort((a, b) => {
                        const aTarget = a.targetUserId === userId ? 1 : 0;
                        const bTarget = b.targetUserId === userId ? 1 : 0;
                        if (aTarget !== bTarget) return bTarget - aTarget;

                                if (targetUser && targetUser.crop && targetUser.crop !== 'All Crops') {
                                            // A farmer can grow several crops ("Paddy / Rice, Cotton").
                                            const userCrops = cropList(targetUser.crop).map(c => c.toLowerCase());
                                            const forUser = product => product.crops?.some(c => userCrops.some(
                                                          userCrop => userCrop.includes(c.toLowerCase()) || c.toLowerCase().includes(userCrop)
                                                        ));
                                            const aCropMatch = forUser(a) ? 1 : 0;
                                            const bCropMatch = forUser(b) ? 1 : 0;
                                            if (aCropMatch !== bCropMatch) return bCropMatch - aCropMatch;
                                }

                                return (a.sortOrder || 99) - (b.sortOrder || 99);
              });
      } else if (sortBy === 'user') {
              list.sort((a, b) => {
                        const aIsUser = a.targetUserId && a.targetUserId !== 'all' ? 1 : 0;
                        const bIsUser = b.targetUserId && b.targetUserId !== 'all' ? 1 : 0;
                        if (aIsUser !== bIsUser) return bIsUser - aIsUser;
                        return (a.targetUserName || '').localeCompare(b.targetUserName || '');
              });
      } else if (sortBy === 'price_asc') {
              list.sort((a, b) => a.price - b.price);
      } else if (sortBy === 'price_desc') {
              list.sort((a, b) => b.price - a.price);
      } else if (sortBy === 'stock') {
              list.sort((a, b) => b.stock - a.stock);
      } else {
              list.sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
      }

      return list;
  }

  async getProductById(id) {
        if (!id) return null;
        await connectDB();
        const p = await Product.findById(id).lean();
        if (!p) return null;
        return normalizeProduct(serialize(p));
  }

  async getCatalogOptions() {
        await connectDB();
        const settings = await Settings.findById('global').lean();
        const saved = settings && settings.catalogOptions;
        if (!saved) return DEFAULT_CATALOG_OPTIONS;
        // physicalForms was added after catalogOptions was first seeded, so a
        // settings document saved before this feature has every other list
        // but not this one - fall back to the built-in six rather than an
        // empty Physical Form filter on a live site that has never been
        // resaved.
        return saved.physicalForms ? saved : { ...saved, physicalForms: DEFAULT_CATALOG_OPTIONS.physicalForms };
  }

  async registerCatalogOptions({ categories = [], crops = [], storageBatches = [], diseases = [], physicalForms = [] } = {}) {
        await connectDB();
        const current = await this.getCatalogOptions();
        const merge = (base, additions) => [
                ...new Set([...base, ...additions].map(value => String(value).trim()).filter(Boolean))
              ];
        const updated = {
                categories: merge(current.categories, categories),
                crops: merge(current.crops, crops),
                storageBatches: merge(current.storageBatches, storageBatches),
                diseases: merge(current.diseases || [], diseases),
                physicalForms: merge(current.physicalForms || DEFAULT_CATALOG_OPTIONS.physicalForms, physicalForms)
        };
        await Settings.findByIdAndUpdate('global', { $set: { catalogOptions: updated } }, { upsert: true });
        return updated;
  }

  // Takes one value out of a catalogue list (exact match). The caller checks
  // that no product still uses it.
  async removeCatalogOption(kind, value) {
        await connectDB();
        const current = await this.getCatalogOptions();
        const list = Array.isArray(current[kind]) ? current[kind] : [];
        if (!list.includes(value)) return null;
        const updated = { ...current, [kind]: list.filter(item => item !== value) };
        await Settings.findByIdAndUpdate('global', { $set: { catalogOptions: updated } }, { upsert: true });
        return updated;
  }

  // The product already using this name (same name ignoring capitals,
  // punctuation and the brand prefix), other than exceptId. Read from the
  // database, not the product cache, so another server's publish is seen.
  async findSameNamedProduct(name, exceptId) {
        await connectDB();
        const products = (await Product.find({}, { name: 1 }).lean()).map(p => ({ id: p._id, name: p.name }));
        return findSameNamedProduct(products, name, exceptId);
  }

  async createProduct(prodData) {
        await connectDB();
        const id = newId('sb');

      let targetUserName = 'All Users (General Catalog)';
      let targetUserPhone = '';
      if (prodData.targetUserId && prodData.targetUserId !== 'all') {
        const targetUser = await this.getUserById(prodData.targetUserId);
        if (targetUser) {
          targetUserName = `${targetUser.name} (${targetUser.crop || targetUser.role})`;
          targetUserPhone = targetUser.phone || '';
        }
      }

      const price = Number(prodData.price) || 0;
      const mrp = Number(prodData.originalPrice || prodData.mrp || price * 1.2);
      const packSizes = Array.isArray(prodData.packSizes) && prodData.packSizes.length
        ? prodData.packSizes.map(s => String(s).trim()).filter(Boolean)
        : ['250g', '500g', '1kg'];
      const discountPct = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;

      const newProd = {
        _id: id,
        id,
        name: prodData.name || 'New Bio Product',
        tagline: prodData.tagline || `${prodData.category || 'Agro'} Solution for High Yield`,
        category: prodData.category || 'Bio-Pesticide',
        hsnCode: prodData.hsnCode || '3808',
        gstRate: Number(prodData.gstRate !== undefined ? prodData.gstRate : 18),
        cgstRate: Number(prodData.gstRate !== undefined ? prodData.gstRate : 18) / 2,
        sgstRate: Number(prodData.gstRate !== undefined ? prodData.gstRate : 18) / 2,
        igstRate: Number(prodData.gstRate !== undefined ? prodData.gstRate : 18),
        price,
        originalPrice: mrp,
        discount: prodData.discount || `${discountPct}% OFF`,
        stock: Number(prodData.stock) || 0,
        unitsSold: 0, // a new product has sold nothing; only reserveStock moves this
        crops: Array.isArray(prodData.crops)
          ? prodData.crops
          : typeof prodData.crops === 'string'
          ? prodData.crops.split(',').map(s => s.trim())
          : ['All Crops'],
        diseases: (Array.isArray(prodData.diseases)
          ? prodData.diseases
          : typeof prodData.diseases === 'string'
          ? prodData.diseases.split(',').map(s => s.trim())
          : []
        ).filter(Boolean),
        activeIngredient: prodData.activeIngredient || '100% Bio-Active Botanical Extract',
        dosage: prodData.dosage || '250g - 500g per Acre',
        packSizes,
        // The size a card starts on: the one asked for if the product has it,
        // otherwise its first size (a fixed '500g' broke 1kg/5kg/10kg products).
        selectedPack: packSizes.includes(prodData.selectedPack) ? prodData.selectedPack : packSizes[0],
        // Each size's own price and MRP, as the admin form sends them. Without
        // these every size was priced from the first one by weight.
        packagePrices: packPriceMap(prodData.packagePrices, packSizes),
        packageMrps: packPriceMap(prodData.packageMrps, packSizes),
        // Powder, Pellets, Tablets... (src/shared/productForm.js); '' lets the store work it out.
        form: typeof prodData.form === 'string' ? prodData.form.trim().slice(0, 30) : '',
        badge: prodData.badge || (prodData.stock > 100 ? 'Best Seller' : 'New Launch'),
        images:
          Array.isArray(prodData.images) && prodData.images.length
            ? prodData.images
            : prodData.image
            ? [prodData.image]
            : [],
        image: prodData.image || prodData.images?.[0] || './assets/p1.png',
        howToUse: prodData.howToUse || '',
        whenToUse: prodData.whenToUse || '',
        relatedBlogs: Array.isArray(prodData.relatedBlogs) ? prodData.relatedBlogs : [],
        relatedProductIds: Array.isArray(prodData.relatedProductIds) ? prodData.relatedProductIds : [],
        reviewsEnabled: prodData.reviewsEnabled === true,
        reviews: Array.isArray(prodData.reviews) ? prodData.reviews : [],
        rating: null,
        reviewsCount: 0,
        description: prodData.description || 'High-performance bio-crop protection product.',
        detailedDescription:
          prodData.detailedDescription ||
          prodData.description ||
          'Scientifically formulated for modern organic and integrated pest management.',
        targetUserId: prodData.targetUserId || 'all',
        visibility: prodData.visibility || (prodData.online === false ? 'offline' : 'both'),
        online: (prodData.visibility ? prodData.visibility !== 'offline' : prodData.online !== false),
        taggedVideos: Array.isArray(prodData.taggedVideos) ? prodData.taggedVideos : [],
        targetUserName,
        targetUserPhone,
        sortOrder: Number(prodData.sortOrder) || 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await this.registerCatalogOptions({
        categories: [newProd.category],
        crops: newProd.crops,
        storageBatches: newProd.packSizes,
        diseases: newProd.diseases,
        physicalForms: newProd.form ? [newProd.form] : []
      });

      const created = await Product.create(newProd);
      invalidateProductCache();
      return serialize(created.toObject());
  }

  async updateProduct(id, updates) {
      await connectDB();
      const existingDoc = await Product.findById(id).lean();
      if (!existingDoc) return null;
      const existing = serialize(existingDoc);

      let targetUserName = existing.targetUserName || 'All Users (General Catalog)';
      let targetUserPhone = existing.targetUserPhone || '';
      if (updates.targetUserId !== undefined) {
        if (updates.targetUserId === 'all' || !updates.targetUserId) {
          targetUserName = 'All Users (General Catalog)';
          targetUserPhone = '';
        } else {
          const targetUser = await this.getUserById(updates.targetUserId);
          targetUserName = targetUser ? `${targetUser.name} (${targetUser.crop || targetUser.role})` : updates.targetUserId;
          targetUserPhone = targetUser?.phone || '';
        }
      }

      const price = updates.price !== undefined ? Number(updates.price) : existing.price;
      const mrp =
        updates.originalPrice !== undefined || updates.mrp !== undefined
          ? Number(updates.originalPrice || updates.mrp)
          : existing.originalPrice;
      const discountPct = mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0;

      const visibility = updates.visibility !== undefined
        ? updates.visibility
        : (updates.online !== undefined ? (updates.online ? 'online' : 'offline') : (existing.visibility || 'both'));
      const taggedVideos = updates.taggedVideos !== undefined
        ? (Array.isArray(updates.taggedVideos) ? updates.taggedVideos : [])
        : (existing.taggedVideos || []);

      const merged = {
        ...existing,
        ...updates,
        visibility,
        online: visibility !== 'offline',
        taggedVideos,
        targetUserName,
        targetUserPhone,
        hsnCode: updates.hsnCode !== undefined ? updates.hsnCode : (existing.hsnCode || '3808'),
        gstRate: updates.gstRate !== undefined ? Number(updates.gstRate) : (existing.gstRate !== undefined ? Number(existing.gstRate) : 18),
        cgstRate: (updates.gstRate !== undefined ? Number(updates.gstRate) : (existing.gstRate !== undefined ? Number(existing.gstRate) : 18)) / 2,
        sgstRate: (updates.gstRate !== undefined ? Number(updates.gstRate) : (existing.gstRate !== undefined ? Number(existing.gstRate) : 18)) / 2,
        igstRate: updates.gstRate !== undefined ? Number(updates.gstRate) : (existing.gstRate !== undefined ? Number(existing.gstRate) : 18),
        price,
        originalPrice: mrp,
        discount: updates.discount || `${discountPct}% OFF`,
              stock: updates.stock !== undefined ? Number(updates.stock) : existing.stock,
              crops: updates.crops
                ? Array.isArray(updates.crops)
                          ? updates.crops
                          : updates.crops.split(',').map(s => s.trim())
                        : existing.crops,
              diseases: updates.diseases !== undefined
                ? (Array.isArray(updates.diseases)
                          ? updates.diseases
                          : updates.diseases.split(',').map(s => s.trim())
                        ).filter(Boolean)
                        : existing.diseases,
              images: updates.images
                ? Array.isArray(updates.images)
                          ? updates.images
                          : updates.images.split(',').map(s => s.trim())
                        : existing.images,
              image: updates.images?.[0] || updates.image || existing.image,
              howToUse: updates.howToUse !== undefined ? updates.howToUse : existing.howToUse,
              whenToUse: updates.whenToUse !== undefined ? updates.whenToUse : existing.whenToUse,
              relatedBlogs: updates.relatedBlogs !== undefined ? updates.relatedBlogs : existing.relatedBlogs,
              relatedProductIds:
                        updates.relatedProductIds !== undefined ? updates.relatedProductIds : existing.relatedProductIds,
              reviewsEnabled:
                        updates.reviewsEnabled !== undefined ? updates.reviewsEnabled === true : existing.reviewsEnabled,
              rating: null,
              reviewsCount: Array.isArray(existing.reviews) ? existing.reviews.length : 0,
              // Sales belong to the shop, not to whoever is editing the form.
              // The admin page round-trips the product it last read, so without
              // this an edit would quietly put the count back to what it was
              // when the form was opened - or to 0 for a product loaded before
              // the counts existed. Only reserveStock/releaseStock move it.
              unitsSold: Math.max(0, Number(existing.unitsSold) || 0),
              updatedAt: new Date().toISOString()
      };

      await Product.findByIdAndUpdate(id, { $set: merged }, { strict: false });
      invalidateProductCache();

      await this.registerCatalogOptions({
              categories: [merged.category],
              crops: merged.crops,
              storageBatches: merged.packSizes,
              diseases: merged.diseases,
              physicalForms: merged.form ? [merged.form] : []
      });

      return merged;
  }

  async deleteProduct(id) {
        await connectDB();
        const res = await Product.deleteOne({ _id: id });
        invalidateProductCache();
        return res.deletedCount > 0;
  }

  async getUserProductSummary() {
        await connectDB();
        const users = (await User.find({}).lean()).map(serialize);
        const products = (await Product.find({}).lean()).map(serialize);

      return users.map(u => {
              const assignedProducts = products.filter(p => p.targetUserId === u.id);
              const matchingCropProducts = products.filter(
                        p => u.crop && p.crops && p.crops.some(c => u.crop.toLowerCase().includes(c.toLowerCase()))
                      );
              return {
                        userId: u.id,
                        userName: u.name,
                        role: u.role,
                        crop: u.crop,
                        acreage: u.acreage,
                        village: u.village,
                        assignedCount: assignedProducts.length,
                        assignedProducts: assignedProducts.map(p => ({ id: p.id, name: p.name, price: p.price })),
                        cropMatchCount: matchingCropProducts.length
              };
      });
  }

  // ================= ORDERS TABLE =================

  async getOrders() {
        await connectDB();
        const orders = (await Order.find({}).lean()).map(serialize);
        orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return orders;
  }

  async getOrderById(id) {
        if (!id) return null;
        await connectDB();
        const order = await Order.findById(String(id)).lean();
        return order ? serialize(order) : null;
  }

  async getOrderByRazorpayId(razorpayOrderId) {
        if (!razorpayOrderId) return null;
        await connectDB();
        const order = await Order.findOne({ razorpayOrderId: String(razorpayOrderId) }).lean();
        return order ? serialize(order) : null;
  }

  // A customer's orders: those placed from their account, plus any placed as a
  // guest with their verified mobile number.
  async getOrdersForCustomer(user) {
        await connectDB();
        const match = [{ userId: user.id }];
        if (user.phone) match.push({ customerPhone: user.phone });
        const orders = (await Order.find({ $or: match }).lean()).map(serialize);
        orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return orders;
  }

  async getProductsByIds(ids) {
        await connectDB();
        const unique = [...new Set((ids || []).map(String))];
        return (await Product.find({ _id: { $in: unique } }).lean()).map(serialize).map(normalizeProduct);
  }

  // Takes stock for every line or for none: if one line cannot be covered, the
  // lines already taken are put back. Returns the id of the product that ran out.
  async reserveStock(lines) {
        await connectDB();
        const taken = [];
        for (const line of lines) {
            // One update: the stock leaves and the sale is counted together,
            // so `unitsSold` can never drift from what was actually sold.
            const result = await Product.updateOne(
                { _id: line.id, stock: { $gte: line.qty } },
                { $inc: { stock: -line.qty, unitsSold: line.qty }, $set: { updatedAt: new Date().toISOString() } }
            );
            if (!result.modifiedCount) {
                await this.releaseStock(taken);
                return { ok: false, productId: line.id };
            }
            taken.push(line);
        }
        invalidateProductCache();
        return { ok: true };
  }

  async releaseStock(lines) {
        await connectDB();
        for (const line of lines) {
            // Reverses reserveStock exactly: an order that never happened is
            // not a sale.
            await Product.updateOne({ _id: line.id }, { $inc: { stock: line.qty, unitsSold: -line.qty } });
        }
        invalidateProductCache();
  }

  // ---- CART (one document per user, _id = userId) ----

  async getCart(userId) {
        if (!userId) return [];
        await connectDB();
        const doc = await Cart.findById(String(userId)).lean();
        return Array.isArray(doc?.items) ? doc.items : [];
  }

  async saveCart(userId, items) {
        if (!userId) return [];
        await connectDB();
        const safeItems = Array.isArray(items) ? items : [];
        await Cart.findByIdAndUpdate(
            String(userId),
            { items: safeItems, updatedAt: new Date().toISOString() },
            { upsert: true }
        );
        return safeItems;
  }

  async createOrder(orderData) {
        await connectDB();
        const id = newId(ORDER_ID_PREFIX);
        const newOrder = {
                _id: id,
                id,
                userId: orderData.userId || 'USR-WALKIN',
                customerName: orderData.customerName || 'Farmer Customer',
                customerPhone: orderData.customerPhone || '9876543210',
                address: orderData.address || 'Farm Delivery Address',
                addressDetails: orderData.addressDetails || {},
                district: orderData.district || orderData.addressDetails?.district || '',
                state: orderData.state || orderData.addressDetails?.state || '',
                items: orderData.items || [],
                subtotal: Number(orderData.subtotal) || 0,
                gst: Number(orderData.gst) || 0,
                total: Number(orderData.total) || 0,
                // Refer & Earn: the cart before discounts, and what paid the difference.
                ...(Number(orderData.discount) > 0 ? {
                        itemsTotal: Number(orderData.itemsTotal) || 0,
                        discount: Number(orderData.discount) || 0,
                        welcomeDiscount: Number(orderData.welcomeDiscount) || 0,
                        pointsUsed: Number(orderData.pointsUsed) || 0,
                        referralId: orderData.referralId || null,
                        rewardShortfall: orderData.rewardShortfall === true,
                } : {}),
                paymentMethod: orderData.paymentMethod || 'Cash on Delivery',
                paymentStatus: orderData.paymentStatus || 'Pending',
                paymentId: orderData.paymentId || null,
                razorpayOrderId: orderData.razorpayOrderId || null,
                stockShortfall: orderData.stockShortfall === true,
                deliveryStatus: orderData.deliveryStatus || 'Confirmed',
                expectedDeliveryDate: orderData.expectedDeliveryDate || null,
                // An admin assigns a real delivery agent from the Orders page.
                assignedDeliveryBoy: orderData.assignedDeliveryBoy || 'Unassigned',
                deliveryBoyPhone: orderData.deliveryBoyPhone || '',
                otp: crypto.randomInt(1000, 10000).toString(),
                createdAt: new Date().toISOString()
        };

      const created = await Order.create(newOrder);
        return serialize(created.toObject());
  }

  // Atomically marks an order notification as being sent, so concurrent callers
  // (checkout callback and webhook) can never both send it. A send stuck for 5
  // minutes (e.g. the function was killed) may be claimed again.
  async claimOrderNotification(orderId, kind, { resend = false, maxAttempts = 3 } = {}) {
        await connectDB();
        const path = `notifications.${kind}`;
        const now = new Date();
        const staleBefore = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

        const filter = {
            _id: String(orderId),
            $or: [{ [`${path}.status`]: { $ne: 'sending' } }, { [`${path}.attemptedAt`]: { $lt: staleBefore } }]
        };
        if (!resend) {
            filter[`${path}.status`] = { $ne: 'sent' };
            filter[`${path}.attempts`] = { $not: { $gte: maxAttempts } };
        }

        const result = await Order.updateOne(filter, {
            $set: { [`${path}.status`]: 'sending', [`${path}.attemptedAt`]: now.toISOString() },
            $inc: { [`${path}.attempts`]: 1 }
        });
        return result.modifiedCount === 1;
  }

  async recordOrderNotification(orderId, kind, status, error = '', { sender } = {}) {
        await connectDB();
        const path = `notifications.${kind}`;
        const now = new Date().toISOString();
        const set = {
            [`${path}.status`]: status,
            [`${path}.updatedAt`]: now,
            [`${path}.error`]: status === 'failed' ? String(error).slice(0, 200) : ''
        };
        if (status === 'sent') set[`${path}.sentAt`] = now;
        // Which WhatsApp number sent it (e.g. "sender 2"), for tracing a banned number.
        if (sender) set[`${path}.sender`] = sender;
        await Order.updateOne({ _id: String(orderId) }, { $set: set });
  }

  async updateOrder(id, updates) {
        await connectDB();
        const order = await Order.findById(id);
        if (!order) return null;

      order.set(updates);
        await order.save();
        return serialize(order.toObject());
  }

  // Applies `updates` only while the order still matches `condition`, in one
  // step, so two requests racing on the same change cannot both win. Returns
  // the updated order, or null when it no longer matched.
  async updateOrderIf(id, condition, updates) {
        await connectDB();
        const order = await Order.findOneAndUpdate(
            { _id: String(id), ...condition },
            { $set: updates },
            { new: true }
        ).lean();
        return order ? serialize(order) : null;
  }

  // ================= CMS & ADVISORY =================

  async getCMS() {
        await connectDB();
        const settings = await Settings.findById('global').lean();
        return (settings && settings.cms) || {};
  }

  async updateCMS(updates) {
        await connectDB();
        const current = await this.getCMS();
        const merged = { ...current, ...updates };
        await Settings.findByIdAndUpdate('global', { $set: { cms: merged } }, { upsert: true });
        return merged;
  }

  async createUploadMeta({ id, diskFile, contentType, filename, size, uploadedBy }) {
        await connectDB();
        await UploadMeta.create({
              _id: id,
              id,
              diskFile,
              contentType,
              filename: filename || diskFile,
              size: size || 0,
              uploadedBy: uploadedBy || '',
              createdAt: new Date().toISOString()
        });
        return id;
  }

  async getUploadMeta(id) {
        if (!id) return null;
        await connectDB();
        const doc = await UploadMeta.findById(String(id)).lean();
        return doc ? serialize(doc) : null;
  }

  async createUpload({ data, contentType, filename, uploadedBy }) {
        await connectDB();
        const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
        await Upload.create({
              _id: id,
              data,
              contentType,
              filename: filename || '',
              size: Buffer.byteLength(data, 'base64'),
              uploadedBy: uploadedBy || '',
              createdAt: new Date().toISOString()
        });
        return id;
  }

  async getUpload(id) {
        await connectDB();
        return await Upload.findById(id).lean();
  }

  async getAdvisorySubscribers() {
        await connectDB();
        const subs = (await AdvisorySubscriber.find({}).lean()).map(serialize);
        subs.sort((a, b) => new Date(b.subscribedAt) - new Date(a.subscribedAt));
        return subs;
  }

  async addAdvisorySubscriber(sub) {
        await connectDB();
        const doc = { ...sub, _id: sub.id };
        const created = await AdvisorySubscriber.create(doc);
        return serialize(created.toObject());
  }

  async updateAdvisorySubscriber(id, patch) {
        await connectDB();
        const doc = await AdvisorySubscriber.findByIdAndUpdate(id, { $set: patch }, { returnDocument: 'after', lean: true });
        return doc ? serialize(doc) : null;
  }

  async setAdvisoryStatusByPhone(phone, status) {
        await connectDB();
        await AdvisorySubscriber.updateMany({ phone }, { $set: { status } });
  }

  // ---- Advisory broadcasts ----
  // A broadcast keeps its own snapshot of recipients, each with a delivery
  // status: queued -> sending -> sent | failed | skipped (or cancelled).

  async createAdvisoryBroadcast(broadcast) {
        await connectDB();
        const created = await AdvisoryBroadcast.create({ ...broadcast, _id: broadcast.id });
        return serialize(created.toObject());
  }

  async getAdvisoryBroadcast(id) {
        await connectDB();
        return serialize(await AdvisoryBroadcast.findById(id).lean());
  }

  // Newest first, without the recipient lists.
  async getAdvisoryBroadcasts(limit = 20) {
        await connectDB();
        const docs = await AdvisoryBroadcast.find({}, { recipients: 0 }).sort({ createdAt: -1 }).limit(limit).lean();
        return docs.map(serialize);
  }

  // Atomically moves one queued recipient to "sending" and returns it, or null
  // when none is left. Two parallel workers can never claim the same farmer.
  async claimBroadcastRecipient(id) {
        await connectDB();
        const token = crypto.randomUUID();
        const doc = await AdvisoryBroadcast.findOneAndUpdate(
            { _id: id, status: 'sending', 'recipients.status': 'queued' },
            { $set: { 'recipients.$.status': 'sending', 'recipients.$.claimedAt': new Date().toISOString(), 'recipients.$.claimToken': token } },
            { returnDocument: 'after', lean: true, projection: { recipients: { $elemMatch: { claimToken: token } } } }
        );
        return doc?.recipients?.[0] || null;
  }

  async setBroadcastRecipient(id, phone, fields) {
        await connectDB();
        const set = Object.fromEntries(Object.entries(fields).map(([k, v]) => [`recipients.$.${k}`, v]));
        await AdvisoryBroadcast.updateOne({ _id: id, 'recipients.phone': phone }, { $set: set });
  }

  // Recipients stuck in "sending" (their worker died) are marked failed, never
  // re-sent: the message may already have been delivered.
  async failStaleBroadcastRecipients(id, olderThanIso) {
        await connectDB();
        await AdvisoryBroadcast.updateOne(
            { _id: id },
            { $set: { 'recipients.$[r].status': 'failed', 'recipients.$[r].error': 'Delivery not confirmed (interrupted)' } },
            { arrayFilters: [{ 'r.status': 'sending', 'r.claimedAt': { $lt: olderThanIso } }] }
        );
  }

  async cancelAdvisoryBroadcast(id) {
        await connectDB();
        await AdvisoryBroadcast.updateOne(
            { _id: id, status: 'sending' },
            { $set: { status: 'cancelled', finishedAt: new Date().toISOString(), 'recipients.$[r].status': 'cancelled' } },
            { arrayFilters: [{ 'r.status': 'queued' }] }
        );
  }

  async updateAdvisoryBroadcast(id, patch, { onlyIfStatus } = {}) {
        await connectDB();
        await AdvisoryBroadcast.updateOne(onlyIfStatus ? { _id: id, status: onlyIfStatus } : { _id: id }, { $set: patch });
  }

  // Latest point for this browser, with the last 20 kept as history.
  async saveVisitorLocation({ visitorId, geo, page, lang, userId, name, phone }) {
        await connectDB();
        const now = new Date().toISOString();
        const latest = { lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy, at: geo.capturedAt };
        const set = { lat: geo.lat, lng: geo.lng, accuracy: geo.accuracy, page, lang, lastSeen: now, locationStatus: 'granted' };
        if (userId) set.userId = userId;
        if (name) set.name = name;
        if (phone) set.phone = phone;
        await VisitorLocation.updateOne(
            { _id: visitorId },
            { $set: set, $setOnInsert: { firstSeen: now }, $inc: { visits: 1 }, $push: { history: { $each: [latest], $slice: -20 } } },
            { upsert: true }
        );
  }

  // The browser reported the visitor was asked and said no (or the site is
  // blocked): no point, just the fact, so a granted report later still wins.
  async markVisitorLocationDenied({ visitorId, userId, name, phone }) {
        await connectDB();
        const now = new Date().toISOString();
        const set = { lastSeen: now };
        if (userId) set.userId = userId;
        if (name) set.name = name;
        if (phone) set.phone = phone;
        try {
            await VisitorLocation.updateOne(
                { _id: visitorId, locationStatus: { $ne: 'granted' } },
                { $set: { ...set, locationStatus: 'denied' }, $setOnInsert: { firstSeen: now }, $inc: { visits: 1 } },
                { upsert: true }
            );
        } catch (err) {
            // Already granted (matched nothing above, so upsert tried to insert
            // into an existing _id): a real location report always wins.
            if (err?.code !== 11000) throw err;
        }
  }

  // The "Stay connected" name and number, sent as soon as they are given -
  // independent of whether location is ever asked or answered.
  async saveVisitorContact({ visitorId, userId, name, phone }) {
        await connectDB();
        const now = new Date().toISOString();
        const set = { lastSeen: now };
        if (userId) set.userId = userId;
        if (name) set.name = name;
        if (phone) set.phone = phone;
        await VisitorLocation.updateOne(
            { _id: visitorId },
            { $set: set, $setOnInsert: { firstSeen: now, locationStatus: 'pending' }, $inc: { visits: 1 } },
            { upsert: true }
        );
  }

  async getVisitorLocations(limit = 500) {
        await connectDB();
        return (await VisitorLocation.find({}, { history: 0 }).sort({ lastSeen: -1 }).limit(limit).lean()).map(serialize);
  }

  async getFarmerEnquiries() {
        await connectDB();
        const enquiries = (await FarmerEnquiry.find({}).lean()).map(serialize);
        enquiries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return enquiries;
  }

  async addFarmerEnquiry(enquiry) {
        await connectDB();
        const doc = { ...enquiry, _id: enquiry.id };
        const created = await FarmerEnquiry.create(doc);
        return serialize(created.toObject());
  }

  async updateFarmerEnquiryStatus(id, status) {
        await connectDB();
        const updated = await FarmerEnquiry.findByIdAndUpdate(
            id,
            { $set: { status, updatedAt: new Date().toISOString() } },
            { new: true }
        ).lean();
        return updated ? serialize(updated) : null;
  }

  async getWishlists() {
        await connectDB();
        const items = await WishlistItem.find({}).lean();
        return items.map(serialize);
  }

  async setWishlistItem(item) {
        await connectDB();
        const key = item.userId || item.phone || `visitor-${Date.now()}`;
        const productId = String(item.productId || '');
        if (!productId) return this.getWishlists();
        const id = `${key}::${productId}`;

        if (item.saved) {
            await WishlistItem.findByIdAndUpdate(
                id,
                {
                    key,
                    userId: item.userId || '',
                    phone: item.phone || '',
                    productId,
                    productName: item.productName || '',
                    updatedAt: new Date().toISOString()
                },
                { upsert: true }
            );
        } else {
            await WishlistItem.findByIdAndDelete(id);
        }

        return this.getWishlists();
  }

  async getInventory() {
        await connectDB();
        const items = await InventoryItem.find({}).lean();
        return items.map(serialize);
  }

  async getStaffTasks() {
        await connectDB();
        const tasks = await StaffTask.find({}).lean();
        return tasks.map(serialize);
  }

  async getTickets(filter = {}) {
        await connectDB();
        const query = {};
        if (filter.phone) query.phone = filter.phone;
        if (filter.userId) query.userId = filter.userId;
        if (filter.assignedToId) query.assignedToId = filter.assignedToId;
        const tickets = (await Ticket.find(query).lean()).map(serialize);
        tickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return tickets;
  }

  async getTicketById(id) {
        await connectDB();
        const ticket = await Ticket.findById(id).lean();
        return ticket ? serialize(ticket) : null;
  }

  async updateTicket(id, updates) {
        await connectDB();
        const updated = await Ticket.findByIdAndUpdate(id, { $set: updates }, { new: true, lean: true });
        return updated ? serialize(updated) : null;
  }

  async addTicketReply(id, reply) {
        await connectDB();
        const updated = await Ticket.findByIdAndUpdate(
          id,
          { $push: { replies: reply }, $set: { updatedAt: new Date().toISOString() } },
          { new: true, lean: true }
        );
        return updated ? serialize(updated) : null;
  }

  async addTicket(ticket) {
        await connectDB();
        const doc = { ...ticket, _id: ticket.id };
        const created = await Ticket.create(doc);
        return serialize(created.toObject());
  }

  async getAgronomyExperts() {
        await connectDB();
        const staff = await this.listStaffProfiles();
        return staff.filter(s => s.isAgronomyExpert || s.profile?.isAgronomyExpert);
  }

  async setEmployeeAgronomyExpert(userId, isExpert, details = {}) {
        await connectDB();
        await User.findByIdAndUpdate(userId, { $set: { isAgronomyExpert: Boolean(isExpert), ...details } });
        await StaffProfile.findByIdAndUpdate(userId, { $set: { isAgronomyExpert: Boolean(isExpert), ...details } }, { upsert: true });
        return true;
  }

  async addAgronomyBooking(booking) {
        await connectDB();
        const doc = { ...booking, _id: booking.id };
        const created = await AgronomyBooking.create(doc);
        return serialize(created.toObject());
  }

  async getAgronomyBookings(filter = {}) {
        await connectDB();
        const query = {};
        if (filter.userId) query.userId = filter.userId;
        if (filter.expertId) query.expertId = filter.expertId;
        const list = await AgronomyBooking.find(query).lean();
        return list.map(serialize);
  }

  async getChatRecords() {
        await connectDB();
        const records = await ChatRecord.find({}).lean();
        return records.map(stripMongoFields);
  }

  async getWishlistForOwner(ownerId) {
        if (!ownerId) return [];
        await connectDB();
        const items = await WishlistItem.find({ $or: [{ key: ownerId }, { userId: ownerId }] }).lean();
        return items.map(serialize);
  }

  // ================= ADMIN DASHBOARD =================

  // storeId scopes the counter/billing side to one branch - the only side
  // that carries a storeId at all (Invoice, set at creation). Online orders
  // have no store on them: there is one storefront, not one per branch, so
  // a farmer's order was never placed "at" any of them. A branch admin's
  // dashboard therefore shows their own counter takings and 0 online - the
  // website's sales are not theirs to take credit for - while an admin with
  // no storeId (the original, pre-multi-store account) keeps seeing the
  // company-wide total exactly as before, online and offline both.
  async getAdminStats(storeId = '') {
        await connectDB();
        // "Today" is the business day in India (UTC+5:30), not the server's UTC day.
        const IST_OFFSET_MS = 330 * 60 * 1000;
        const DAY_MS = 24 * 60 * 60 * 1000;
        const dayStartIso = new Date(Math.floor((Date.now() + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS).toISOString();
        const scoped = Boolean(storeId);

        const invoiceQuery = scoped ? { storeId } : {};
        // Subscribers, tickets and wishlist saves are genuinely company-wide -
        // one advisory list, one support inbox, one storefront's wishlists -
        // so they are the real total even in a store-scoped response; only
        // orders and revenue change with storeId.
        const [orders, invoices, totalProducts, activeProducts, subscribers, openTickets, wishlistSaves] = await Promise.all([
            scoped ? [] : Order.find({}, { total: 1, paymentStatus: 1, deliveryStatus: 1, createdAt: 1 }).lean(),
            Invoice.find(invoiceQuery, { grandTotal: 1, status: 1, date: 1 }).lean(),
            Product.countDocuments({}),
            Product.countDocuments({ stock: { $gt: 0 } }),
            AdvisorySubscriber.countDocuments({}),
            Ticket.countDocuments({ status: { $nin: ['Closed', 'Resolved'] } }),
            WishlistItem.countDocuments({})
        ]);

        // A cancelled order is not revenue, even if it was paid (refunded).
        const paid = orders.filter(o => o.paymentStatus === 'Paid' && (o.deliveryStatus || o.status) !== 'Cancelled');
        const onlineRevenue = paid.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
        const offlineRevenue = invoices.reduce((sum, inv) => sum + (Number(inv.grandTotal) || 0), 0);
        const totalRevenue = Math.round((onlineRevenue + offlineRevenue) * 100) / 100;

        const onlineToday = orders.filter(o => String(o.createdAt || '') >= dayStartIso).length;
        const offlineToday = invoices.filter(i => String(i.date || '') >= dayStartIso).length;

        return {
            scope: scoped ? 'store' : 'company',
            totalRevenue,
            onlineRevenue: Math.round(onlineRevenue * 100) / 100,
            offlineRevenue: Math.round(offlineRevenue * 100) / 100,
            paidOrders: paid.length,
            totalOrders: orders.length + invoices.length,
            onlineOrders: orders.length,
            offlineOrders: invoices.length,
            ordersToday: onlineToday + offlineToday,
            onlineOrdersToday: onlineToday,
            offlineOrdersToday: offlineToday,
            // The catalogue is shared across every store (one website, one
            // product list) - a new branch's admin correctly sees the same
            // count as every other branch, same as Products Master itself.
            totalProducts,
            activeProducts,
            subscribers,
            openTickets,
            wishlistSaves,
            pendingDeliveries: orders.filter(o => !['Delivered', 'Cancelled'].includes(o.deliveryStatus)).length
        };
  }

  // ================= EPHEMERAL STATE =================

  async kvGet(key) {
        await connectDB();
        const doc = await Ephemeral.findById(key).lean();
        // MongoDB's TTL sweep only runs about once a minute, so check expiry here too.
        return doc && doc.purgeAt > new Date() ? doc.value : null;
  }

  async kvSet(key, value, ttlMs) {
        await connectDB();
        await Ephemeral.replaceOne(
            { _id: key },
            { _id: key, value, purgeAt: new Date(Date.now() + ttlMs) },
            { upsert: true }
        );
        return value;
  }

  async kvDelete(key) {
        await connectDB();
        await Ephemeral.deleteOne({ _id: key });
  }

  // Several kvGet lookups in one round trip. Returns a Map of key -> value,
  // holding only the keys that exist and have not expired.
  async kvGetMany(keys) {
        await connectDB();
        const docs = await Ephemeral.find({ _id: { $in: keys }, purgeAt: { $gt: new Date() } }).lean();
        return new Map(docs.map(doc => [doc._id, doc.value]));
  }

  // Claims the next turn on a paced resource (e.g. one WhatsApp number): it
  // succeeds only once the gap set by the previous claim has passed, so parallel
  // instances can never both take the same turn. Returns 0 when claimed,
  // otherwise the milliseconds until the resource frees up.
  async kvClaimSlot(key, gapMs) {
        await connectDB();
        const now = Date.now();
        try {
            await Ephemeral.findOneAndUpdate(
                { _id: key, $or: [{ 'value.nextAt': { $lte: now } }, { purgeAt: { $lte: new Date(now) } }] },
                { $set: { value: { nextAt: now + gapMs }, purgeAt: new Date(now + gapMs + 60 * 1000) } },
                { upsert: true }
            );
            return 0;
        } catch (err) {
            // The record exists and its turn is still taken, so the upsert collided.
            if (err?.code !== 11000) throw err;
            const doc = await Ephemeral.findById(key).lean();
            return Math.max(50, Number(doc?.value?.nextAt) - now || 50);
        }
  }

  // Atomically adds 1 to a numeric field inside the value. With upsert (the
  // default) a missing record is created; otherwise a missing record returns 0.
  // `by` may be negative, to give back a count that was taken for something
  // that then did not happen (see refundRateLimit).
  async kvIncrement(key, field, ttlMs, { upsert = true, by = 1 } = {}) {
        await connectDB();
        const doc = await Ephemeral.findOneAndUpdate(
            upsert ? { _id: key } : { _id: key, purgeAt: { $gt: new Date() } },
            { $inc: { [`value.${field}`]: by }, $setOnInsert: { purgeAt: new Date(Date.now() + ttlMs) } },
            { upsert, returnDocument: 'after', lean: true }
        );
        return Number(doc?.value?.[field]) || 0;
  }

  // Moves a record to a new status only if it is still in the expected one, so
  // two concurrent requests can never both claim it.
  async kvTransition(key, fromStatus, toStatus, extra = {}) {
        await connectDB();
        const set = { 'value.status': toStatus };
        for (const [field, value] of Object.entries(extra)) set[`value.${field}`] = value;
        const doc = await Ephemeral.findOneAndUpdate(
            { _id: key, purgeAt: { $gt: new Date() }, 'value.status': fromStatus },
            { $set: set },
            { returnDocument: 'after', lean: true }
        );
        return doc ? doc.value : null;
  }

  // ================= BILLING INVOICES =================

  /**
   * Returns the next sequential invoice number for a store in the format:
   * "SAM <storeCode> <integer>" (e.g. "SAM CBE-01 1001")
   * Scans existing invoices to find the highest integer sequence for this store.
   */
  async getNextInvoiceNumber(storeCode) {
        await connectDB();
        const code = (storeCode || 'GEN').trim().toUpperCase();
        const prefix = `SAM ${code} `;
        // Find all invoices for this store code
        const existing = await Invoice.find(
          { invoiceNo: { $regex: `^SAM ${code.replace(/-/g, '\\-')} \\d+$` } },
          { invoiceNo: 1 }
        ).lean();
        let maxSeq = 1000;
        for (const inv of existing) {
          const parts = (inv.invoiceNo || '').split(' ');
          const seq = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
        }
        return `${prefix}${maxSeq + 1}`;
  }

  async createInvoice(invoiceData) {
        await connectDB();
        const id = invoiceData.id || newId('INV');
        const created = await Invoice.create({ ...invoiceData, _id: id, id });
        return serialize(created.toObject());
  }

  async getInvoices(filters = {}) {
        await connectDB();
        const query = {};
        if (filters.storeId && filters.storeId !== 'all') query.storeId = filters.storeId;
        if (filters.storeCode && filters.storeCode !== 'all') query.storeCode = filters.storeCode;
        if (filters.from || filters.to) {
          query.date = {};
          if (filters.from) query.date.$gte = new Date(filters.from).toISOString();
          if (filters.to) {
            const toDate = new Date(filters.to);
            toDate.setDate(toDate.getDate() + 1);
            query.date.$lt = toDate.toISOString();
          }
        }
        const invoices = await Invoice.find(query).sort({ date: -1 }).lean();
        return invoices.map(serialize);
  }

  /** Fetch invoices across all stores for Super Admin with optional filters */
  async getInvoicesAllStores(filters = {}) {
        return this.getInvoices(filters);
  }

  // ================= BLOGS TABLE =================

  async getBlogs(filters = {}) {
        await connectDB();
        let list = (await Blog.find(filters.publishedOnly ? { published: { $ne: false } } : {}).lean()).map(serialize);
        if (filters.category && filters.category !== 'All') {
            list = list.filter(b => b.category?.toLowerCase() === filters.category.toLowerCase());
        }
        if (filters.tag) {
            list = list.filter(b => Array.isArray(b.tags) && b.tags.some(t => String(t).toLowerCase() === filters.tag.toLowerCase()));
        }
        if (filters.search) {
            const q = filters.search.toLowerCase().trim();
            list = list.filter(b =>
                b.title?.toLowerCase().includes(q) ||
                b.summary?.toLowerCase().includes(q) ||
                b.content?.toLowerCase().includes(q) ||
                b.category?.toLowerCase().includes(q)
            );
        }
        list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        return list;
  }

  async getBlogById(id) {
        if (!id) return null;
        await connectDB();
        const blog = await Blog.findById(String(id)).lean();
        return blog ? serialize(blog) : null;
  }

  async createBlog(data) {
        await connectDB();
        const id = newId('blog');
        const newBlog = {
            _id: id,
            id,
            title: data.title || 'Untitled Blog',
            slug: (data.slug || data.title || id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
            summary: data.summary || '',
            content: data.content || '',
            coverImage: data.coverImage || 'https://images.unsplash.com/photo-1592982537447-7440770cbfc9?w=800&q=80',
            author: data.author || 'Sathyam Agro Mart Agronomy Team',
            category: data.category || 'Crop Advisory',
            tags: splitTags(data.tags, ['Farming']),
            taggedProducts: Array.isArray(data.taggedProducts) ? data.taggedProducts : [],
            taggedVideos: Array.isArray(data.taggedVideos) ? data.taggedVideos : [],
            readTime: data.readTime || '3 min read',
            published: data.published !== false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        const created = await Blog.create(newBlog);
        return serialize(created.toObject());
  }

  async updateBlog(id, updates) {
        await connectDB();
        const existing = await Blog.findById(String(id)).lean();
        if (!existing) return null;
        const { _id, id: _ignored, createdAt, ...rest } = updates;
        const merged = {
            ...serialize(existing),
            ...rest,
            tags: rest.tags !== undefined ? splitTags(rest.tags, []) : existing.tags,
            updatedAt: new Date().toISOString()
        };
        const { id: _mergedId, ...toSave } = merged;
        await Blog.findByIdAndUpdate(String(id), { $set: toSave }, { strict: false });
        return merged;
  }

  async deleteBlog(id) {
        await connectDB();
        const res = await Blog.deleteOne({ _id: String(id) });
        return res.deletedCount > 0;
  }

  // ================= VIDEOS TABLE =================

  async getVideos(filters = {}) {
        await connectDB();
        let list = (await Video.find({}).lean()).map(serialize);
        if (filters.category && filters.category !== 'All') {
            list = list.filter(v => v.category?.toLowerCase() === filters.category.toLowerCase());
        }
        if (filters.search) {
            const q = filters.search.toLowerCase().trim();
            list = list.filter(v =>
                v.title?.toLowerCase().includes(q) ||
                v.description?.toLowerCase().includes(q) ||
                v.category?.toLowerCase().includes(q)
            );
        }
        list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        return list;
  }

  async getVideoById(id) {
        if (!id) return null;
        await connectDB();
        const video = await Video.findById(String(id)).lean();
        return video ? serialize(video) : null;
  }

  async createVideo(data) {
        await connectDB();
        const videoUrl = data.videoUrl || data.url || '';
        const thumb = data.thumbnailUrl || data.thumbnail || '';
        const id = newId('VID');
        const newVideo = {
            _id: id,
            id,
            title: data.title || 'Untitled Video',
            description: data.description || '',
            videoUrl,
            url: videoUrl,
            thumbnail: thumb,
            thumbnailUrl: thumb,
            category: data.category || 'Product Demo',
            tags: splitTags(data.tags, []),
            duration: data.duration || '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        const created = await Video.create(newVideo);
        return serialize(created.toObject());
  }

  async updateVideo(id, updates) {
        await connectDB();
        const existing = await Video.findById(String(id)).lean();
        if (!existing) return null;
        const { _id, id: _ignored, createdAt, ...rest } = updates;
        const videoUrl = rest.videoUrl || rest.url || existing.videoUrl || existing.url || '';
        const thumb = rest.thumbnailUrl || rest.thumbnail || existing.thumbnailUrl || existing.thumbnail || '';
        const merged = {
            ...serialize(existing),
            ...rest,
            videoUrl,
            url: videoUrl,
            thumbnail: thumb,
            thumbnailUrl: thumb,
            tags: rest.tags !== undefined ? splitTags(rest.tags, []) : existing.tags,
            updatedAt: new Date().toISOString()
        };
        const { id: _mergedId, ...toSave } = merged;
        await Video.findByIdAndUpdate(String(id), { $set: toSave }, { strict: false });
        return merged;
  }

  async deleteVideo(id) {
        await connectDB();
        const res = await Video.deleteOne({ _id: String(id) });
        return res.deletedCount > 0;
  }

  // ---- COUPON MANAGEMENT & CREDIT MONITORING ----
  async getCoupons() {
    await connectDB();
    let coupons = (await Coupon.find({}).lean()).map(serialize);
    if (coupons.length === 0 && SEED_DEMO_DATA()) {
      const defaultCoupons = [
        {
          _id: 'CPN-SATHYA10',
          id: 'CPN-SATHYA10',
          code: 'SATHYA10',
          type: 'percentage',
          value: 10,
          minOrder: 500,
          maxDiscount: 300,
          usageType: 'multiple',
          active: true,
          usageCount: 3,
          createdAt: new Date().toISOString()
        },
        {
          _id: 'CPN-FIRSTFARMER',
          id: 'CPN-FIRSTFARMER',
          code: 'FIRSTFARMER',
          type: 'flat',
          value: 150,
          minOrder: 400,
          maxDiscount: 150,
          usageType: 'first_time',
          active: true,
          usageCount: 5,
          createdAt: new Date().toISOString()
        },
        {
          _id: 'CPN-HARVEST200',
          id: 'CPN-HARVEST200',
          code: 'HARVEST200',
          type: 'flat',
          value: 200,
          minOrder: 1000,
          maxDiscount: 200,
          usageType: 'one_time',
          active: true,
          usageCount: 1,
          createdAt: new Date().toISOString()
        }
      ];
      await Coupon.insertMany(defaultCoupons);
      coupons = defaultCoupons;
    }
    return coupons;
  }

  async addCoupon(couponData) {
    await connectDB();
    const code = String(couponData.code || '').trim().toUpperCase();
    const id = `CPN-${code}`;
    const doc = {
      _id: id,
      id,
      code,
      type: couponData.type || 'percentage',
      value: Number(couponData.value) || 0,
      minOrder: Number(couponData.minOrder) || 0,
      maxDiscount: Number(couponData.maxDiscount) || 0,
      usageType: couponData.usageType || 'multiple',
      active: couponData.active !== false,
      usageCount: 0,
      createdAt: new Date().toISOString()
    };
    await Coupon.create(doc);
    return serialize(doc);
  }

  async updateCoupon(id, updates) {
    await connectDB();
    const existing = await Coupon.findById(id).lean();
    if (!existing) return null;
    const merged = { ...serialize(existing), ...updates, updatedAt: new Date().toISOString() };
    await Coupon.findByIdAndUpdate(id, { $set: merged }, { strict: false });
    return merged;
  }

  async deleteCoupon(id) {
    await connectDB();
    const res = await Coupon.deleteOne({ _id: id });
    return res.deletedCount > 0;
  }

  async getCouponUsages() {
    await connectDB();
    let usages = (await CouponUsage.find({}).lean()).map(serialize);
    if (usages.length === 0 && SEED_DEMO_DATA()) {
      const defaultUsages = [
        {
          _id: 'USG-1',
          id: 'USG-1',
          couponCode: 'FIRSTFARMER',
          userId: 'usr-1',
          userName: 'Ramesh Kumar',
          userPhone: '9876543210',
          orderId: 'ORD-1002',
          discountAmount: 150,
          usedAt: new Date(Date.now() - 86400000 * 2).toISOString()
        },
        {
          _id: 'USG-2',
          id: 'USG-2',
          couponCode: 'SATHYA10',
          userId: 'usr-2',
          userName: 'Suresh Patel',
          userPhone: '9812345678',
          orderId: 'ORD-1005',
          discountAmount: 180,
          usedAt: new Date(Date.now() - 86400000 * 1).toISOString()
        }
      ];
      await CouponUsage.insertMany(defaultUsages);
      usages = defaultUsages;
    }
    return usages;
  }

  async recordCouponUsage(couponCode, userId, userName, userPhone, orderId, discountAmount) {
    await connectDB();
    const id = `USG-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const usage = {
      _id: id,
      id,
      couponCode: String(couponCode).toUpperCase(),
      userId: String(userId || 'guest'),
      userName: String(userName || 'Customer'),
      userPhone: String(userPhone || ''),
      orderId: String(orderId || ''),
      discountAmount: Number(discountAmount) || 0,
      usedAt: new Date().toISOString()
    };
    await CouponUsage.create(usage);
    await Coupon.updateOne({ code: couponCode.toUpperCase() }, { $inc: { usageCount: 1 } });
    return usage;
  }

  // ---- REFERRALS & REWARD POINTS ----
  async getReferrals() {
    await connectDB();
    let refs = (await Referral.find({}).lean()).map(serialize);
    if (refs.length === 0 && SEED_DEMO_DATA()) {
      const defaultRefs = [
        {
          _id: 'REF-1',
          id: 'REF-1',
          referrerId: 'usr-1',
          referrerName: 'Ramesh Kumar',
          referrerPhone: '9876543210',
          referredId: 'usr-3',
          referredName: 'Venkatesh Rao',
          referredPhone: '9765432109',
          pointsAwarded: 100,
          status: 'Completed',
          createdAt: new Date(Date.now() - 86400000 * 5).toISOString()
        },
        {
          _id: 'REF-2',
          id: 'REF-2',
          referrerId: 'usr-2',
          referrerName: 'Suresh Patel',
          referrerPhone: '9812345678',
          referredId: 'usr-4',
          referredName: 'Anil Reddy',
          referredPhone: '9654321098',
          pointsAwarded: 100,
          status: 'Completed',
          createdAt: new Date(Date.now() - 86400000 * 3).toISOString()
        }
      ];
      await Referral.insertMany(defaultRefs);
      refs = defaultRefs;
    }
    return refs;
  }

  async getPointsLedgers() {
    await connectDB();
    return (await PointsLedger.find({}).lean()).map(serialize);
  }

  // Every change to a balance goes through $inc and a conditional filter, so
  // two changes at the same moment can never overwrite each other. Returns
  // null when the user is missing or not a farmer, { error } when a deduction
  // would take the balance below zero.
  async addPoints(userId, points, description, { type, orderId, referralId, expiresAt } = {}) {
    await connectDB();
    const delta = Math.trunc(Number(points));
    const now = new Date().toISOString();
    const user = await User.findOne({ _id: String(userId), role: 'farmer' }).lean();
    if (!user) return null;

    // An expired balance is written off before new points land on it, so
    // earning again never revives points that had lapsed.
    if (user.pointsExpireAt && user.pointsExpireAt <= now && Number(user.points) > 0) {
      const lapsed = await User.findOneAndUpdate(
        { _id: user._id, pointsExpireAt: user.pointsExpireAt, points: user.points },
        { $set: { points: 0 } },
        { returnDocument: 'after', lean: true },
      );
      if (lapsed) await this.recordPoints(lapsed, -Number(user.points), 'Points expired', 'expired');
    }

    const filter = { _id: user._id };
    if (delta < 0) filter.points = { $gte: -delta };
    const update = { $inc: { points: delta } };
    if (expiresAt) update.$set = { pointsExpireAt: expiresAt };
    const updated = await User.findOneAndUpdate(filter, update, { returnDocument: 'after', lean: true });
    if (!updated) return { error: 'INSUFFICIENT_POINTS' };

    const ledger = await this.recordPoints(updated, delta, description, type || (delta >= 0 ? 'earned' : 'spent'), { orderId, referralId });
    return { userId: updated._id, newPoints: Number(updated.points) || 0, ledger };
  }

  async recordPoints(user, points, description, type, extra = {}) {
    const id = `PT-${crypto.randomUUID()}`;
    const ledger = {
      _id: id,
      id,
      userId: user._id,
      userName: user.name || user.phone || 'Customer',
      points,
      balanceAfter: Number(user.points) || 0,
      type,
      description,
      ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v)),
      createdAt: new Date().toISOString(),
    };
    await PointsLedger.create(ledger);
    return ledger;
  }

  // Takes points for an order only if the farmer still has them and they
  // have not expired.
  async spendPoints(userId, points, description, orderId) {
    await connectDB();
    const amount = Math.trunc(Number(points));
    if (!(amount > 0)) return true;
    const now = new Date().toISOString();
    const updated = await User.findOneAndUpdate(
      {
        _id: String(userId),
        role: 'farmer',
        points: { $gte: amount },
        $or: [{ pointsExpireAt: { $exists: false } }, { pointsExpireAt: null }, { pointsExpireAt: { $gt: now } }],
      },
      { $inc: { points: -amount } },
      { returnDocument: 'after', lean: true },
    );
    if (!updated) return false;
    await this.recordPoints(updated, -amount, description, 'spent', { orderId });
    return true;
  }

  async getPointsLedgerForUser(userId, limit = 50) {
    await connectDB();
    const rows = await PointsLedger.find({ userId: String(userId) }).sort({ createdAt: -1 }).limit(limit).lean();
    return rows.map(serialize);
  }

  async getReferralSettings() {
    await connectDB();
    const settings = await Settings.findById('global', { referralSettings: 1 }).lean();
    return settings?.referralSettings || null;
  }

  async saveReferralSettings(referralSettings) {
    await connectDB();
    await Settings.updateOne({ _id: 'global' }, { $set: { referralSettings } }, { upsert: true });
    return referralSettings;
  }

  // Gives a farmer a referral code the first time one is needed. Codes are
  // random, so a clash is rare; it is retried rather than trusted.
  async ensureReferralCode(userId, makeCode) {
    await connectDB();
    for (let attempt = 0; attempt < 5; attempt++) {
      const user = await User.findOne({ _id: String(userId), role: 'farmer' }, { referralCode: 1 }).lean();
      if (!user) return '';
      if (user.referralCode) return user.referralCode;
      const code = makeCode();
      if (await User.exists({ referralCode: code })) continue;
      await User.updateOne({ _id: user._id, referralCode: { $exists: false } }, { $set: { referralCode: code } });
    }
    const user = await User.findById(String(userId), { referralCode: 1 }).lean();
    return user?.referralCode || '';
  }

  async getFarmerByReferralCode(code) {
    if (!code) return null;
    await connectDB();
    const user = await User.findOne({ referralCode: code, role: 'farmer' }).lean();
    return serializeUser(user);
  }

  // One referral per new phone number, ever: the id is derived from the phone
  // (hashed, so it never shows the number), so a second insert for the same
  // number fails instead of creating another reward.
  async createReferral(referral) {
    await connectDB();
    const id = referralIdFor(referral.referredPhone);
    try {
      const doc = { _id: id, id, status: 'Pending', pointsAwarded: 0, welcomeOrderId: null, createdAt: new Date().toISOString(), ...referral };
      await Referral.create(doc);
      return serialize(doc);
    } catch (err) {
      if (err?.code === 11000) return null;
      throw err;
    }
  }

  async getReferralById(id) {
    if (!id) return null;
    await connectDB();
    return serialize(await Referral.findById(String(id)).lean());
  }

  async getReferralForReferred(userId) {
    if (!userId) return null;
    await connectDB();
    return serialize(await Referral.findOne({ referredId: String(userId) }).lean());
  }

  async getReferralsByReferrer(userId) {
    await connectDB();
    const rows = await Referral.find({ referrerId: String(userId) }).sort({ createdAt: -1 }).lean();
    return rows.map(serialize);
  }

  async countRewardedReferrals(referrerId, sinceIso) {
    await connectDB();
    return Referral.countDocuments({ referrerId: String(referrerId), status: 'Completed', completedAt: { $gte: sinceIso } });
  }

  // Moves a referral on only while it still matches `condition`, in one step.
  async updateReferralIf(id, condition, updates) {
    await connectDB();
    const doc = await Referral.findOneAndUpdate(
      { _id: String(id), ...condition },
      { $set: updates },
      { returnDocument: 'after', lean: true },
    );
    return doc ? serialize(doc) : null;
  }

  async getOrdersForUser(userId) {
    await connectDB();
    return (await Order.find({ userId: String(userId) }).lean()).map(serialize);
  }

  // ================= STORES TABLE =================

  async getStores() {
    await connectDB();
    const stores = await Store.find({}).lean();
    const users = await User.find({ storeId: { $exists: true, $ne: '' } }, { storeId: 1, role: 1, status: 1 }).lean();
    return stores.map(store => {
      const storeUsers = users.filter(u => u.storeId === store._id);
      return {
        ...serialize(store),
        staffCount: storeUsers.length,
        adminCount: storeUsers.filter(u => u.role === 'admin').length,
        employeeCount: storeUsers.filter(u => u.role === 'employee').length,
        billingCount: storeUsers.filter(u => u.role === 'billing').length,
        deliveryCount: storeUsers.filter(u => u.role === 'delivery').length,
      };
    });
  }

  async getStoreById(id) {
    if (!id) return null;
    await connectDB();
    const store = await Store.findById(id).lean();
    return serialize(store);
  }

  async createStore(storeData) {
    await connectDB();
    const id = newId('STR');
    const newStore = {
      _id: id,
      id,
      name: storeData.name?.trim() || 'New Store',
      code: storeData.code?.trim().toUpperCase() || id,
      location: storeData.location?.trim() || '',
      address: storeData.address?.trim() || '',
      phone: storeData.phone?.trim() || '',
      email: storeData.email?.trim().toLowerCase() || '',
      adminId: storeData.adminId || null,
      adminName: storeData.adminName || '',
      status: storeData.status || 'active',
      createdAt: new Date().toISOString()
    };
    const created = await Store.create(newStore);
    if (newStore.adminId) {
      await User.findByIdAndUpdate(newStore.adminId, {
        $set: {
          storeId: id,
          storeName: newStore.name,
          storeLocation: newStore.location
        }
      });
    }
    return serialize(created.toObject());
  }

  async updateStore(id, updates) {
    await connectDB();
    const store = await Store.findById(id);
    if (!store) return null;
    const { _id, id: _ignored, ...rest } = updates || {};
    Object.assign(store, rest);
    store.updatedAt = new Date().toISOString();
    await store.save();

    if (rest.adminId) {
      await User.findByIdAndUpdate(rest.adminId, {
        $set: {
          storeId: id,
          storeName: store.name,
          storeLocation: store.location
        }
      });
    }
    return serialize(store.toObject());
  }

  async deleteStore(id) {
    await connectDB();
    const res = await Store.findByIdAndDelete(id);
    return !!res;
  }

  // ================= ACTIVITY LOGS / AUDIT TABLE =================

  async logActivity(data) {
    try {
      await connectDB();
      const logId = newId('LOG');
      const logEntry = {
        _id: logId,
        id: logId,
        timestamp: new Date().toISOString(),
        userId: data.userId || 'system',
        userName: data.userName || 'System',
        userRole: data.userRole || 'system',
        storeId: data.storeId || '',
        storeName: data.storeName || '',
        module: data.module || 'SYSTEM',
        action: data.action || 'ACTION',
        entityId: data.entityId || '',
        description: data.description || '',
        details: data.details || {},
        ip: data.ip || '127.0.0.1'
      };
      await ActivityLog.create(logEntry);
      return serialize(logEntry);
    } catch (e) {
      console.error('Failed to write activity log:', e.message);
      return null;
    }
  }

  async getActivityLogs(filters = {}) {
    await connectDB();
    const query = {};
    if (filters.storeId && filters.storeId !== 'all') {
      query.storeId = filters.storeId;
    }
    if (filters.userId && filters.userId !== 'all') {
      query.userId = filters.userId;
    }
    if (filters.role && filters.role !== 'all') {
      query.userRole = filters.role;
    }
    if (filters.module && filters.module !== 'all') {
      query.module = filters.module;
    }
    if (filters.action && filters.action !== 'all') {
      query.action = filters.action;
    }
    if (filters.search) {
      const needle = filters.search.toLowerCase().trim();
      query.$or = [
        { description: { $regex: needle, $options: 'i' } },
        { userName: { $regex: needle, $options: 'i' } },
        { entityId: { $regex: needle, $options: 'i' } },
        { storeName: { $regex: needle, $options: 'i' } }
      ];
    }
    if (filters.startDate || filters.endDate) {
      query.timestamp = {};
      if (filters.startDate) query.timestamp.$gte = new Date(filters.startDate).toISOString();
      if (filters.endDate) query.timestamp.$lte = new Date(filters.endDate).toISOString();
    }

    const limit = Math.min(Number(filters.limit) || 150, 500);
    const skip = Math.max(0, (Number(filters.page || 1) - 1) * limit);

    const total = await ActivityLog.countDocuments(query);
    const logs = await ActivityLog.find(query)
      .sort({ timestamp: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return {
      total,
      page: Number(filters.page || 1),
      limit,
      logs: logs.map(l => serialize(l))
    };
  }

  // ─── STAFF PROFILE ──────────────────────────────────────────────────────────

  /**
   * Fetch a staff member's profile by their user id.
   * Returns null if the profile has not been filled in yet.
   */
  async getStaffProfile(userId) {
    await connectDB();
    const doc = await StaffProfile.findById(userId).lean();
    return doc ? serialize(doc) : null;
  }

  /**
   * Create or update the personal-information profile for a staff member.
   * Only whitelisted fields are written so employees cannot inject extra data.
   */
  async upsertStaffProfile(userId, data) {
    const ALLOWED = [
      // Personal
      'fullName', 'dateOfBirth', 'gender', 'bloodGroup', 'fatherName', 'motherName',
      'maritalStatus', 'nationality',
      // Contact
      'personalEmail', 'personalPhone', 'alternatePhone',
      // Address
      'currentAddress', 'permanentAddress', 'city', 'state', 'pincode',
      // Emergency contact
      'emergencyName', 'emergencyRelation', 'emergencyPhone',
      // Employment
      'designation', 'department', 'joiningDate', 'employeeCode',
      // KYC / Bank
      'aadharNumber', 'panNumber', 'bankName', 'bankAccountNumber', 'ifscCode',
      'bankBranch', 'upiId',
      // Education
      'qualification', 'institution', 'yearOfPassing',
      // Extra
      'profilePhoto', 'bio', 'skills', 'languages',
    ];
    // Text only, and of a sensible length; the photo is an image (a data URL
    // from the profile page, or an https link) of at most ~1.5 MB.
    const sanitized = {};
    for (const key of ALLOWED) {
      if (!(key in data)) continue;
      const value = data[key] === null || data[key] === undefined ? '' : data[key];
      if (typeof value === 'object') throw inputError('INVALID_STAFF_PROFILE', `${key} must be text.`);
      const text = String(value).trim();
      if (key === 'profilePhoto') {
        if (text && !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(text) && !/^https:\/\//i.test(text)) {
          throw inputError('INVALID_STAFF_PROFILE', 'The profile photo must be an image.');
        }
        if (text.length > 2_000_000) throw inputError('INVALID_STAFF_PROFILE', 'The profile photo is too large (max about 1.5 MB).');
        sanitized[key] = text;
      } else {
        sanitized[key] = text.slice(0, 500);
      }
    }
    sanitized.updatedAt = new Date().toISOString();
    await connectDB();
    const doc = await StaffProfile.findByIdAndUpdate(
      userId,
      { $set: sanitized, $setOnInsert: { _id: userId, createdAt: new Date().toISOString() } },
      { upsert: true, new: true, lean: true }
    );
    return serialize(doc);
  }

  /**
   * List all staff profiles — used by admin / super-admin employee inspector.
   * Joins basic user info (name, role, storeId) from the User collection.
   */
  async listStaffProfiles(filters = {}) {
    await connectDB();
    // Fetch all staff user accounts
    const staffQuery = { role: { $in: ['employee', 'delivery', 'billing', 'admin'] } };
    if (filters.storeId) staffQuery.storeId = filters.storeId;
    const users = await User.find(staffQuery).lean();
    const userIds = users.map(u => u._id);

    // Fetch matching profile docs
    const profiles = await StaffProfile.find({ _id: { $in: userIds } }).lean();
    const profileMap = Object.fromEntries(profiles.map(p => [p._id, serialize(p)]));

    return users.map(u => ({
      ...serializeUser(u),
      profile: profileMap[u._id] || null,
    }));
  }
}


// Blog and video tags arrive as an array or as "a, b, c" from the admin form.
function splitTags(tags, fallback) {
    if (Array.isArray(tags)) return tags.map(tag => String(tag).trim()).filter(Boolean);
    if (typeof tags === 'string') return tags.split(',').map(tag => tag.trim()).filter(Boolean);
    return fallback;
}

// Export singleton database instance
export const db = new DatabaseManager();
export default db;
