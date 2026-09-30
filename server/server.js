/**
 * Sathyam Agro Mart - Express API Server with Persistent MongoDB-backed DB
 * Integrated E-Commerce, User Management, Admin Products Master,
 * ERP & Multi-Role Engine
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import Razorpay from 'razorpay';
import { db, connectDB, newId, STAFF_ROLES } from './db.js';
import { productNameKey } from '../src/shared/productName.js';
import adminRoutes from './adminRoutes.js';
import superadminRoutes from './superadminRoutes.js';
import { buildOtpMessage, buildResetOtpMessage, buildPasswordChangedMessage, forgetOtpLayout, otpBannerUrl } from './otpTemplates.js';
import { sendWhatsAppText, sendWhatsAppImage, whatsAppConfigured } from './whatsapp.js';
import { selectRecipients, renderAdvisory, parseBroadcastRequest, parseOptOutWebhook, broadcastCounts, cropGroupKey, SUBSCRIBER_STATUSES } from '../src/shared/advisoryRules.js';
import { sendOrderConfirmation, sendDeliveryStatusUpdate, sendStaffOrderAlert } from './orderNotifications.js';
import { estimatedDeliveryDate } from './orderMessages.js';
import {
  attachReferral, quoteRewards, claimRewards, bindClaim, releaseClaim, rewardOrderFields,
  returnOrderRewards, retakeOrderRewards, settleReferralForOrder, reverseReferral, referralSummary, loadReferralSettings,
} from './referralService.js';
import { cleanReferralSettings, normalizeReferralCode, maskName, pointsExpiry } from './referrals.js';
import { splitProfileValues, validateProfileValues } from '../src/shared/profileFieldRules.js';
import { hashPassword, verifyPassword, signToken, tokenTtlFor, safeEqual, passwordProblems, weakPasswordMessage } from './security.js';
import { cleanGeo, cleanVisitorPing, cleanVisitorDenied, validVisitorId } from './geo.js';
import {
  HttpError,
  sendError,
  userInputError,
  toSafeUser,
  clientIp,
  rateLimit,
  refundRateLimit,
  peekRateLimit,
  clearRateLimit,
  tooManyRequests,
  getAuthenticatedUser,
  requireAuth,
  requireModule,
} from './http.js';

const app = express();
const PORT = process.env.PORT || 5000;

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

app.disable('x-powered-by');
// Only our own sites (and local dev servers) may call the API from a browser.
// Requests without an Origin header (webhooks, curl, same-origin GETs) pass.
// Extra origins: CORS_ORIGINS=https://a.com,https://b.com in .env.
const ALLOWED_ORIGINS = new Set([
  'https://www.sathyamagromart.com',
  'https://sathyamagromart.com',
  ...[process.env.PUBLIC_SITE_URL, ...(process.env.CORS_ORIGINS || '').split(',')]
    .map((o) => (o || '').trim().replace(/\/+$/, ''))
    .filter(Boolean),
]);
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.has(origin) || LOCAL_ORIGIN.test(origin)),
}));

// Security headers. The API and uploaded files get a locked-down CSP; the SPA
// pages do not, since they load Razorpay, Google Fonts and Font Awesome CDNs.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
    res.setHeader('Content-Security-Policy', "default-src 'none'; media-src 'self'; img-src 'self'; frame-ancestors 'self'");
  }
  next();
});

// The raw bytes are kept for the Razorpay webhook, whose signature covers the
// exact body sent.
const captureRawBody = (req, _res, buf) => { req.rawBody = buf; };
// Admin video uploads arrive as base64 inside JSON, so that ONE route takes a
// large body. Raising the limit globally, as this first did, let any
// unauthenticated caller make the server buffer 200MB per request - the
// cheapest denial of service there is. The admin check runs BEFORE the body
// is read, so an anonymous POST is rejected without buffering anything.
app.post('/api/upload', requireAuth('admin'));
app.use('/api/upload', express.json({ limit: '200mb', verify: captureRawBody }));
app.use(express.json({ limit: '4mb', verify: captureRawBody }));

// Serve uploaded files (videos, images) directly from disk — no MongoDB size limit.
//
// Where that disk is depends on where this runs. On Vercel the bundle is
// READ-ONLY and only /tmp can be written, so creating server/uploads here threw
// at module load and took the whole API down with it - every route answered
// FUNCTION_INVOCATION_FAILED, because the function never finished starting.
// Nothing about serving a catalogue should depend on an uploads folder, so this
// never throws now: if the directory cannot be made, uploads say so and the
// rest of the API carries on.
const UPLOADS_DIR = process.env.UPLOADS_DIR
  || (process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, 'uploads'));
let uploadsDiskReady = false;
try {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  uploadsDiskReady = true;
} catch (err) {
  console.warn(`Uploads directory unavailable (${UPLOADS_DIR}): ${err.message}. File uploads are disabled; everything else is unaffected.`);
}
// Said at module load, not inside app.listen: on a serverless host listen()
// never runs, which is exactly where this warning matters most.
if (!uploadsDiskReady) {
  console.warn(`⚠️  uploads are OFF — ${UPLOADS_DIR} could not be created`);
} else if (process.env.VERCEL) {
  console.warn(`⚠️  uploads go to ${UPLOADS_DIR}, which this host WIPES between cold starts — uploaded files will not survive. Point UPLOADS_DIR at a real disk, or use file URLs.`);
} else {
  console.log(`📁 uploads → ${UPLOADS_DIR}`);
}
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: '1y',
  immutable: true,
  setHeaders: (res, filePath) => {
    if (/\.(mp4|webm|ogg|mov)$/i.test(filePath)) {
      res.setHeader('Accept-Ranges', 'bytes');
    }
  }
}));

app.use('/api/admin', requireAuth('admin'), adminRoutes);
app.use('/api/superadmin', requireAuth('superadmin'), superadminRoutes);

// Older alias of /api/admin/users, with the same admin-only rules.
app.use('/api/users', requireAuth('admin'), (req, res, next) => {
  req.url = `/users${req.url === '/' || req.url.startsWith('/?') ? req.url.slice(1) : req.url}`;
  adminRoutes(req, res, next);
});

// Activity logging utility for audit monitoring
export async function recordActivity(req, { module, action, entityId, description, details = {} }) {
  try {
    const user = req.user || (await getAuthenticatedUser(req));
    await db.logActivity({
      userId: user?.id || 'anonymous',
      userName: user?.name || user?.email || 'Anonymous',
      userRole: user?.role || 'system',
      storeId: user?.storeId || req.body?.storeId || '',
      storeName: user?.storeName || req.body?.storeName || '',
      module,
      action,
      entityId: entityId || '',
      description,
      details,
      ip: clientIp(req)
    });
  } catch (e) {
    console.error('Activity logging failed:', e.message);
  }
}

// ============================================================
// INPUT HELPERS
// ============================================================

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

// ============================================================
// WHATSAPP OTP SYSTEM
// ============================================================

const OTP_EXPIRY_MS = 5 * 60 * 1000;
// The resend wait is randomised per request rather than a fixed 30s. A constant
// interval is a mechanical, bot-like pattern; varying it per user also spreads
// out retry traffic instead of bunching it on the same beat.
// OTP_RATE_LIMITS=off lifts the hourly caps (10 sends an hour per machine, 5
// per number), which is what stops a number being put through the flow more
// than a handful of times while working on it. Two controls stay on either way:
// the 30-60s wait between codes, which is the real guard against rapid-fire
// abuse, and the cap on wrong guesses, without which a 6-digit code could
// simply be guessed.
// Never honoured in production — every OTP is a paid message, and an endpoint
// anyone can call without limit is a bill waiting to happen.
const OTP_LIMITS_OFF = process.env.OTP_RATE_LIMITS === 'off' && process.env.NODE_ENV !== 'production';
if (process.env.OTP_RATE_LIMITS === 'off' && !OTP_LIMITS_OFF) {
  console.warn('⚠️  OTP_RATE_LIMITS=off ignored: the OTP caps always apply in production.');
}

const OTP_RESEND_MIN_MS = 30 * 1000;
const OTP_RESEND_MAX_MS = 60 * 1000;

// Whole seconds, so the client's countdown (which shows whole seconds) ends
// exactly when the server allows the resend.
export function nextResendCooldownMs() {
  return crypto.randomInt(OTP_RESEND_MIN_MS / 1000, OTP_RESEND_MAX_MS / 1000 + 1) * 1000;
}

// Seconds before this OTP record allows another send (0 = now). Only the wait
// the server stored counts; nothing in the request can shorten it. Capped, so
// a record saved under the old 90s limit holds no one longer than 60s.
function resendWaitSeconds(record, now) {
  if (!record?.lastSentAt) return 0;
  const cooldownMs = Math.min(record.resendAfterMs ?? OTP_RESEND_MIN_MS, OTP_RESEND_MAX_MS);
  return Math.max(0, Math.ceil((record.lastSentAt + cooldownMs - now) / 1000));
}

// ============================================================
// TEST NUMBERS
// ============================================================
// Numbers listed in TEST_PHONE_NUMBERS may re-register as often as needed, so
// the sign-up flow can be exercised end to end. Re-registering REPLACES the
// previous account rather than adding a duplicate, which is what caused
// unreachable logins before.
//
// Leave TEST_PHONE_NUMBERS empty in production.

function getTestPhones() {
  return String(process.env.TEST_PHONE_NUMBERS || '')
    .split(',')
    .map((p) => normalizePhone(p.trim()))
    .filter(Boolean);
}

function isTestPhone(phone) {
  return getTestPhones().includes(phone);
}
const OTP_MAX_ATTEMPTS = 5;
// How long a verified number may be used to finish creating the account.
const VERIFIED_PHONE_TTL_MS = 10 * 60 * 1000;

// ============================================================
// OTP STORAGE
// ============================================================
// Pending codes and verified numbers live in MongoDB (see db.kv*), not process
// memory: on Vercel the send and verify requests can land on different
// instances. MongoDB expires the records on its own.

const OTP_RECORD_TTL_MS = OTP_EXPIRY_MS + OTP_RESEND_MAX_MS;
const otpKey = (phone) => `otp:${phone}`;
const verifiedKey = (phone) => `otp-verified:${phone}`;

// ============================================================
// NORMALIZE INDIAN PHONE NUMBER
// ============================================================

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');

  // 10 digit number, e.g. 9876543210
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return digits;
  }

  // 12 digit number, e.g. 919876543210
  if (digits.length === 12 && digits.startsWith('91') && /^91[6-9]\d{9}$/.test(digits)) {
    return digits.slice(2);
  }

  return null;
}

// ============================================================
// GENERATE OTP
// ============================================================

function generateOtp() {
  // Cryptographically secure six-digit OTP.
  return crypto.randomInt(100000, 1000000).toString();
}

// ============================================================
// HASH OTP
// ============================================================

function hashOtp(otp) {
  const secret = process.env.OTP_HASH_SECRET;
  if (!secret) {
    throw new Error('OTP_HASH_SECRET is missing in .env');
  }
  return crypto.createHash('sha256').update(`${otp}:${secret}`).digest('hex');
}

// ============================================================
// SEND OTP THROUGH WASENDER API
// ============================================================

// OTP message text lives in ./otpTemplates.js — it assembles each message
// from interchangeable parts so no two sends look alike. A new number's
// sign-up code is the caption of the Sathyam Agro Mart banner (or plain text
// where there is no public address for the banner); a returning customer's
// sign-in code is plain text, without the banner.

async function sendWhatsAppOtp(phone, otp, userName = 'Farmer', { banner = true } = {}) {
  // A new customer (the banner) is welcomed and asked to save the number; a
  // returning one is welcomed back.
  const text = buildOtpMessage(otp, userName, phone, OTP_EXPIRY_MS, { isNew: banner });
  if (!banner) return sendWhatsAppText(phone, text);
  return sendWhatsAppImage(phone, { imageUrl: otpBannerUrl(), caption: text });
}

// ============================================================
// HEALTH CHECK
// ============================================================

app.get('/api/health', async (req, res) => {
  try {
    await connectDB();
    res.json({ status: 'ok', time: new Date().toISOString() });
  } catch (err) {
    console.error('❌ Health check error:', err.message);
    res.status(503).json({ status: 'error', message: 'Database unavailable' });
  }
});

// ============================================================
// AUTH
// ============================================================

const LOGIN_WINDOW_MS = 15 * MINUTE_MS;
const LOGIN_FAILURE_LIMIT = 5; // wrong passwords per account per window
const LOGIN_ATTEMPT_LIMIT = 30; // sign-in attempts per client IP per window

// One active session per account, on any device or role - a fresh login here
// replaces the session id on the user record, so whichever token was issued
// before this one stops verifying (getAuthenticatedUser in http.js) the next
// time that other device makes a request.
async function issueToken(userId) {
  const record = await db.getUserById(userId, { includePassword: true });
  const sessionId = crypto.randomUUID();
  await db.setUserSessionId(userId, sessionId);
  return signToken(userId, record?.password, sessionId, tokenTtlFor(record?.role));
}

// Checking a password takes a noticeable moment; doing the same work for
// unknown accounts stops response times revealing which numbers are registered.
let dummyPasswordHash;
async function spendPasswordCheck(password) {
  dummyPasswordHash ||= await hashPassword(crypto.randomUUID());
  await verifyPassword(password, dummyPasswordHash);
}

app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body || {};

    // Both must be plain strings. A JSON object here (e.g. {"$ne":null}) is an
    // injection attempt, and would otherwise throw on identifier.trim().
    if (typeof identifier !== 'string' || typeof password !== 'string' || !identifier.trim() || !password) {
      return res.status(401).json({ success: false, message: 'Invalid mobile number/email or password.' });
    }

    const accountKey = identifier.trim().toLowerCase();

    const ipWait = await rateLimit(`login-ip:${clientIp(req)}`, LOGIN_ATTEMPT_LIMIT, LOGIN_WINDOW_MS);
    if (ipWait) {
      return tooManyRequests(res, ipWait, 'Too many sign-in attempts. Please try again later.');
    }

    const lockWait = await peekRateLimit(`login-fail:${accountKey}`, LOGIN_FAILURE_LIMIT, LOGIN_WINDOW_MS);
    if (lockWait) {
      const minutes = Math.ceil(lockWait / 60);
      return tooManyRequests(res, lockWait, `Too many failed sign-in attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
    }

    // Staff only: a number or email may also hold a separate farmer account,
    // so the lookup is scoped to staff roles rather than "whichever is newest".
    const user = await db.getUserByIdentifier(identifier, { includePassword: true, roles: STAFF_ROLES });
    let check = { ok: false, needsRehash: false };
    if (user) check = await verifyPassword(password, user.password);
    else await spendPasswordCheck(password);

    if (!check.ok) {
      await rateLimit(`login-fail:${accountKey}`, LOGIN_FAILURE_LIMIT, LOGIN_WINDOW_MS);
      return res.status(401).json({ success: false, message: 'Invalid mobile number/email or password.' });
    }

    if (user.status && user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'This account has been disabled. Please contact support.' });
    }

    await clearRateLimit(`login-fail:${accountKey}`, LOGIN_WINDOW_MS);

    const updates = { lastLogin: new Date().toISOString() };
    // Accounts from before password hashing are upgraded on their first sign-in.
    // The hash is stored directly so an older password that predates today's
    // rules still upgrades instead of being rejected.
    if (check.needsRehash) updates.password = await hashPassword(password);
    const updated = await db.updateUser(user.id, updates);
    const token = await issueToken(user.id);

    recordActivity(req, {
      module: 'AUTH',
      action: 'USER_LOGIN',
      entityId: user.id,
      description: `User ${user.name} (${user.role}) logged in`
    });

    res.json({ success: true, user: toSafeUser(updated || user), token });
  } catch (err) {
    sendError(res, err, 'Login');
  }
});

// ============================================================
// SEND OTP - POST /api/auth/send-otp
// ============================================================

app.post('/api/auth/send-otp', async (req, res) => {
  // Counts taken from the hourly allowances below, to be given back if no
  // WhatsApp message ends up going out. Declared before anything can throw, so
  // the catch can always call it.
  const spent = [];
  const giveBackAllowance = async () => {
    await Promise.all(spent.map(name => refundRateLimit(name, HOUR_MS)));
  };

  try {
    const phone = normalizePhone(req.body?.phone);

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit Indian mobile number.' });
    }

    // Every OTP is a paid WhatsApp message: cap sends per client and per number.
    // Both counts are taken before the send and given back if no message goes
    // out, so an outage at the provider does not spend a farmer's whole
    // allowance on codes nobody received.
    if (!OTP_LIMITS_OFF) {
      const ipWait = await rateLimit(`otp-ip:${clientIp(req)}`, 10, HOUR_MS);
      if (ipWait) {
        return tooManyRequests(res, ipWait, 'Too many OTP requests. Please try again later.');
      }
      spent.push(`otp-ip:${clientIp(req)}`);
      if (!isTestPhone(phone)) {
        const phoneWait = await rateLimit(`otp-phone:${phone}`, 5, HOUR_MS);
        if (phoneWait) {
          return tooManyRequests(res, phoneWait, 'Too many OTP requests for this number. Please try again later.');
        }
        spent.push(`otp-phone:${phone}`);
      }
    }

    // Sign-in and sign-up share one code: purpose 'auth' does not care whether
    // the number is registered, and must not answer that question either, or
    // anyone with a list of numbers could learn which ones have accounts.
    // Older callers that only ever sign up still get the early 409.
    const authPurpose = req.body?.purpose === 'auth' || req.body?.purpose === 'login';
    if (!authPurpose && !isTestPhone(phone)) {
      // A staff account on this number does not block a separate farmer signup.
      const alreadyRegistered = await db.getUserByIdentifier(phone, { roles: ['farmer'] });
      if (alreadyRegistered) {
        await giveBackAllowance();
        return res.status(409).json({
          success: false,
          message: 'This mobile number is already registered. Please sign in instead.',
          alreadyRegistered: true,
        });
      }
    }

    const now = Date.now();
    const existing = await db.kvGet(otpKey(phone));

    // Resend protection. The wait was decided when the previous code was sent,
    // so each user is held for a different length of time.
    const waitSeconds = resendWaitSeconds(existing, now);
    if (waitSeconds) {
      // The code already on its way still works; nothing new is sent, so this
      // request does not spend an allowance either.
      await giveBackAllowance();
      return res.status(429).json({
        success: false,
        message: `Please wait ${waitSeconds} seconds before requesting another OTP.`,
        retryAfter: waitSeconds,
      });
    }

    const otp = generateOtp();
    console.log(`📱 Sending OTP to +91 ${phone}`);

    // The banner welcomes a new customer only. The HTTP reply is the same either
    // way, so it still does not reveal whether the number is registered.
    const customer = await db.getUserByIdentifier(phone, { roles: ['farmer'] });
    await sendWhatsAppOtp(phone, otp, customer?.name || cleanText(req.body?.name, 60) || 'Farmer', { banner: !customer });

    // Pick this send's cooldown and tell the client, so its countdown matches
    // exactly what the server will enforce.
    const resendAfterMs = nextResendCooldownMs();

    await db.kvSet(otpKey(phone), {
      otpHash: hashOtp(otp),
      expiresAt: now + OTP_EXPIRY_MS,
      // Timed from when the message went out, not when the request came in:
      // the client starts its countdown when this answer arrives.
      lastSentAt: Date.now(),
      resendAfterMs,
      attempts: 0,
    }, OTP_RECORD_TTL_MS);

    // A new code invalidates any verification the previous one earned.
    await db.kvDelete(verifiedKey(phone));

    console.log(`✅ OTP sent to +91 ${phone} (resend allowed in ${Math.round(resendAfterMs / 1000)}s)`);

    return res.json({
      success: true,
      message: 'OTP sent successfully to your WhatsApp number.',
      expiresIn: OTP_EXPIRY_MS / 1000,
      resendAfter: Math.ceil(resendAfterMs / 1000),
    });
  } catch (err) {
    console.error('❌ Send OTP error:', err.message);
    // A number that is not on WhatsApp is the caller's mistake, and the check
    // costs us a lookup, so that one keeps its count: otherwise the endpoint
    // would test numbers for WhatsApp registration as often as anyone liked.
    // Everything else here is our side failing, and no message went out.
    if (err.code === 'NOT_ON_WHATSAPP') {
      return res.status(400).json({
        success: false,
        notOnWhatsApp: true,
        message: 'This number is not on WhatsApp. Please enter the mobile number you use for WhatsApp.',
      });
    }
    await giveBackAllowance();
    if (err.code === 'BUSY' || err.code === 'NO_SENDER') {
      return tooManyRequests(res, 30, 'We are sending a lot of codes right now. Please try again in 30 seconds.');
    }
    return res.status(500).json({ success: false, message: 'Could not send the OTP right now. Please try again shortly.' });
  }
});

// ============================================================
// VERIFY OTP - POST /api/auth/verify-otp
// ============================================================

app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const otp = String(req.body?.otp || '').replace(/\D/g, '');

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Invalid mobile number.' });
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ success: false, message: 'Please enter the 6-digit OTP.' });
    }

    const record = await db.kvGet(otpKey(phone));

    if (!record) {
      return res.status(400).json({ success: false, message: 'OTP expired or not requested. Please request a new OTP.' });
    }

    if (Date.now() > record.expiresAt) {
      await db.kvDelete(otpKey(phone));
      forgetOtpLayout(phone);
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new OTP.' });
    }

    // Counted atomically, so parallel guesses cannot slip past the limit.
    const attempts = await db.kvIncrement(otpKey(phone), 'attempts', OTP_RECORD_TTL_MS, { upsert: false });

    if (attempts === 0) {
      return res.status(400).json({ success: false, message: 'OTP expired or not requested. Please request a new OTP.' });
    }

    if (attempts > OTP_MAX_ATTEMPTS) {
      await db.kvDelete(otpKey(phone));
      return res.status(429).json({ success: false, message: 'Too many incorrect attempts. Please request a new OTP.' });
    }

    if (!safeEqual(hashOtp(otp), record.otpHash)) {
      const remaining = Math.max(0, OTP_MAX_ATTEMPTS - attempts);
      if (remaining === 0) {
        await db.kvDelete(otpKey(phone));
      }
      return res.status(400).json({
        success: false,
        message:
          remaining > 0
            ? `Invalid OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : 'Invalid OTP. Please request a new OTP.',
      });
    }

    // OTP is single-use.
    await db.kvDelete(otpKey(phone));
    forgetOtpLayout(phone);

    console.log(`✅ OTP verified for +91 ${phone}`);

    // A correct code proves the number. For a farmer account we already know
    // that is the whole sign-in — there is nothing left to ask. A number with
    // no farmer account yet still has to tell us who they are and where they
    // farm before one exists, so it is only marked verified here and /register
    // finishes the job within VERIFIED_PHONE_TTL_MS. A staff account on this
    // same number (its own login at /login, with a password) is a separate
    // identity and does not affect this at all.
    const existing = await db.getUserByIdentifier(phone, { roles: ['farmer'] });

    if (existing) {
      if (existing.status && existing.status !== 'active') {
        return res.status(403).json({ success: false, message: 'This account has been disabled. Please contact support.' });
      }
      const updated = await db.updateUser(existing.id, { lastLogin: new Date().toISOString() });
      const token = await issueToken(existing.id);
      return res.json({
        success: true,
        verified: true,
        isNewUser: false,
        user: toSafeUser(updated || existing),
        token,
      });
    }

    // Nobody on this number yet. Mark it verified and let /register collect the
    // details; no account and no session exist until it does.
    await db.kvSet(verifiedKey(phone), { verifiedUntil: Date.now() + VERIFIED_PHONE_TTL_MS }, VERIFIED_PHONE_TTL_MS);

    return res.json({
      success: true,
      verified: true,
      isNewUser: true,
      message: 'Mobile number verified successfully.',
    });
  } catch (err) {
    console.error('❌ Verify OTP error:', err.message);
    return res.status(500).json({ success: false, message: 'Unable to verify OTP.' });
  }
});

// ============================================================
// FORGOT PASSWORD - WhatsApp code to the registered number
// ============================================================
// Reset codes live under their own key, so a sign-up code can never reset a
// password and a reset code can never verify a sign-up. Requesting a code
// answers the same way - same message, same resend wait - whether or not the
// number is registered, so the form cannot be used to find out which numbers
// have accounts. (Nothing is sent to an unregistered number.)

const resetOtpKey = (phone) => `reset-otp:${phone}`;
const RESET_REQUEST_MESSAGE = 'If this number is registered with Sathyam Agro Mart, a 6-digit reset code has been sent to its WhatsApp.';

app.post('/api/auth/forgot-password/send-otp', async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit Indian mobile number.' });
    }

    const ipWait = await rateLimit(`reset-otp-ip:${clientIp(req)}`, 10, HOUR_MS);
    if (ipWait) {
      return tooManyRequests(res, ipWait, 'Too many reset requests. Please try again later.');
    }
    const phoneWait = await rateLimit(`reset-otp-phone:${phone}`, 5, HOUR_MS);
    if (phoneWait) {
      return tooManyRequests(res, phoneWait, 'Too many reset requests for this number. Please try again later.');
    }

    const now = Date.now();
    const existing = await db.kvGet(resetOtpKey(phone));
    const waitSeconds = resendWaitSeconds(existing, now);
    if (waitSeconds) {
      return res.status(429).json({
        success: false,
        message: `Please wait ${waitSeconds} seconds before requesting another code.`,
        retryAfter: waitSeconds,
      });
    }

    const resendAfterMs = nextResendCooldownMs();
    // Farmers have no password to reset — their WhatsApp code IS the sign-in.
    // Scoped to staff roles so a farmer account on the same number (its own,
    // separate identity) cannot be mistaken for the staff account here, and an
    // unknown number is answered exactly the same way either way.
    const user = await db.getUserByIdentifier(phone, { roles: STAFF_ROLES });
    const canReset = Boolean(user) && (!user.status || user.status === 'active');

    let otpHash = null;
    if (canReset) {
      const otp = generateOtp();
      try {
        await sendWhatsAppText(phone, buildResetOtpMessage(otp, user.name, phone, OTP_EXPIRY_MS));
        otpHash = hashOtp(otp);
        console.log(`🔑 Password reset code sent to +91 ${phone}`);
      } catch (sendErr) {
        // Answered like an unknown number, so the form still reveals nothing.
        if (sendErr.code !== 'NOT_ON_WHATSAPP') throw sendErr;
        console.warn(`⚠️ Password reset for +91 ${phone} skipped: number is not on WhatsApp`);
      }
    }

    // An unknown number still gets a record (with no code), so the resend wait
    // and every later answer look exactly like a real account's.
    await db.kvSet(resetOtpKey(phone), {
      otpHash,
      expiresAt: now + OTP_EXPIRY_MS,
      // After the send, as for sign-up codes.
      lastSentAt: Date.now(),
      resendAfterMs,
      attempts: 0,
    }, OTP_RECORD_TTL_MS);

    return res.json({
      success: true,
      message: RESET_REQUEST_MESSAGE,
      expiresIn: OTP_EXPIRY_MS / 1000,
      resendAfter: Math.ceil(resendAfterMs / 1000),
    });
  } catch (err) {
    console.error('❌ Forgot password send error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not send the reset code right now. Please try again shortly.' });
  }
});

app.post('/api/auth/forgot-password/reset', async (req, res) => {
  try {
    const ipWait = await rateLimit(`reset-ip:${clientIp(req)}`, 30, HOUR_MS);
    if (ipWait) {
      return tooManyRequests(res, ipWait, 'Too many attempts. Please try again later.');
    }

    const phone = normalizePhone(req.body?.phone);
    const otp = String(req.body?.otp || '').replace(/\D/g, '');
    const password = req.body?.password;

    if (!phone) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit Indian mobile number.' });
    }
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ success: false, message: 'Please enter the 6-digit code.' });
    }
    if (typeof password !== 'string' || !password) {
      return res.status(400).json({ success: false, message: 'Please enter a new password.' });
    }

    const expired = { success: false, message: 'Code expired or not requested. Please request a new code.' };
    const record = await db.kvGet(resetOtpKey(phone));
    if (!record) {
      return res.status(400).json(expired);
    }
    if (Date.now() > record.expiresAt) {
      await db.kvDelete(resetOtpKey(phone));
      forgetOtpLayout(`reset:${phone}`);
      return res.status(400).json(expired);
    }

    // Counted atomically, so parallel guesses cannot slip past the limit.
    const attempts = await db.kvIncrement(resetOtpKey(phone), 'attempts', OTP_RECORD_TTL_MS, { upsert: false });
    if (attempts === 0) {
      return res.status(400).json(expired);
    }
    if (attempts > OTP_MAX_ATTEMPTS) {
      await db.kvDelete(resetOtpKey(phone));
      return res.status(429).json({ success: false, message: 'Too many incorrect attempts. Please request a new code.' });
    }

    if (!record.otpHash || !safeEqual(hashOtp(otp), record.otpHash)) {
      const remaining = Math.max(0, OTP_MAX_ATTEMPTS - attempts);
      if (remaining === 0) await db.kvDelete(resetOtpKey(phone));
      return res.status(400).json({
        success: false,
        message: remaining > 0
          ? `Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Invalid code. Please request a new code.',
      });
    }

    const user = await db.getUserByIdentifier(phone, { includePassword: true, roles: STAFF_ROLES });
    if (!user || (user.status && user.status !== 'active')) {
      await db.kvDelete(resetOtpKey(phone));
      return res.status(403).json({ success: false, message: 'This account cannot be reset online. Please contact support.' });
    }

    // Rules are checked only after a correct code (they differ for staff), and a
    // weak password leaves the code usable for another try within its attempts.
    const passwordIssues = passwordProblems(password, { role: user.role || 'farmer', phone });
    if (passwordIssues.length) {
      return res.status(400).json({ success: false, message: weakPasswordMessage(passwordIssues), passwordIssues, field: 'password' });
    }
    if ((await verifyPassword(password, user.password)).ok) {
      return res.status(400).json({ success: false, message: 'Please choose a password different from your current one.' });
    }

    // Hashes the password. The new hash changes the token fingerprint, which
    // signs out every session issued before the reset.
    const updated = await db.updateUser(user.id, { password });
    await db.kvDelete(resetOtpKey(phone));
    forgetOtpLayout(`reset:${phone}`);

    // A successful reset lifts any wrong-password lockout.
    await clearRateLimit(`login-fail:${phone}`, LOGIN_WINDOW_MS);
    if (user.email) await clearRateLimit(`login-fail:${String(user.email).toLowerCase()}`, LOGIN_WINDOW_MS);

    try {
      await sendWhatsAppText(phone, buildPasswordChangedMessage(user.name, phone));
    } catch (notifyErr) {
      console.warn('⚠️ Password-changed notice not sent:', notifyErr.message);
    }

    console.log(`🔑 Password reset completed for +91 ${phone}`);
    const token = await issueToken(user.id);
    return res.json({ success: true, message: 'Your password has been reset. You are now signed in.', user: toSafeUser(updated || user), token });
  } catch (err) {
    sendError(res, userInputError(err), 'Password reset');
  }
});

// ============================================================
// REGISTER - FINISHES A VERIFIED NUMBER'S ACCOUNT
// ============================================================

// Reached only after verify-otp has marked the number verified. It asks for
// what the shop actually needs — a name, and whatever the admin's Profile Form
// Builder requires — because a delivery cannot be routed and an advisory cannot
// be targeted without them. Self-registration always creates a farmer account;
// staff accounts can only be created by an admin, so no request body can choose
// its own role, and no body can set a password: farmers do not have one.
app.post('/api/auth/register', async (req, res) => {
  try {
    const ipWait = await rateLimit(`register-ip:${clientIp(req)}`, 20, HOUR_MS);
    if (ipWait) {
      return tooManyRequests(res, ipWait, 'Too many registration attempts. Please try again later.');
    }

    const phone = normalizePhone(req.body?.phone);
    const name = cleanText(req.body?.name, 80);

    if (!name) {
      return res.status(400).json({ success: false, message: 'Please enter your name.' });
    }

    // Everything else a farmer is asked comes from the admin's Profile Form
    // Builder: required answers, types and choices are checked here as well.
    const profileFields = await withCatalogCrops(await db.getProfileFields());
    const { values: answers, errors: fieldErrors } = validateProfileValues(
      profileFields,
      { ...req.body, name },
      { only: profileFields.map(field => field.id).filter(id => id !== 'phone') },
    );
    if (Object.keys(fieldErrors).length) {
      return res.status(400).json({ success: false, message: Object.values(fieldErrors)[0], fieldErrors });
    }
    const { core, profile } = splitProfileValues(answers);

    if (!phone) {
      return res.status(400).json({ success: false, message: 'A valid mobile number is required.' });
    }

    const verified = await db.kvGet(verifiedKey(phone));

    if (!verified || verified.verifiedUntil <= Date.now()) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your mobile number with OTP before creating your account.',
        requiresOtp: true,
      });
    }

    // A staff account on this number is a separate identity and does not block
    // this farmer signup: one farmer account per number, not one account overall.
    const existing = await db.getUserByIdentifier(phone, { roles: ['farmer'] });

    if (isTestPhone(phone)) {
      // Test number: clear every account on it (there may be historical
      // duplicates) so the sign-up flow can be re-run from a clean slate.
      const removed = await db.deleteUsersByPhone(phone);
      if (removed) console.log(`🧪 Test number +91 ${phone}: cleared ${removed} previous account(s)`);
    } else if (existing) {
      // One farmer account per mobile number — otherwise nothing can tell duplicates apart.
      return res.status(409).json({
        success: false,
        message: 'This mobile number is already registered. Please sign in instead.',
        alreadyRegistered: true,
      });
    }

    // Consume verification. Cannot be reused.
    await db.kvDelete(verifiedKey(phone));

    // Farmers never have a password: the verified number is the credential.
    // createUser still stores one, so it gets a random secret nobody — including
    // this process, after this line — ever knows. That keeps the token
    // fingerprint working, so rotating it still ends every session.
    const user = await db.createUser({
      ...core,
      name: core.name || name,
      phone,
      password: crypto.randomBytes(32).toString('base64url'),
      profile,
      role: 'farmer',
      createdBy: 'self-registered',
      lastLogin: new Date().toISOString(),
    });
    const token = await issueToken(user.id);

    console.log(`🌱 New farmer account for +91 ${phone}`);

    // A friend's referral code is optional; a bad one never blocks the signup.
    const referral = await attachReferral(user, req.body?.referralCode).catch((err) => {
      console.error('Referral at signup:', err?.message);
      return null;
    });

    res.json({ success: true, user: toSafeUser(user), token, referral });
  } catch (err) {
    sendError(res, userInputError(err), 'Registration');
  }
});

// ============================================================
// ME
// ============================================================

app.get('/api/auth/me', requireAuth(), (req, res) => {
  res.json({ success: true, data: req.user });
});

// ============================================================
// PROFILE FIELDS
// ============================================================

// "Paddy / Rice" and "Paddy/Rice" are one crop; so are "Grapes" and
// "Grapes / Fruits". Matches how the catalogue itself compares them
// (src/utils/catalogUtils.js, normalizeCrop and matchesCrop).
const cropKey = (value) => String(value || '').trim().toLowerCase().replace(/\s*\/\s*/g, '/');
function sameCrop(a, b) {
  const left = cropKey(a);
  const right = cropKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  // Only the crop itself is compared, never the qualifier after the slash:
  // "Grapes" and "Grapes / Fruits" are one crop, but "Citrus / Fruits" and
  // "Grapes / Fruits" are two, and matching on any shared part would have
  // quietly dropped one of them.
  return left.split('/')[0] === right.split('/')[0];
}

// The crops a farmer can pick are the ones the shop actually sells for. That
// list is the admin's (Settings.catalogOptions.crops) and grows by itself as
// products are saved, so offering it here means sign-up and Edit profile can
// never fall behind the catalogue the way a second hardcoded list does.
// Decorated on the way out only: the saved form keeps whatever the admin chose,
// so turning a product into a new crop never rewrites the form itself.
async function withCatalogCrops(fields) {
  const crop = fields.find(field => field.id === 'crop');
  if (!crop) return fields;

  const { crops } = await db.getCatalogOptions();
  const shopCrops = (crops || []).map(value => String(value).trim()).filter(Boolean);
  if (!shopCrops.length) return fields;

  // The admin's list wins outright rather than being merged with whatever the
  // form was saved with: merging showed "Grapes" beside "Grapes / Fruits" and
  // "Paddy/Rice" beside "Paddy / Rice", which is three ways of asking the same
  // question. Anything a farmer already saved stays choosable — the sheet puts
  // it back at the top of their own dropdown.
  const offered = [];
  for (const value of [...shopCrops, 'All Crops']) {
    if (!offered.some(seen => sameCrop(seen, value))) offered.push(value);
  }
  return fields.map(field => (field.id === 'crop' ? { ...field, options: offered } : field));
}

app.get('/api/profile-fields', async (req, res) => {
  try {
    const data = await withCatalogCrops(await db.getProfileFields());
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err, 'Profile fields');
  }
});

app.put('/api/profile-fields', requireAuth('admin'), requireModule('profile-fields'), async (req, res) => {
  try {
    const fields = await db.saveProfileFields((req.body && req.body.fields) || []);
    res.json({ success: true, data: await withCatalogCrops(fields) });
  } catch (err) {
    sendError(res, err, 'Save profile fields');
  }
});

// ============================================================
// PROFILE
// ============================================================

app.get('/api/profile', requireAuth(), async (req, res) => {
  try {
    const fields = await db.getProfileFields();
    res.json({ success: true, data: { ...req.user, fields } });
  } catch (err) {
    sendError(res, err, 'Profile');
  }
});

app.put('/api/profile', requireAuth(), async (req, res) => {
  try {
    const updated = await db.updateUserProfile(req.user.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: toSafeUser(updated) });
  } catch (err) {
    sendError(res, userInputError(err), 'Update profile');
  }
});

// ============================================================
// PRODUCTS CRUD
// ============================================================

const PRODUCT_NAME_LOCK_MS = 15 * 1000;
const duplicateProductReply = same => ({
  success: false,
  code: 'DUPLICATE_PRODUCT',
  message: `"${same.name}" is already in the catalogue. Edit that product instead of adding it again.`,
  duplicateOf: { id: same.id, name: same.name },
});

function productInputError(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object') return 'Product details are required.';
  if (!partial || body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) return 'Product name is required.';
  }
  for (const [field, label] of [['price', 'Price'], ['stock', 'Stock']]) {
    if (!partial || body[field] !== undefined) {
      const value = Number(body[field]);
      if (!Number.isFinite(value) || value < 0) return `${label} must be a number of 0 or more.`;
    }
  }
  return null;
}

app.get('/api/products', async (req, res) => {
  try {
    const { userId, category, crop, disease, search, sortBy, onlineOnly } = req.query;
    const data = await db.getProducts({ userId, category, crop, disease, search, sortBy, onlineOnly: onlineOnly === 'true' });
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err, 'Products');
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await db.getProductById(req.params.id);
    // Offline products are sold at the billing counter only, never on the website.
    if (!product || product.online === false) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, data: product });
  } catch (err) {
    sendError(res, err, 'Product');
  }
});

app.post('/api/products', requireAuth('admin'), requireModule('products'), async (req, res) => {
  try {
    const problem = productInputError(req.body);
    if (problem) return res.status(400).json({ success: false, message: problem });

    const { id, _id, ...details } = req.body;
    // One product per name: the store lists every product to everyone, so a
    // second one with the same name would show twice.
    const same = await db.findSameNamedProduct(details.name);
    if (same) return res.status(409).json(duplicateProductReply(same));
    // Two publishes of one name at the same moment (a double click, two admins)
    // would both pass the check above; only the first claim goes ahead.
    const lock = `product-name:${productNameKey(details.name)}`;
    if (await db.kvClaimSlot(lock, PRODUCT_NAME_LOCK_MS) !== 0) {
      return res.status(409).json({ success: false, code: 'PRODUCT_BEING_PUBLISHED', message: 'This product is already being published. Refresh the list in a moment.' });
    }
    try {
      const product = await db.createProduct(details);
      res.json({ success: true, data: product });
    } catch (err) {
      await db.kvDelete(lock).catch(() => {});
      throw err;
    }
  } catch (err) {
    sendError(res, err, 'Create product');
  }
});

app.put('/api/products/:id', requireAuth('admin'), requireModule('products'), async (req, res) => {
  try {
    const problem = productInputError(req.body, { partial: true });
    if (problem) return res.status(400).json({ success: false, message: problem });

    const { id, _id, ...updates } = req.body;
    if (updates.name !== undefined) {
      // Only a changed name has to be free: a product that already shares its
      // name with an older copy can still be edited (price, stock...).
      const current = await db.getProductById(req.params.id);
      if (current && productNameKey(current.name) !== productNameKey(updates.name)) {
        const same = await db.findSameNamedProduct(updates.name, req.params.id);
        if (same) return res.status(409).json(duplicateProductReply(same));
      }
    }
    const product = await db.updateProduct(req.params.id, updates);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    recordActivity(req, {
      module: 'PRODUCTS',
      action: 'UPDATE_PRODUCT',
      entityId: req.params.id,
      description: `Updated product "${product.name}"`,
      details: { changedKeys: Object.keys(updates) }
    });
    res.json({ success: true, data: product });
  } catch (err) {
    sendError(res, err, 'Update product');
  }
});

app.delete('/api/products/:id', requireAuth('admin'), requireModule('products'), async (req, res) => {
  try {
    const ok = await db.deleteProduct(req.params.id);
    if (!ok) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    recordActivity(req, {
      module: 'PRODUCTS',
      action: 'DELETE_PRODUCT',
      entityId: req.params.id,
      description: `Deleted product ${req.params.id}`
    });
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (err) {
    sendError(res, err, 'Delete product');
  }
});

app.get('/api/catalog-options', async (req, res) => {
  try {
    const data = await db.getCatalogOptions();
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err, 'Catalog options');
  }
});

// Adds to the shared registry (categories/crops/pack sizes/diseases/physical
// forms) immediately, rather than only as a side effect of saving a product
// that happens to use the new value - so a value picked in the admin form's
// "Add a custom ..." box is there to reuse right away, on any admin session.
const cleanOptionList = value => (Array.isArray(value) ? value : [])
  .map(v => String(v || '').trim().slice(0, 40))
  .filter(Boolean)
  .slice(0, 20);

app.post('/api/catalog-options', requireAuth('admin'), requireModule('products'), async (req, res) => {
  try {
    const data = await db.registerCatalogOptions({
      categories: cleanOptionList(req.body?.categories),
      crops: cleanOptionList(req.body?.crops),
      storageBatches: cleanOptionList(req.body?.storageBatches),
      diseases: cleanOptionList(req.body?.diseases),
      physicalForms: cleanOptionList(req.body?.physicalForms),
    });
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err, 'Catalog options');
  }
});

// Removes a mistaken value (e.g. a "test" crop) from the registry. Refused
// while any product still uses it, so no product loses its label.
const CATALOG_OPTION_FIELDS = {
  categories: (p) => [p.category],
  crops: (p) => p.crops,
  storageBatches: (p) => p.packSizes,
  diseases: (p) => p.diseases,
  physicalForms: (p) => [p.form, p.physicalForm],
};

app.delete('/api/catalog-options', requireAuth('admin'), requireModule('products'), async (req, res) => {
  try {
    const kind = String(req.body?.kind || '');
    const value = String(req.body?.value || '');
    if (!CATALOG_OPTION_FIELDS[kind] || !value) {
      return res.status(400).json({ success: false, message: 'Say which list and which value to remove.' });
    }
    const usedBy = (await db.getProducts({})).filter((p) =>
      (CATALOG_OPTION_FIELDS[kind](p) || []).some((v) => String(v || '').trim() === value));
    if (usedBy.length) {
      return res.status(409).json({ success: false, message: `Still used by ${usedBy.length} product(s): ${usedBy.slice(0, 3).map((p) => p.name).join(', ')}` });
    }
    const data = await db.removeCatalogOption(kind, value);
    if (!data) return res.status(404).json({ success: false, message: 'That value is not in the list.' });
    recordActivity(req, { module: 'PRODUCTS', action: 'REMOVE_CATALOG_OPTION', entityId: kind, description: `Removed ${kind} option "${value}"` });
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err, 'Catalog options');
  }
});

app.get('/api/user-product-summary', requireAuth('admin'), requireModule(['products', 'users', 'overview', 'analytics']), async (req, res) => {
  try {
    const data = await db.getUserProductSummary();
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err, 'User product summary');
  }
});

// ============================================================
// BLOGS
// ============================================================

// Drafts are for admins only: everyone else gets published posts.
async function viewerIsAdmin(req) {
  const user = await getAuthenticatedUser(req);
  return user?.role === 'admin';
}

app.get('/api/blogs', async (req, res) => {
  try {
    const { category, tag, search, publishedOnly } = req.query;
    const onlyPublished = publishedOnly === 'true' || !(await viewerIsAdmin(req));
    const data = await db.getBlogs({ category, tag, search, publishedOnly: onlyPublished });
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err, 'Blogs');
  }
});

app.get('/api/blogs/:id', async (req, res) => {
  try {
    const blog = await db.getBlogById(req.params.id);
    if (!blog || (blog.published === false && !(await viewerIsAdmin(req)))) {
      return res.status(404).json({ success: false, message: 'Blog post not found' });
    }
    res.json({ success: true, data: blog });
  } catch (err) {
    sendError(res, err, 'Blog');
  }
});

app.post('/api/blogs', requireAuth('admin'), requireModule('blogs'), async (req, res) => {
  try {
    if (typeof req.body?.title !== 'string' || !req.body.title.trim()) {
      return res.status(400).json({ success: false, message: 'Blog title is required' });
    }
    const blog = await db.createBlog(req.body);
    res.json({ success: true, data: blog, message: 'Blog post published successfully!' });
  } catch (err) {
    sendError(res, err, 'Create blog');
  }
});

app.put('/api/blogs/:id', requireAuth('admin'), requireModule('blogs'), async (req, res) => {
  try {
    const updated = await db.updateBlog(req.params.id, req.body || {});
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Blog post not found' });
    }
    res.json({ success: true, data: updated, message: 'Blog post updated successfully!' });
  } catch (err) {
    sendError(res, err, 'Update blog');
  }
});

app.delete('/api/blogs/:id', requireAuth('admin'), requireModule('blogs'), async (req, res) => {
  try {
    const ok = await db.deleteBlog(req.params.id);
    if (!ok) {
      return res.status(404).json({ success: false, message: 'Blog post not found' });
    }
    res.json({ success: true, message: 'Blog post deleted successfully' });
  } catch (err) {
    sendError(res, err, 'Delete blog');
  }
});

// ============================================================
// VIDEOS
// ============================================================

app.get('/api/videos', async (req, res) => {
  try {
    const { category, search } = req.query;
    const data = await db.getVideos({ category, search });
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err, 'Videos');
  }
});

app.get('/api/videos/:id', async (req, res) => {
  try {
    const video = await db.getVideoById(req.params.id);
    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }
    res.json({ success: true, data: video });
  } catch (err) {
    sendError(res, err, 'Video');
  }
});

app.post('/api/videos', requireAuth('admin'), requireModule('videos'), async (req, res) => {
  try {
    if (typeof req.body?.title !== 'string' || !req.body.title.trim()) {
      return res.status(400).json({ success: false, message: 'Video title is required' });
    }
    const videoUrl = req.body?.videoUrl || req.body?.url || req.body?.fileUrl;
    if (typeof videoUrl !== 'string' || !videoUrl.trim()) {
      return res.status(400).json({ success: false, message: 'Video URL, link, or uploaded file is required' });
    }
    const payload = {
      ...req.body,
      videoUrl: videoUrl.trim(),
      url: videoUrl.trim()
    };
    const video = await db.createVideo(payload);
    res.json({ success: true, data: video, message: 'Video added successfully!' });
  } catch (err) {
    sendError(res, err, 'Create video');
  }
});

app.put('/api/videos/:id', requireAuth('admin'), requireModule('videos'), async (req, res) => {
  try {
    const videoUrl = req.body?.videoUrl || req.body?.url || req.body?.fileUrl;
    const payload = {
      ...req.body,
      ...(videoUrl ? { videoUrl: videoUrl.trim(), url: videoUrl.trim() } : {})
    };
    const updated = await db.updateVideo(req.params.id, payload);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }
    res.json({ success: true, data: updated, message: 'Video updated successfully!' });
  } catch (err) {
    sendError(res, err, 'Update video');
  }
});

app.delete('/api/videos/:id', requireAuth('admin'), requireModule('videos'), async (req, res) => {
  try {
    const ok = await db.deleteVideo(req.params.id);
    if (!ok) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }
    res.json({ success: true, message: 'Video deleted successfully' });
  } catch (err) {
    sendError(res, err, 'Delete video');
  }
});

// ============================================================
// CART (per authenticated user)
// ============================================================

// The cart always belongs to the caller's own account — the user id is taken
// from the token, never from the request body.
app.get('/api/cart', async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Please sign in to view your cart.' });
    }
    const items = await db.getCart(user.id);
    return res.json({ success: true, data: items });
  } catch (err) {
    console.error('❌ Get cart error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not load your cart.' });
  }
});

app.put('/api/cart', async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Please sign in to update your cart.' });
    }
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 100) : [];
    const saved = await db.saveCart(user.id, items);
    return res.json({ success: true, data: saved });
  } catch (err) {
    console.error('❌ Save cart error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not save your cart.' });
  }
});

// ============================================================
// CHECKOUT PRICING
// ============================================================
// Orders are always priced here from the product records. The browser only
// says which products, which pack size and how many; any price, total or
// discount it sends is ignored.

const GST_RATE = 0.18;
const MAX_CART_LINES = 50;
const MAX_LINE_QTY = 999;

function packUnits(pack) {
  const match = String(pack || '').toLowerCase().match(/([\d.]+)\s*(kg|g|litre|liter|l|ml)/);
  if (!match) return 1;
  const value = Number(match[1]);
  return ['kg', 'litre', 'liter', 'l'].includes(match[2]) ? value * 1000 : value;
}

// Mirrors packPrice() in src/shared/packPricing.js (used by every store page),
// so the server charges exactly the price the store showed. Its test,
// src/shared/__tests__/packPricing.test.js, holds cases from this function.
function unitPriceFor(product, pack) {
  const explicit = product.packagePrices?.[pack] || product.packPrices?.[pack];
  if (explicit !== undefined) return Number(explicit);
  const basePack = product.selectedPack || product.packSizes?.[0];
  if (!basePack || !pack) return Number(product.price || 0);
  return Math.round(Number(product.price || 0) * (packUnits(pack) / packUnits(basePack)));
}

async function priceCart(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new HttpError(400, 'Your cart is empty.');
  }
  if (rawItems.length > MAX_CART_LINES) {
    throw new HttpError(400, 'Too many different items in one order.');
  }

  const requested = rawItems.map((raw) => ({
    id: String(raw?.id || raw?._id || ''),
    qty: Number(raw?.qty ?? 1),
    pack: typeof raw?.selectedPack === 'string' ? raw.selectedPack : '',
  }));

  if (requested.some((r) => !r.id || !Number.isInteger(r.qty) || r.qty < 1 || r.qty > MAX_LINE_QTY)) {
    throw new HttpError(400, 'Your cart has an invalid item. Please refresh the page and try again.');
  }

  const products = new Map((await db.getProductsByIds(requested.map((r) => r.id))).map((p) => [p.id, p]));
  const lines = [];
  const unitsByProduct = new Map();

  for (const r of requested) {
    const product = products.get(r.id);
    // Offline products are sold at the billing counter only; one may still sit
    // in a cart from before an admin took it off the website.
    if (!product || product.online === false || product.visibility === 'offline') {
      throw new HttpError(409, 'A product in your cart is no longer available. Please remove it and try again.');
    }
    const packSizes = Array.isArray(product.packSizes) ? product.packSizes : [];
    const pack = packSizes.includes(r.pack) ? r.pack : (product.selectedPack || packSizes[0] || '');
    const price = unitPriceFor(product, pack);
    if (!(price > 0)) {
      throw new HttpError(409, `${product.name} cannot be ordered right now.`);
    }

    const rate = Number(product.gstRate);
    const gstRate = product.gstRate !== undefined && product.gstRate !== null && product.gstRate !== '' && Number.isFinite(rate) ? rate : GST_RATE * 100;
    lines.push({ id: product.id, name: product.name, image: product.image || '', packSize: pack, selectedPack: pack, qty: r.qty, price, gstRate });
    unitsByProduct.set(product.id, (unitsByProduct.get(product.id) || 0) + r.qty);
  }

  for (const [id, qty] of unitsByProduct) {
    const product = products.get(id);
    const available = Math.max(0, Number(product.stock) || 0);
    if (available < qty) {
      throw new HttpError(409, available
        ? `Only ${available} left of ${product.name}. Please reduce the quantity.`
        : `${product.name} is out of stock. Please remove it from your cart.`);
    }
  }

  const subtotal = Math.round(lines.reduce((sum, line) => sum + line.price * line.qty, 0) * 100) / 100;
  // Each product's own GST rate (18% when unset), rounded once over the
  // basket - the same sum checkoutRules.js cartTotals shows the customer.
  const gst = Math.round(lines.reduce((sum, line) => sum + line.price * line.qty * line.gstRate / 100, 0));

  return {
    lines,
    stockLines: [...unitsByProduct].map(([id, qty]) => ({ id, qty })),
    subtotal,
    gst,
    total: subtotal + gst,
  };
}

// Checkout sends the delivery address field by field; `address` is the
// single line kept on the order for messages and older screens.
function readCustomerDetails(source) {
  const customerName = cleanText(source?.customerName, 80);
  const customerPhone = normalizePhone(source?.customerPhone);
  const addressDetails = {
    label: cleanText(source?.addressLabel, 30) || 'Home',
    // Who receives at this address; older clients send none, so the contact's.
    name: cleanText(source?.addressName, 80) || customerName,
    phone: normalizePhone(source?.addressPhone) || customerPhone,
    doorNo: cleanText(source?.doorNo, 40),
    street: cleanText(source?.street, 120),
    area: cleanText(source?.area, 100),
    taluk: cleanText(source?.taluk, 80),
    pincode: String(source?.pincode || '').replace(/\D/g, '').slice(0, 6),
    district: cleanText(source?.district, 80),
    state: cleanText(source?.state, 80),
  };
  // Optional: the GPS point from "Use my current location" (geo.js).
  const geo = cleanGeo(source?.geo);
  if (geo) addressDetails.geo = geo;
  const address = [addressDetails.doorNo, addressDetails.street, addressDetails.area, addressDetails.taluk, addressDetails.district, addressDetails.state, addressDetails.pincode].filter(Boolean).join(', ');
  if (!customerName || !customerPhone || !addressDetails.doorNo || !addressDetails.street || !addressDetails.area || !addressDetails.taluk || !/^\d{6}$/.test(addressDetails.pincode) || !addressDetails.district || !addressDetails.state) {
    throw new HttpError(400, 'Please complete your name, mobile number, and every delivery address field.');
  }
  return { customerName, customerPhone, address, addressDetails };
}

// ============================================================
// SAVED DELIVERY ADDRESSES (the signed-in user's own)
// ============================================================

app.get('/api/addresses', requireAuth(), async (req, res) => {
  try {
    res.json({ success: true, data: await db.getAddresses(req.user.id) });
  } catch (err) {
    sendError(res, err, 'Addresses');
  }
});

app.post('/api/addresses', requireAuth(), async (req, res) => {
  try {
    res.json({ success: true, data: await db.saveAddress(req.user.id, req.body || {}) });
  } catch (err) {
    sendError(res, userInputError(err), 'Save address');
  }
});

app.delete('/api/addresses/:id', requireAuth(), async (req, res) => {
  try {
    res.json({ success: true, deleted: await db.deleteAddress(req.user.id, req.params.id) });
  } catch (err) {
    sendError(res, err, 'Delete address');
  }
});

// ============================================================
// RAZORPAY PAYMENTS
// ============================================================

const CHECKOUT_TTL_MS = 3 * 24 * HOUR_MS;
const checkoutKey = (razorpayOrderId) => `checkout:${razorpayOrderId}`;

function getRazorpayInstance() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error('Razorpay keys are missing. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env');
  }

  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

// CREATE RAZORPAY ORDER - POST /api/payments/create-order
// The server prices the cart and remembers exactly what is being paid for, so
// the order recorded after payment cannot differ from what was charged.
// Checkout requires a signed-in customer; the order is linked to the token's user.
app.post('/api/payments/create-order', requireAuth(), async (req, res) => {
  try {
    const wait = await rateLimit(`checkout-ip:${clientIp(req)}`, 30, HOUR_MS);
    if (wait) return tooManyRequests(res, wait, 'Too many checkout attempts. Please try again later.');

    const user = req.user;
    const customer = readCustomerDetails(req.body?.customer);
    const priced = await priceCart(req.body?.items);
    const quote = await quoteRewards(user, priced, req.body?.usePoints === true);
    const amountPaise = Math.round(quote.rewards.payable * 100);

    const razorpay = getRazorpayInstance();
    const razorpayOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: newId('rcpt'),
    });

    await db.kvSet(checkoutKey(razorpayOrder.id), {
      status: 'pending',
      userId: user?.id || null,
      ...customer,
      ...priced,
      amountPaise,
      // Taken for real only once the payment succeeds (finalizePaidOrder).
      rewardQuote: { rewards: quote.rewards, referral: quote.referral ? { id: quote.referral.id } : null },
    }, CHECKOUT_TTL_MS);

    return res.json({
      success: true,
      data: {
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        subtotal: priced.subtotal,
        gst: priced.gst,
        total: quote.rewards.payable,
        itemsTotal: priced.total,
        welcomeDiscount: quote.rewards.welcomeDiscount,
        pointsUsed: quote.rewards.pointsUsed,
        keyId: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (err) {
    sendError(res, err, 'Create Razorpay order');
  }
});

// Turns a paid Razorpay order into exactly one store order. The browser
// callback and the webhook both call this; whichever arrives second, or any
// replay, gets the existing order back instead of creating a duplicate.
async function finalizePaidOrder(razorpayOrderId, paymentId) {
  const existing = await db.getOrderByRazorpayId(razorpayOrderId);
  if (existing) return existing;

  const key = checkoutKey(razorpayOrderId);
  const session = await db.kvTransition(key, 'pending', 'processing');
  if (!session) {
    const finished = await db.getOrderByRazorpayId(razorpayOrderId);
    if (finished) return finished;
    throw new HttpError(409, 'This payment is already being processed or its checkout has expired. Please check Order Status.');
  }

  let reserved = null;
  let claim = null;
  // Sessions from before Refer & Earn carry no quote.
  const quote = session.rewardQuote || { rewards: { discount: 0, welcomeDiscount: 0, pointsUsed: 0 }, referral: null };
  const payer = { id: session.userId };
  try {
    reserved = await db.reserveStock(session.stockLines);
    // Already paid, so the order stands even if the points or offer were used
    // up meanwhile; the flag lets an admin follow up, like stockShortfall.
    if (session.userId) claim = await claimRewards(payer, quote, { strict: false });
    const order = await db.createOrder({
      userId: session.userId || undefined,
      customerName: session.customerName,
      customerPhone: session.customerPhone,
      address: session.address,
      addressDetails: session.addressDetails,
      items: session.lines,
      subtotal: session.subtotal,
      gst: session.gst,
      total: session.total,
      ...rewardOrderFields(quote, !!claim?.shortfall),
      expectedDeliveryDate: estimatedDeliveryDate(),
      paymentMethod: 'Razorpay (UPI)',
      paymentStatus: 'Paid',
      paymentId,
      razorpayOrderId,
      // The customer has already paid, so the order stands even if stock ran
      // out meanwhile; the flag lets an admin follow up.
      stockShortfall: !reserved.ok,
    });

    if (claim?.token) await bindClaim(quote, claim.token, order.id);
    if (session.userId) await db.saveCart(session.userId, []);
    await db.kvTransition(key, 'processing', 'paid', { orderId: order.id });

    console.log(`✅ Payment ${paymentId} recorded as order ${order.id}`);
    return order;
  } catch (err) {
    if (reserved?.ok) await db.releaseStock(session.stockLines).catch(() => {});
    if (claim) await releaseClaim(payer, quote, claim).catch(() => {});
    await db.kvTransition(key, 'processing', 'pending').catch(() => {});

    // Lost a race with a concurrent request for the same payment.
    if (err?.code === 11000) {
      const winner = await db.getOrderByRazorpayId(razorpayOrderId);
      if (winner) return winner;
    }
    throw err;
  }
}

// VERIFY RAZORPAY PAYMENT - POST /api/payments/verify
// Verifies the HMAC signature Razorpay returns after checkout, then records the order.
app.post('/api/payments/verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

    if (![razorpay_order_id, razorpay_payment_id, razorpay_signature].every((v) => typeof v === 'string' && v)) {
      return res.status(400).json({ success: false, message: 'Missing payment verification fields.' });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      throw new Error('Razorpay key secret is missing. Add RAZORPAY_KEY_SECRET to .env');
    }

    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (!safeEqual(expectedSignature, razorpay_signature)) {
      return res.status(400).json({ success: false, message: 'Payment verification failed. Signature mismatch.' });
    }

    const order = await finalizePaidOrder(razorpay_order_id, razorpay_payment_id);
    // Sent at most once per order, whether this callback or the webhook gets there first.
    const whatsapp = await sendOrderConfirmation(order);
    await sendStaffOrderAlert(order).catch(() => {});
    return res.json({ success: true, data: order, whatsapp });
  } catch (err) {
    sendError(res, err, 'Verify payment');
  }
});

// RAZORPAY WEBHOOK - POST /api/payments/webhook
// Records paid orders even when the customer closes the browser before the
// checkout callback runs. Configure in the Razorpay dashboard for the
// payment.captured and order.paid events, using RAZORPAY_WEBHOOK_SECRET.
app.post('/api/payments/webhook', async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(503).json({ success: false, message: 'Webhook is not configured.' });
  }

  const signature = String(req.headers['x-razorpay-signature'] || '');
  const body = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  if (!signature || !safeEqual(expected, signature)) {
    return res.status(400).json({ success: false, message: 'Invalid webhook signature.' });
  }

  const event = req.body?.event;
  const payment = req.body?.payload?.payment?.entity;

  try {
    if ((event === 'payment.captured' || event === 'order.paid') && payment?.order_id && payment?.id) {
      const order = await finalizePaidOrder(payment.order_id, payment.id);
      // Covers customers who closed the tab before the checkout callback ran,
      // and retries a confirmation that failed to send from that callback.
      await sendOrderConfirmation(order);
      await sendStaffOrderAlert(order).catch(() => {});
    }
    return res.json({ success: true });
  } catch (err) {
    if (err instanceof HttpError) {
      // Not a checkout this server started (or already expired): acknowledge so
      // Razorpay stops retrying, but leave a trail.
      console.warn(`⚠️ Webhook for ${payment?.order_id}: ${err.message}`);
      return res.json({ success: true });
    }
    // Anything else is worth a retry from Razorpay.
    return sendError(res, err, 'Razorpay webhook');
  }
});

// ============================================================
// ORDERS
// ============================================================

// Employees see every order for the operations dashboard (delivery OTPs are still stripped).
const ORDER_STAFF_ROLES = ['admin', 'billing', 'employee'];

// The delivery OTP proves the customer received the parcel, so only the
// customer who placed the order may see it.
function withoutDeliveryOtp(order) {
  const { otp, ...rest } = order;
  return rest;
}

// A cash-on-delivery order is paid once it is delivered: the agent collected
// the cash. Revenue on the admin dashboard counts paid orders only.
function cashCollected(order) {
  return order.paymentStatus !== 'Paid' && /cash on delivery|^cod$/i.test(String(order.paymentMethod || ''))
    ? { paymentStatus: 'Paid', paidAt: new Date().toISOString() }
    : {};
}

// The stock an order holds, one line per product (as reserveStock takes it).
function orderStockLines(order) {
  const byId = new Map();
  for (const item of Array.isArray(order.items) ? order.items : []) {
    const id = String(item?.id || '');
    const qty = Number(item?.qty);
    if (id && Number.isInteger(qty) && qty > 0) byId.set(id, (byId.get(id) || 0) + qty);
  }
  return [...byId].map(([id, qty]) => ({ id, qty }));
}

function isAssignedTo(order, user) {
  return user.role === 'admin' || order.assignedDeliveryBoy === user.name || order.assignedDeliveryBoy === 'Unassigned';
}

app.get('/api/orders', requireAuth(), requireModule('orders'), async (req, res) => {
  try {
    const user = req.user;

    if (ORDER_STAFF_ROLES.includes(user.role)) {
      const { phone, userId } = req.query;
      const all = await db.getOrders();
      const data = all
        .filter((order) => (!phone && !userId) || (phone && order.customerPhone === phone) || (userId && order.userId === userId))
        .map(withoutDeliveryOtp);
      return res.json({ success: true, count: data.length, data });
    }

    // Everyone else sees only their own orders, whatever the query string says.
    const data = await db.getOrdersForCustomer(user);
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    sendError(res, err, 'Orders');
  }
});

// Cash on delivery. Only signed-in customers may order; the order is linked to
// the account from the token, never from the request body.
app.post('/api/orders', requireAuth(), async (req, res) => {
  try {
    const wait = await rateLimit(`order-ip:${clientIp(req)}`, 20, HOUR_MS);
    if (wait) return tooManyRequests(res, wait, 'Too many orders from this connection. Please try again later.');

    const user = req.user;
    const customer = readCustomerDetails(req.body);
    const priced = await priceCart(req.body?.items);
    const quote = await quoteRewards(user, priced, req.body?.usePoints === true);

    const reserved = await db.reserveStock(priced.stockLines);
    if (!reserved.ok) {
      throw new HttpError(409, 'Some items in your cart just went out of stock. Please review your cart.');
    }

    const claim = await claimRewards(user, quote, { strict: true });
    if (!claim.ok) {
      await db.releaseStock(priced.stockLines).catch(() => {});
      throw new HttpError(409, 'Your points or welcome offer just changed. Please review your order and try again.');
    }

    let order;
    try {
      order = await db.createOrder({
        userId: user?.id,
        ...customer,
        items: priced.lines,
        subtotal: priced.subtotal,
        gst: priced.gst,
        total: priced.total,
        ...rewardOrderFields(quote),
        expectedDeliveryDate: estimatedDeliveryDate(),
        paymentMethod: 'Cash on Delivery',
        paymentStatus: 'Pending',
      });
    } catch (err) {
      await db.releaseStock(priced.stockLines).catch(() => {});
      await releaseClaim(user, quote, claim).catch(() => {});
      throw err;
    }
    await bindClaim(quote, claim.token, order.id);

    if (user) await db.saveCart(user.id, []);
    const whatsapp = await sendOrderConfirmation(order);
    await sendStaffOrderAlert(order).catch(() => {});
    res.json({ success: true, data: order, whatsapp });
  } catch (err) {
    sendError(res, err, 'Create order');
  }
});

app.put('/api/orders/:id', requireAuth('admin'), requireModule('orders'), async (req, res) => {
  try {
    // Status goes through /status (stock, delivery OTP, rewards) and money
    // fields are set by the server when the order is placed, never here.
    const {
      id, _id, otp, status, deliveryStatus, userId,
      subtotal, gst, total, itemsTotal, discount, welcomeDiscount, pointsUsed, referralId, rewardShortfall,
      ...updates
    } = req.body || {};
    const order = await db.updateOrder(req.params.id, updates);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.json({ success: true, data: withoutDeliveryOtp(order) });
  } catch (err) {
    sendError(res, err, 'Update order');
  }
});

// ============================================================
// WISHLIST
// ============================================================

// Signed-in customers own their wishlist through their account. Guests use the
// random visitor id their browser generated; it is never a guessable phone or user id.
function wishlistOwner(user, visitorId) {
  if (user) return user.id;
  const id = String(visitorId || '');
  return /^visitor-[A-Za-z0-9-]{16,80}$/.test(id) ? id : '';
}

app.get('/api/wishlist', async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    const owner = wishlistOwner(user, req.query.visitorId);
    if (!owner) {
      return res.status(400).json({ success: false, message: 'Sign in to see your wishlist.' });
    }
    const data = await db.getWishlistForOwner(owner);
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    sendError(res, err, 'Wishlist');
  }
});

app.post('/api/wishlist', async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    const owner = wishlistOwner(user, req.body?.visitorId);
    if (!owner) {
      return res.status(400).json({ success: false, message: 'Sign in to save products.' });
    }

    const product = await db.getProductById(String(req.body?.productId || ''));
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const saved = req.body?.saved !== false;
    await db.setWishlistItem({ productId: product.id, productName: product.name, userId: owner, phone: user?.phone || '', saved });
    const data = await db.getWishlistForOwner(owner);
    res.json({ success: true, saved, count: data.length, data });
  } catch (err) {
    sendError(res, err, 'Save wishlist');
  }
});

// ============================================================
// DELIVERY
// ============================================================

app.get('/api/delivery/assigned', requireAuth('delivery', 'admin'), async (req, res) => {
  try {
    // A delivery agent only ever sees their own run; admins may pick an agent.
    const boyName = req.user.role === 'delivery' ? req.user.name : req.query.boyName;
    const orders = await db.getOrders();
    const assigned = orders
      .filter((o) => !boyName || o.assignedDeliveryBoy === boyName || o.assignedDeliveryBoy === 'Unassigned')
      .map(withoutDeliveryOtp);
    res.json({ success: true, data: assigned });
  } catch (err) {
    sendError(res, err, 'Assigned deliveries');
  }
});

app.post('/api/delivery/verify-otp', requireAuth('delivery', 'admin'), async (req, res) => {
  try {
    const { orderId, otp } = req.body || {};
    if (!orderId || typeof orderId !== 'string') {
      return res.status(400).json({ success: false, message: 'Order id is required' });
    }

    const order = await db.getOrderById(orderId);
    if (!order || !isAssignedTo(order, req.user)) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.deliveryStatus === 'Delivered') {
      return res.json({ success: true, alreadyDelivered: true, order: withoutDeliveryOtp(order) });
    }

    // A 4-digit code would fall to guessing without a cap on attempts.
    const wait = await rateLimit(`delivery-otp:${orderId}`, 5, 15 * MINUTE_MS);
    if (wait) {
      return tooManyRequests(res, wait, 'Too many wrong OTP attempts for this order. Please try again later.');
    }

    const entered = String(otp || '').trim();
    if (!entered || !safeEqual(entered, String(order.otp || '').trim())) {
      return res.status(400).json({ success: false, message: 'Wrong OTP. Please try again.' });
    }

    const updated = await db.updateOrder(orderId, {
      status: 'Delivered',
      deliveryStatus: 'Delivered',
      deliveredAt: new Date().toISOString(),
      ...cashCollected(order),
    });
    await sendDeliveryStatusUpdate(updated, 'Delivered').catch(() => {});
    await settleReferralForOrder(updated).catch((err) => console.error('Referral reward:', err?.message));
    res.json({ success: true, order: withoutDeliveryOtp(updated) });
  } catch (err) {
    sendError(res, err, 'Verify delivery OTP');
  }
});

// Admin picks the delivery agent for an order; an empty id un-assigns it. The
// name and phone come from the agent's account, never from the request.
app.put('/api/orders/:id/assign', requireAuth('admin'), requireModule('orders'), async (req, res) => {
  try {
    const agentId = String(req.body?.deliveryUserId || '');
    let updates = { assignedDeliveryBoy: 'Unassigned', deliveryBoyPhone: '', assignedDeliveryUserId: '' };
    if (agentId) {
      const agent = await db.getUserById(agentId);
      if (!agent || agent.role !== 'delivery' || (agent.status && agent.status !== 'active')) {
        return res.status(400).json({ success: false, message: 'Pick an active delivery staff member.' });
      }
      updates = { assignedDeliveryBoy: agent.name, deliveryBoyPhone: agent.phone || '', assignedDeliveryUserId: agent.id };
    }
    updates.updatedAt = new Date().toISOString();
    const order = await db.updateOrder(req.params.id, updates);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, data: withoutDeliveryOtp(order) });
  } catch (err) {
    sendError(res, err, 'Assign delivery');
  }
});

app.put('/api/orders/:id/status', requireAuth('admin', 'delivery'), requireModule('orders'), async (req, res) => {
  try {
    const ALLOWED = ['Pending', 'Assigned', 'Confirmed', 'Dispatched', 'Out for Delivery', 'Delivered', 'Cancelled'];
    const { status, deliveryStatus, expectedDeliveryDate } = req.body || {};
    const nextStatus = deliveryStatus || status;

    if (nextStatus && !ALLOWED.includes(nextStatus)) {
      return res.status(400).json({ success: false, message: 'Unknown delivery status.' });
    }

    const existing = await db.getOrderById(req.params.id);
    if (!existing || !isAssignedTo(existing, req.user)) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Only the customer's OTP (via /api/delivery/verify-otp) can mark a delivery
    // agent's order Delivered; admins may still close orders directly.
    if (nextStatus === 'Delivered' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Verify the customer OTP to complete this delivery.' });
    }

    const updates = {};
    if (nextStatus) {
      updates.status = nextStatus;
      updates.deliveryStatus = nextStatus;
      if (nextStatus === 'Delivered') Object.assign(updates, { deliveredAt: new Date().toISOString() }, cashCollected(existing));
    }
    if (expectedDeliveryDate !== undefined) updates.expectedDeliveryDate = cleanText(String(expectedDeliveryDate), 40);
    if (!Object.keys(updates).length) {
      return res.status(400).json({ success: false, message: 'Nothing to update' });
    }
    updates.updatedAt = new Date().toISOString();

    // Cancelling gives the order's stock back; re-opening a cancelled order takes
    // it again. Each change is applied only if the order is still in the state we
    // read, so a double click cannot return the stock twice.
    const wasCancelled = [existing.deliveryStatus, existing.status].includes('Cancelled');
    const stockLines = orderStockLines(existing);
    let order;
    if (nextStatus === 'Cancelled' && !wasCancelled) {
      order = await db.updateOrderIf(req.params.id, { deliveryStatus: { $ne: 'Cancelled' }, status: { $ne: 'Cancelled' } }, updates);
      if (!order) return res.status(409).json({ success: false, message: 'This order was just cancelled. Refresh the list.' });
      // A paid order that ran short never took its stock, so there is none to return.
      if (!existing.stockShortfall) await db.releaseStock(stockLines);
      await returnOrderRewards(existing).catch((err) => console.error('Return order rewards:', err?.message));
    } else if (nextStatus && nextStatus !== 'Cancelled' && wasCancelled) {
      const reserved = await db.reserveStock(stockLines);
      if (!reserved.ok) {
        return res.status(409).json({ success: false, message: 'Not enough stock to re-open this order.' });
      }
      if (!(await retakeOrderRewards(existing))) {
        await db.releaseStock(stockLines).catch(() => {});
        return res.status(409).json({ success: false, message: 'The customer has used these points or this welcome offer on another order, so this order cannot be re-opened.' });
      }
      order = await db.updateOrderIf(req.params.id, { $or: [{ deliveryStatus: 'Cancelled' }, { status: 'Cancelled' }] }, updates);
      if (!order) {
        await db.releaseStock(stockLines).catch(() => {});
        await returnOrderRewards(existing).catch(() => {});
        return res.status(409).json({ success: false, message: 'This order was just changed. Refresh the list.' });
      }
    } else {
      order = await db.updateOrder(req.params.id, updates);
    }
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (nextStatus && ['Dispatched', 'Out for Delivery', 'Delivered'].includes(nextStatus)) {
      await sendDeliveryStatusUpdate(order, nextStatus).catch(() => {});
    }
    if (nextStatus === 'Delivered') {
      await settleReferralForOrder(order).catch((err) => console.error('Referral reward:', err?.message));
    }
    res.json({ success: true, data: withoutDeliveryOtp(order) });
  } catch (err) {
    sendError(res, err, 'Update order status');
  }
});

// ============================================================
// CMS
// ============================================================

// Content the storefront may read. Payment settings stay admin-only.
const PRIVATE_CMS_FIELDS = ['razorpaySecret', 'razorpayKeySecret', 'razorpayWebhookSecret'];

app.get('/api/cms', async (req, res) => {
  try {
    const data = { ...(await db.getCMS()) };
    const user = await getAuthenticatedUser(req);
    if (user?.role !== 'admin') {
      for (const field of PRIVATE_CMS_FIELDS) delete data[field];
    }
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err, 'CMS');
  }
});

app.put('/api/cms', requireAuth('admin'), requireModule('cms'), async (req, res) => {
  try {
    const updated = await db.updateCMS(req.body);
    recordActivity(req, {
      module: 'CMS',
      action: 'UPDATE_CMS',
      description: 'Modified website CMS settings / layout options',
      details: { sectionsUpdated: Object.keys(req.body || {}) }
    });
    res.json({ success: true, message: 'Website content updated successfully by Admin CMS', data: updated });
  } catch (err) {
    sendError(res, err, 'Update CMS');
  }
});

// ============================================================
// MEDIA UPLOADS (admin CMS, blog covers, and product/blog videos)
// Stored in MongoDB: the deploy target has no writable disk. The client sends
// base64 JSON rather than multipart so no extra dependency is needed.
// ============================================================

const ALLOWED_UPLOAD_TYPES = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml',
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'
];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;      // 10MB for images
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;     // 150MB for videos (stored on disk, no MongoDB limit)

app.post('/api/upload', requireAuth('admin'), requireModule(['cms', 'products', 'blogs', 'videos', 'users']), async (req, res) => {
  try {
    const { filename, contentType } = req.body || {};
    // Accept either a bare base64 string or a data: URL from FileReader.
    const raw = typeof req.body?.data === 'string' ? req.body.data : '';
    const base64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;

    if (!base64) return res.status(400).json({ success: false, message: 'No file data received' });
    if (!ALLOWED_UPLOAD_TYPES.includes(contentType)) {
      return res.status(400).json({ success: false, message: 'Only images (PNG, JPEG, WebP, GIF, SVG) or videos (MP4, WebM, OGG, MOV) can be uploaded' });
    }

    const buf = Buffer.from(base64, 'base64');
    const size = buf.length;
    const isVideo = contentType?.startsWith('video/');
    // For videos: save to disk (avoids MongoDB 16MB document limit).
    // For images: keep in MongoDB as before if under 10MB, else also save to disk.
    const limit = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (size > limit) {
      return res.status(413).json({ success: false, message: `${isVideo ? 'Video' : 'Image'} is larger than ${Math.round(limit / (1024 * 1024))}MB. Please use a smaller file.` });
    }

    // Determine file extension from contentType
    const EXT_MAP = {
      'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
      'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg',
      'video/mp4': 'mp4', 'video/webm': 'webm', 'video/ogg': 'ogg',
      'video/quicktime': 'mov', 'video/x-msvideo': 'avi',
    };
    const ext = EXT_MAP[contentType] || (filename ? path.extname(filename).slice(1) : 'bin');
    const id = `${Date.now().toString(36)}${crypto.randomBytes(6).toString('hex')}`;
    const diskFile = `${id}.${ext}`;
    const diskPath = path.join(UPLOADS_DIR, diskFile);

    // Write to disk — works for any file size
    if (!uploadsDiskReady) {
      return res.status(503).json({
        success: false,
        message: 'File uploads are not available on this server: it has no writable uploads directory. Set UPLOADS_DIR to a writable path, or use a URL instead of a file.',
      });
    }
    fs.writeFileSync(diskPath, buf);

    // Store lightweight metadata in MongoDB (no binary data)
    const user = await getAuthenticatedUser(req);
    await db.createUploadMeta({
      id,
      diskFile,
      contentType,
      filename: filename || diskFile,
      size,
      uploadedBy: user?.id || '',
    });

    res.json({ success: true, url: `/uploads/${diskFile}`, id, size, isVideo });
  } catch (err) {
    sendError(res, err, 'Upload');
  }
});

// Legacy: serve any old uploads that were stored as base64 in MongoDB
// New uploads go directly to /uploads/ static dir (served above).
app.get('/api/upload/:id', async (req, res) => {
  try {
    // First check if a disk file exists via metadata
    const meta = await db.getUploadMeta(req.params.id).catch(() => null);
    if (meta?.diskFile) {
      const diskPath = path.join(UPLOADS_DIR, meta.diskFile);
      if (fs.existsSync(diskPath)) {
        return res.redirect(301, `/uploads/${meta.diskFile}`);
      }
    }
    // Fall back to old MongoDB binary storage (for backwards compatibility)
    const file = await db.getUpload(req.params.id);
    if (!file || !file.data) return res.status(404).json({ success: false, message: 'File not found' });
    const body = Buffer.from(file.data, 'base64');
    res.set('Content-Type', file.contentType || 'application/octet-stream');
    res.set('Content-Length', String(body.length));
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(body);
  } catch (err) {
    sendError(res, err, 'Read upload');
  }
});

// ============================================================
// ADVISORY
// ============================================================

app.post('/api/advisory/subscribe', async (req, res) => {
  try {
    const wait = await rateLimit(`advisory-ip:${clientIp(req)}`, 10, HOUR_MS);
    if (wait) return tooManyRequests(res, wait, 'Too many requests. Please try again later.');

    const { name, season, acreage } = req.body || {};
    const phone = normalizePhone(req.body?.phone);
    const crop = cleanText(req.body?.crop, 60);

    if (!phone || !crop) {
      return res.status(400).json({ success: false, message: 'A valid mobile number and crop are required.' });
    }

    const subscriber = {
      id: newId('adv'),
      name: cleanText(name, 80) || 'Farmer Partner',
      phone,
      crop,
      season: cleanText(season, 30) || 'Kharif',
      acreage: Number(acreage) || 1,
      subscribedAt: new Date().toISOString(),
      status: 'Active',
      lastAdvisorySent: null,
    };

    const created = await db.addAdvisorySubscriber(subscriber);
    res.json({ success: true, message: 'Subscribed to weekly crop advisory successfully', data: created });
  } catch (err) {
    sendError(res, err, 'Advisory subscribe');
  }
});

app.get('/api/advisory/subscribers', requireAuth('admin'), requireModule('subscribers'), async (req, res) => {
  try {
    const data = await db.getAdvisorySubscribers();
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err, 'Advisory subscribers');
  }
});

app.patch('/api/advisory/subscribers/:id', requireAuth('admin'), requireModule('subscribers'), async (req, res) => {
  try {
    const status = req.body?.status;
    if (!SUBSCRIBER_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Unknown subscription status.' });
    }
    const data = await db.updateAdvisorySubscriber(req.params.id, { status });
    if (!data) return res.status(404).json({ success: false, message: 'Subscriber not found.' });
    // A farmer who opts out is opted out on every sign-up with that number.
    if (status === 'Unsubscribed') await db.setAdvisoryStatusByPhone(data.phone, status);
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err, 'Update advisory subscriber');
  }
});

// A broadcast is a job: it is created with its recipient list, then sent in
// short batches (POST .../process) that the admin page keeps calling until it
// is done. WhatsApp numbers are paced to ~1 message / 5s, so a large broadcast
// cannot fit in one serverless request, and a closed tab can resume later.
const BROADCAST_BATCH_MS = 6000;
const BROADCAST_STALE_MS = 2 * MINUTE_MS;
// Send failures where WhatsApp never took the message, so it is safe to try again later.
const NOT_SENT_CODES = new Set(['BUSY', 'NO_SENDER', 'NOT_CONFIGURED', 'RATE_LIMITED', 'KEY_REJECTED', 'SESSION_DOWN']);

function broadcastSummary(broadcast) {
  const { recipients, ...rest } = broadcast;
  return recipients ? { ...rest, counts: broadcastCounts(recipients) } : rest;
}

// WaSender calls this for incoming WhatsApp messages. A farmer replying STOP
// is unsubscribed from advisories on every sign-up with that number; START
// brings them back. Set the webhook URL to https://<site>/api/whatsapp/webhook
// on each WaSender session, and put its Webhook Secret in
// WASENDER_WEBHOOK_SECRET (comma-separated when the sessions differ).
app.post('/api/whatsapp/webhook', async (req, res) => {
  try {
    const secrets = String(process.env.WASENDER_WEBHOOK_SECRET || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!secrets.length) return res.status(503).json({ success: false, message: 'Webhook is not configured.' });
    const signature = String(req.headers['x-webhook-signature'] || '');
    if (!secrets.some((secret) => safeEqual(signature, secret))) {
      return res.status(401).json({ success: false, message: 'Invalid signature.' });
    }

    const reply = parseOptOutWebhook(req.body);
    if (!reply) return res.json({ success: true, handled: false });

    // WaSender may deliver the same event more than once.
    if (reply.id) {
      const seenKey = `wa-webhook:${reply.id}`;
      if (await db.kvGet(seenKey)) return res.json({ success: true, handled: false, duplicate: true });
      await db.kvSet(seenKey, { at: Date.now() }, 2 * 24 * HOUR_MS);
    }

    const records = (await db.getAdvisorySubscribers()).filter((s) => s.phone === reply.phone);
    const status = reply.intent === 'stop' ? 'Unsubscribed' : 'Active';
    // START only re-activates farmers who once subscribed; it never signs up a stranger.
    if (!records.length || records.every((s) => (s.status || 'Active') === status)) {
      return res.json({ success: true, handled: false });
    }
    await db.setAdvisoryStatusByPhone(reply.phone, status);
    res.json({ success: true, handled: true, status });

    const confirmation = status === 'Unsubscribed'
      ? 'You have been unsubscribed from Sathyam Agro Mart crop advisories. Reply START anytime to get them again.'
      : 'Welcome back! You will receive Sathyam Agro Mart crop advisories again. Reply STOP to unsubscribe.';
    sendWhatsAppText(reply.phone, confirmation).catch((err) => console.warn('⚠️ Opt-out confirmation not sent:', err.message));
  } catch (err) {
    sendError(res, err, 'WhatsApp webhook');
  }
});

app.get('/api/advisory/broadcasts', requireAuth('admin'), requireModule('subscribers'), async (req, res) => {
  try {
    res.json({ success: true, data: await db.getAdvisoryBroadcasts(20) });
  } catch (err) {
    sendError(res, err, 'Advisory broadcasts');
  }
});

app.get('/api/advisory/broadcasts/:id', requireAuth('admin'), requireModule('subscribers'), async (req, res) => {
  try {
    const broadcast = await db.getAdvisoryBroadcast(req.params.id);
    if (!broadcast) return res.status(404).json({ success: false, message: 'Broadcast not found.' });
    res.json({ success: true, data: { ...broadcastSummary(broadcast), recipients: broadcast.recipients } });
  } catch (err) {
    sendError(res, err, 'Advisory broadcast');
  }
});

app.post('/api/advisory/broadcasts', requireAuth('admin'), requireModule('subscribers'), async (req, res) => {
  try {
    let request;
    try {
      request = parseBroadcastRequest(req.body);
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (!whatsAppConfigured()) {
      return res.status(503).json({ success: false, message: 'WhatsApp sending is not configured on this server (WASENDER_API_KEY).' });
    }

    const recipients = selectRecipients(await db.getAdvisorySubscribers(), request).map((sub) => ({
      subscriberId: sub.id,
      phone: sub.phone,
      name: sub.name || '',
      crop: sub.crop || '',
      cropGroup: cropGroupKey(sub.crop),
      season: sub.season || '',
      acreage: Number(sub.acreage ?? sub.acres) || 1,
      status: 'queued',
    }));
    if (!recipients.length) {
      return res.status(400).json({ success: false, message: 'No active subscribers match these crops and seasons.' });
    }

    const broadcast = await db.createAdvisoryBroadcast({
      id: newId('ADVB'),
      ...request,
      status: 'sending',
      createdAt: new Date().toISOString(),
      createdBy: { id: req.user.id, name: req.user.name || '' },
      recipients,
      counts: broadcastCounts(recipients),
    });
    res.json({ success: true, data: broadcastSummary(broadcast) });
  } catch (err) {
    sendError(res, err, 'Create advisory broadcast');
  }
});

app.post('/api/advisory/broadcasts/:id/process', requireAuth('admin'), requireModule('subscribers'), async (req, res) => {
  try {
    const { id } = req.params;
    const started = Date.now();
    await db.failStaleBroadcastRecipients(id, new Date(started - BROADCAST_STALE_MS).toISOString());

    const broadcast = await db.getAdvisoryBroadcast(id);
    if (!broadcast) return res.status(404).json({ success: false, message: 'Broadcast not found.' });

    let paused = null;
    while (broadcast.status === 'sending' && Date.now() - started < BROADCAST_BATCH_MS) {
      const recipient = await db.claimBroadcastRecipient(id);
      if (!recipient) break;

      try {
        await sendWhatsAppText(recipient.phone, renderAdvisory(broadcast.message, recipient));
        const sentAt = new Date().toISOString();
        await db.setBroadcastRecipient(id, recipient.phone, { status: 'sent', sentAt });
        if (recipient.subscriberId) {
          await db.updateAdvisorySubscriber(recipient.subscriberId, { lastAdvisorySent: broadcast.title, lastAdvisoryAt: sentAt })
            .catch(() => {});
        }
      } catch (err) {
        // Nothing was sent (numbers busy, resting or rate limited), so
        // the farmer goes back in the queue and this batch stops for now.
        if (NOT_SENT_CODES.has(err.code)) {
          await db.setBroadcastRecipient(id, recipient.phone, { status: 'queued' });
          paused = err.code === 'NOT_CONFIGURED' ? err.message : 'WhatsApp numbers are busy. Retrying shortly.';
          break;
        }
        await db.setBroadcastRecipient(id, recipient.phone, {
          status: err.code === 'NOT_ON_WHATSAPP' ? 'skipped' : 'failed',
          error: String(err.message || 'Send failed').slice(0, 200),
        });
      }
    }

    const current = await db.getAdvisoryBroadcast(id);
    const counts = broadcastCounts(current.recipients);
    const patch = { counts };
    if (current.status === 'sending' && !counts.queued && !counts.sending) {
      Object.assign(patch, { status: 'completed', finishedAt: new Date().toISOString() });
    }
    await db.updateAdvisoryBroadcast(id, patch);
    res.json({ success: true, data: { ...broadcastSummary(current), ...patch }, paused });
  } catch (err) {
    sendError(res, err, 'Send advisory broadcast');
  }
});

app.post('/api/advisory/broadcasts/:id/cancel', requireAuth('admin'), requireModule('subscribers'), async (req, res) => {
  try {
    await db.cancelAdvisoryBroadcast(req.params.id);
    const current = await db.getAdvisoryBroadcast(req.params.id);
    if (!current) return res.status(404).json({ success: false, message: 'Broadcast not found.' });
    const counts = broadcastCounts(current.recipients);
    await db.updateAdvisoryBroadcast(req.params.id, { counts });
    res.json({ success: true, data: { ...broadcastSummary(current), counts } });
  } catch (err) {
    sendError(res, err, 'Cancel advisory broadcast');
  }
});

// ============================================================
// VISITOR LOCATION (asked on the store, stored once per visit)
// ============================================================

// The browser sends its point after the visitor allowed location. Linked to
// the account when signed in, and to the name and number the visitor gave in
// the Stay connected card when they are a guest.
app.post('/api/visitor-location', async (req, res) => {
  try {
    const wait = await rateLimit(`visitor-location-ip:${clientIp(req)}`, 30, HOUR_MS);
    if (wait) return tooManyRequests(res, wait, 'Too many requests. Please try again later.');
    const ping = cleanVisitorPing(req.body);
    if (!ping) return res.status(400).json({ success: false, message: 'Location not recognised.' });
    const user = await getAuthenticatedUser(req);
    await db.saveVisitorLocation({
      ...ping,
      userId: user?.id || '',
      name: user?.name || cleanText(req.body?.name, 80),
      phone: user?.phone || normalizePhone(req.body?.phone) || '',
    });
    res.json({ success: true });
  } catch (err) {
    sendError(res, err, 'Visitor location');
  }
});

// The browser reporting that location was asked and refused (or is blocked
// for the site): no point, just the fact - so "denied" is queryable too.
app.post('/api/visitor-location-denied', async (req, res) => {
  try {
    const wait = await rateLimit(`visitor-location-ip:${clientIp(req)}`, 30, HOUR_MS);
    if (wait) return tooManyRequests(res, wait, 'Too many requests. Please try again later.');
    const ping = cleanVisitorDenied(req.body);
    if (!ping) return res.status(400).json({ success: false, message: 'Visitor not recognised.' });
    const user = await getAuthenticatedUser(req);
    await db.markVisitorLocationDenied({
      ...ping,
      userId: user?.id || '',
      name: user?.name || cleanText(req.body?.name, 80),
      phone: user?.phone || normalizePhone(req.body?.phone) || '',
    });
    res.json({ success: true });
  } catch (err) {
    sendError(res, err, 'Visitor location denied');
  }
});

// The "Stay connected" card: name and number, sent as soon as they are given,
// unverified (no OTP) - independent of whether location is ever asked.
app.post('/api/visitor-contact', async (req, res) => {
  try {
    const wait = await rateLimit(`visitor-contact-ip:${clientIp(req)}`, 30, HOUR_MS);
    if (wait) return tooManyRequests(res, wait, 'Too many requests. Please try again later.');
    const visitorId = validVisitorId(req.body?.visitorId);
    if (!visitorId) return res.status(400).json({ success: false, message: 'Visitor not recognised.' });
    const user = await getAuthenticatedUser(req);
    const name = user?.name || cleanText(req.body?.name, 80);
    const phone = user?.phone || normalizePhone(req.body?.phone) || '';
    if (!name || !phone) return res.status(400).json({ success: false, message: 'Name and phone are required.' });
    await db.saveVisitorContact({ visitorId, userId: user?.id || '', name, phone });
    res.json({ success: true });
  } catch (err) {
    sendError(res, err, 'Visitor contact');
  }
});

app.get('/api/visitor-locations', requireAuth('admin'), requireModule(['overview', 'analytics']), async (req, res) => {
  try {
    res.json({ success: true, data: await db.getVisitorLocations() });
  } catch (err) {
    sendError(res, err, 'Visitor locations');
  }
});

// ============================================================
// FARMER ENQUIRIES
// ============================================================

app.post('/api/enquiries', async (req, res) => {
  try {
    const wait = await rateLimit(`enquiry-ip:${clientIp(req)}`, 10, HOUR_MS);
    if (wait) return tooManyRequests(res, wait, 'Too many requests. Please try again later.');

    const name = cleanText(req.body?.name, 80);
    const phone = normalizePhone(req.body?.phone);
    const location = cleanText(req.body?.location, 80);

    if (!name || !phone || !location) {
      return res.status(400).json({ success: false, message: 'Name, mobile number and location are required.' });
    }

    const enquiry = {
      id: newId('ENQ'),
      name,
      phone,
      location,
      crop: cleanText(req.body?.crop, 60),
      type: cleanText(req.body?.type, 30) || 'Other',
      message: cleanText(req.body?.message, 1000),
      status: 'New',
      createdAt: new Date().toISOString(),
    };

    const created = await db.addFarmerEnquiry(enquiry);
    res.json({ success: true, message: 'Your enquiry has been received.', data: created });
  } catch (err) {
    sendError(res, err, 'Farmer enquiry');
  }
});

app.get('/api/enquiries', requireAuth('admin'), requireModule('enquiries'), async (req, res) => {
  try {
    const data = await db.getFarmerEnquiries();
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err, 'Farmer enquiries');
  }
});

app.put('/api/enquiries/:id', requireAuth('admin'), requireModule('enquiries'), async (req, res) => {
  try {
    const { status } = req.body;
    const updated = await db.updateFarmerEnquiryStatus(req.params.id, status);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Enquiry not found' });
    }
    res.json({ success: true, message: 'Enquiry status updated successfully', data: updated });
  } catch (err) {
    sendError(res, err, 'Update farmer enquiry status');
  }
});

// ============================================================
// COUPONS & DISCOUNT CREDIT MONITORING
// ============================================================

app.get('/api/admin/coupons', requireAuth('admin'), requireModule('coupons'), async (req, res) => {
  try {
    const data = await db.getCoupons();
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err, 'Get coupons');
  }
});

app.post('/api/admin/coupons', requireAuth('admin'), requireModule('coupons'), async (req, res) => {
  try {
    const { code, type, value, minOrder, maxDiscount, usageType, active } = req.body;
    if (!code || value === undefined) {
      return res.status(400).json({ success: false, message: 'Coupon code and value are required.' });
    }
    const created = await db.addCoupon({ code, type, value, minOrder, maxDiscount, usageType, active });
    res.json({ success: true, message: `Coupon "${created.code}" created successfully!`, data: created });
  } catch (err) {
    sendError(res, err, 'Create coupon');
  }
});

app.put('/api/admin/coupons/:id', requireAuth('admin'), requireModule('coupons'), async (req, res) => {
  try {
    const updated = await db.updateCoupon(req.params.id, req.body);
    res.json({ success: true, message: 'Coupon updated successfully', data: updated });
  } catch (err) {
    sendError(res, err, 'Update coupon');
  }
});

app.delete('/api/admin/coupons/:id', requireAuth('admin'), requireModule('coupons'), async (req, res) => {
  try {
    await db.deleteCoupon(req.params.id);
    res.json({ success: true, message: 'Coupon deleted successfully' });
  } catch (err) {
    sendError(res, err, 'Delete coupon');
  }
});

app.get('/api/admin/coupon-usages', requireAuth('admin'), requireModule('coupons'), async (req, res) => {
  try {
    const data = await db.getCouponUsages();
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err, 'Get coupon usages');
  }
});

app.post('/api/coupons/validate', async (req, res) => {
  try {
    // Who is asking is decided here, not by the caller. This read `userId` and
    // `userOrdersCount` straight from the body, so anyone could claim to be a
    // first-time buyer - or somebody else - and keep re-using a one-per-person
    // code. The signed-in user comes from the token, and how many orders they
    // have placed is counted on this side.
    const { code, cartTotal = 0 } = req.body;
    const signedIn = await getAuthenticatedUser(req);
    const userId = signedIn?.id || '';
    const userOrdersCount = userId
      ? (await db.getOrders()).filter(order => order.userId === userId).length
      : 0;
    const cleanCode = String(code || '').trim().toUpperCase();
    if (!cleanCode) {
      return res.status(400).json({ success: false, message: 'Enter a coupon code.' });
    }

    const coupons = await db.getCoupons();
    const coupon = coupons.find(c => c.code.toUpperCase() === cleanCode && c.active);

    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Invalid or expired coupon code.' });
    }

    if (cartTotal < (coupon.minOrder || 0)) {
      return res.status(400).json({
        success: false,
        message: `Minimum order total of ₹${coupon.minOrder} is required for this coupon.`
      });
    }

    // Check usage type rules
    if (coupon.usageType === 'first_time') {
      const usages = await db.getCouponUsages();
      const userUsed = userId ? usages.filter(u => u.userId === userId || u.couponCode === cleanCode) : [];
      if (userOrdersCount > 0 || userUsed.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'This coupon is valid for first-time orders only.'
        });
      }
    } else if (coupon.usageType === 'one_time') {
      const usages = await db.getCouponUsages();
      const hasUsed = usages.some(u => u.couponCode === cleanCode && u.userId === userId);
      if (hasUsed) {
        return res.status(400).json({
          success: false,
          message: 'You have already used this coupon code.'
        });
      }
    }

    // Calculate discount amount
    let discount = 0;
    if (coupon.type === 'percentage') {
      discount = Math.round((cartTotal * coupon.value) / 100);
      if (coupon.maxDiscount && discount > coupon.maxDiscount) {
        discount = coupon.maxDiscount;
      }
    } else {
      discount = coupon.value;
    }

    discount = Math.min(discount, cartTotal);

    res.json({
      success: true,
      message: `Coupon "${coupon.code}" applied! Discount: ₹${discount}`,
      data: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        discount,
        usageType: coupon.usageType
      }
    });
  } catch (err) {
    sendError(res, err, 'Validate coupon');
  }
});

// ============================================================
// REFERRALS & REWARD POINTS MANAGEMENT
// ============================================================

app.get('/api/admin/referrals', requireAuth('admin'), requireModule('referrals'), async (req, res) => {
  try {
    const referrals = await db.getReferrals();
    const ledgers = await db.getPointsLedgers();
    const users = (await db.getUsers()).filter(u => u.role === 'farmer');
    res.json({ success: true, data: { referrals, ledgers, users } });
  } catch (err) {
    sendError(res, err, 'Get referrals');
  }
});

app.post('/api/admin/referrals/assign-points', requireAuth('admin'), requireModule('referrals'), async (req, res) => {
  try {
    const userId = String(req.body?.userId || '');
    const points = Number(req.body?.points);
    const description = cleanText(req.body?.description, 200) || 'Points adjusted by admin';
    if (!userId) {
      return res.status(400).json({ success: false, message: 'Pick a customer.' });
    }
    if (!Number.isInteger(points) || points === 0 || Math.abs(points) > 10000) {
      return res.status(400).json({ success: false, message: 'Points must be a whole number from -10000 to 10000, not 0.' });
    }
    // Only farmer accounts hold points; addPoints refuses anyone else.
    const settings = await loadReferralSettings();
    const result = await db.addPoints(userId, points, description, {
      type: points > 0 ? 'admin' : 'admin-deduct',
      expiresAt: points > 0 ? pointsExpiry(settings) : undefined,
    });
    if (!result) {
      return res.status(404).json({ success: false, message: 'Customer account not found.' });
    }
    if (result.error) {
      return res.status(400).json({ success: false, message: 'The customer does not have that many points to deduct.' });
    }
    await recordActivity(req, { module: 'referrals', action: 'assign-points', entityId: userId, description: `${points > 0 ? '+' : ''}${points} points: ${description}` }).catch(() => {});
    res.json({ success: true, message: `Updated points balance to ${result.newPoints} points!`, data: result });
  } catch (err) {
    sendError(res, err, 'Assign points');
  }
});

app.get('/api/admin/referrals/settings', requireAuth('admin'), requireModule('referrals'), async (req, res) => {
  try {
    res.json({ success: true, data: await loadReferralSettings() });
  } catch (err) {
    sendError(res, err, 'Referral settings');
  }
});

app.put('/api/admin/referrals/settings', requireAuth('admin'), requireModule('referrals'), async (req, res) => {
  try {
    const { settings, error } = cleanReferralSettings(req.body, await loadReferralSettings());
    if (error) return res.status(400).json({ success: false, message: error });
    await db.saveReferralSettings(settings);
    await recordActivity(req, { module: 'referrals', action: 'settings', entityId: 'referral-settings', description: 'Changed Refer & Earn settings', details: settings }).catch(() => {});
    res.json({ success: true, data: settings, message: 'Refer & Earn settings saved.' });
  } catch (err) {
    sendError(res, err, 'Save referral settings');
  }
});

app.post('/api/admin/referrals/:id/reverse', requireAuth('admin'), requireModule('referrals'), async (req, res) => {
  try {
    const reason = cleanText(req.body?.reason, 200);
    const result = await reverseReferral(req.params.id, reason);
    if (result.status !== 200) return res.status(result.status).json({ success: false, message: result.message });
    await recordActivity(req, { module: 'referrals', action: 'reverse', entityId: req.params.id, description: `Reversed referral (${result.pointsRemoved} points removed)` }).catch(() => {});
    res.json({ success: true, data: result.referral, message: `Referral reversed. ${result.pointsRemoved} points removed from the referrer.` });
  } catch (err) {
    sendError(res, err, 'Reverse referral');
  }
});

// ---- Refer & Earn for farmers ----

// Signup checks a code before the farmer submits, to greet them with their
// friend's name. Limited per connection, so codes cannot be harvested.
app.get('/api/referrals/check', async (req, res) => {
  try {
    const wait = await rateLimit(`ref-check-ip:${clientIp(req)}`, 30, HOUR_MS);
    if (wait) return tooManyRequests(res, wait, 'Too many code checks. Please try again later.');
    const settings = await loadReferralSettings();
    const referrer = settings.enabled ? await db.getFarmerByReferralCode(normalizeReferralCode(req.query.code)) : null;
    if (!referrer || referrer.status === 'blocked' || referrer.status === 'inactive') {
      return res.json({ success: true, valid: false, message: 'That referral code was not found.' });
    }
    res.json({
      success: true,
      valid: true,
      referrerName: maskName(referrer.name),
      welcomeDiscount: settings.welcomeDiscount,
      minOrder: settings.minOrder,
    });
  } catch (err) {
    sendError(res, err, 'Check referral code');
  }
});

app.get('/api/me/referrals', requireAuth(), async (req, res) => {
  try {
    if (req.user.role !== 'farmer') {
      return res.status(403).json({ success: false, message: 'Refer & Earn is for customer accounts.' });
    }
    res.json({ success: true, data: await referralSummary(req.user) });
  } catch (err) {
    sendError(res, err, 'My referrals');
  }
});

// What checkout will charge after the welcome offer and points - the same
// calculation /api/orders and /api/payments/create-order apply.
app.post('/api/checkout/rewards', requireAuth(), async (req, res) => {
  try {
    const priced = await priceCart(req.body?.items);
    const { rewards, balance } = await quoteRewards(req.user, priced, req.body?.usePoints === true);
    res.json({ success: true, data: { ...rewards, balance, subtotal: priced.subtotal, gst: priced.gst } });
  } catch (err) {
    sendError(res, err, 'Checkout rewards');
  }
});

// ============================================================
// INVENTORY / STAFF TASKS
// ============================================================

app.get('/api/inventory', requireAuth('admin', 'employee'), async (req, res) => {
  try {
    const data = await db.getInventory();
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err, 'Inventory');
  }
});

app.get('/api/staff-tasks', requireAuth('admin', 'employee'), async (req, res) => {
  try {
    const data = await db.getStaffTasks();
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err, 'Staff tasks');
  }
});

// ============================================================
// BILLING / POS
// ============================================================

// GST slabs an invoice line may carry.
const INVOICE_GST_RATES = [0, 0.25, 3, 5, 12, 18, 28];

app.post('/api/billing/invoice', requireAuth('billing', 'admin'), requireModule('pos', { roles: ['billing'] }), async (req, res) => {
  try {
    const {
      customerName,
      customerPhone,
      discountAmount = 0,
      couponCode = '',
      paymentMode = 'Cash',
      paymentTerms = '',
      buyerRef = '',
      otherReferences = '',
      documentType = 'TAX INVOICE',
      irn = '',
      ackNo = '',
      ackDate = '',
      consigneeDetails,
      buyerDetails,
      despatchDetails,
      transportDetails,
      amountInWords = '',
      taxAmountInWords = ''
    } = req.body || {};

    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 200) : [];
    if (!items.length) throw new HttpError(400, 'Add at least one item to the bill.');

    // Everything that decides the money is checked here, not on the counter
    // screen: quantities, rates, discounts, and the GST rate and HSN of a
    // catalogue product (taken from the product, not the request).
    const catalogue = new Map((await db.getProductsByIds(items.map((item) => String(item?.productId || '')).filter(Boolean))).map((p) => [p.id, p]));

    const lines = items.map((item, index) => {
      const n = index + 1;
      const qty = Number(item?.qty);
      if (!Number.isInteger(qty) || qty < 1 || qty > 9999) throw new HttpError(400, `Line ${n}: quantity must be a whole number from 1 to 9999.`);
      const price = Number(item?.price ?? item?.rate);
      if (!Number.isFinite(price) || price <= 0 || price > 10000000) throw new HttpError(400, `Line ${n}: enter a rate above 0.`);
      const discPercent = Number(item?.discPercent ?? item?.discountPercent ?? 0);
      if (!Number.isFinite(discPercent) || discPercent < 0 || discPercent > 100) throw new HttpError(400, `Line ${n}: discount must be between 0 and 100%.`);

      const productId = cleanText(item?.productId || '', 40);
      const product = productId ? catalogue.get(productId) : null;
      if (productId && !product) throw new HttpError(400, `Line ${n}: this product is no longer in the catalogue.`);
      const productRate = Number(product?.gstRate);
      const gstRate = product
        ? (product.gstRate !== undefined && product.gstRate !== null && product.gstRate !== '' && Number.isFinite(productRate) ? productRate : 18)
        : Number(item?.gstRate ?? item?.gst ?? 18);
      if (!INVOICE_GST_RATES.includes(gstRate)) throw new HttpError(400, `Line ${n}: GST rate must be one of ${INVOICE_GST_RATES.join(', ')}%.`);

      return { item, qty, price, discPercent, productId, product, gstRate, lineTotal: +(price * qty * (1 - discPercent / 100)).toFixed(2) };
    });

    const subtotal = +lines.reduce((sum, line) => sum + line.lineTotal, 0).toFixed(2);
    const discAmt = Number(discountAmount) || 0;
    if (discAmt < 0 || discAmt > subtotal) throw new HttpError(400, 'The bill discount cannot be more than the bill.');
    const taxableAmount = +(subtotal - discAmt).toFixed(2);

    // GST is on the discounted value: the bill discount is shared across the
    // lines by their value, the same as the counter screen's preview.
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    const enrichedItems = lines.map(({ item, qty, price, discPercent, productId, product, gstRate, lineTotal }) => {
      const lineTaxable = subtotal > 0 ? Math.max(0, lineTotal - discAmt * (lineTotal / subtotal)) : 0;
      const cgstRate = +(gstRate / 2).toFixed(2);
      const sgstRate = +(gstRate / 2).toFixed(2);
      const igstRate = gstRate;
      totalCgst += lineTaxable * (cgstRate / 100);
      totalSgst += lineTaxable * (sgstRate / 100);
      totalIgst += lineTaxable * (igstRate / 100);

      return {
        id: cleanText(item.id || '', 40) || newId('ITM'),
        // The catalogue product this line came from, if any (a hand-typed
        // line has none) - kept separate from the line's own id above, and
        // used only to take the sale out of that product's stock.
        productId,
        name: product?.name || cleanText(item.name || item.productName, 120) || 'Product',
        batch: cleanText(item.batch || item.batchNo || 'Primary Batch', 50),
        subText: cleanText(item.subText || '', 200),
        hsnCode: cleanText(product?.hsnCode || item.hsnCode || item.hsn || '31010099', 12),
        price,
        rate: price,
        qty,
        unit: cleanText(item.unit || 'Nos', 12),
        per: cleanText(item.per || item.unit || 'Nos', 12),
        discPercent,
        gstRate,
        cgstRate,
        sgstRate,
        igstRate,
        lineTotal,
        amount: lineTotal,
        lineCgst: +(lineTaxable * (cgstRate / 100)).toFixed(2),
        lineSgst: +(lineTaxable * (sgstRate / 100)).toFixed(2)
      };
    });

    totalCgst = +totalCgst.toFixed(2);
    totalSgst = +totalSgst.toFixed(2);
    totalIgst = +totalIgst.toFixed(2);
    const totalGst = +(totalCgst + totalSgst).toFixed(2);
    const rawGrandTotal = taxableAmount + totalGst;
    // Rounded to the rupee here, never taken from the request: a caller-sent
    // round-off could take any amount off the bill.
    const computedRoundOff = +(Math.round(rawGrandTotal) - rawGrandTotal).toFixed(2);
    const grandTotal = +(rawGrandTotal + computedRoundOff).toFixed(2);

    // The invoice date is the day it is issued, or an earlier day for a bill
    // entered late - never a future day.
    const invoiceDate = req.body?.date ? new Date(req.body.date) : new Date();
    if (Number.isNaN(invoiceDate.getTime())) throw new HttpError(400, 'The invoice date is not a valid date.');
    if (invoiceDate.getTime() > Date.now() + 24 * HOUR_MS) throw new HttpError(400, 'The invoice date cannot be in the future.');

    const generatedId = newId('INV');

    // Resolve store information from the authenticated user
    // The store (and so the invoice number series) is the signed-in account's;
    // only a super admin may bill for a store they pick.
    const pickStore = req.user.role === 'superadmin';
    const userStoreId = req.user.storeId || (pickStore ? cleanText(req.body.storeId, 40) : '') || '';
    const userStoreName = req.user.storeName || (pickStore ? cleanText(req.body.storeName, 80) : '') || '';
    let userStoreCode = req.user.storeCode || (pickStore ? cleanText(req.body.storeCode, 12) : '') || '';

    // If storeCode not on user object, try to fetch it from the Store collection
    if (!userStoreCode && userStoreId) {
      try {
        const storeRec = await db.getStoreById(userStoreId);
        userStoreCode = storeRec?.code || '';
      } catch (_) {}
    }

    // Enforce SAM <STORE_CODE> <INTEGER> format
    // GST invoice numbers must be unique and in sequence, so the server always
    // assigns the next one. The number the counter showed is only a preview.
    const finalInvoiceNo = await db.getNextInvoiceNumber(userStoreCode || 'GEN');

    const cleanPaymentMode = cleanText(paymentMode, 40) || 'Cash';
    const isCreditPurchase = cleanPaymentMode.toLowerCase().includes('credit');

    const invoice = {
      id: generatedId,
      invoiceNo: finalInvoiceNo,
      storeId: userStoreId,
      storeCode: userStoreCode,
      storeName: userStoreName,
      documentType: cleanText(documentType, 30) || 'TAX INVOICE',
      date: invoiceDate.toISOString(),
      irn: cleanText(irn, 120),
      ackNo: cleanText(ackNo, 50),
      ackDate: cleanText(ackDate, 30),
      customerName: cleanText(customerName || buyerDetails?.name, 80) || 'Walk-in Customer',
      customerPhone: cleanText(customerPhone || buyerDetails?.phone, 20),
      // The seller's GSTIN and bank account are ours, never the request's.
      sellerDetails: {
        name: 'Sathyam Agro Clinic',
        line1: 'No.12, Ghouse Enclave,',
        line2: '70 ft Road, Ellis Nagar,',
        line3: 'Madurai - 625016.',
        line4: '',
        unit: '',
        pincode: '625016',
        gstin: '33AFBFS8329C1Z6',
        pan: 'AFBFS8329C'
      },
      buyerDetails: buyerDetails || {
        name: cleanText(customerName, 80) || 'Walk-in Customer',
        line1: cleanText(req.body.customerAddress, 200) || 'Retail Counter',
        cityState: 'Madurai-625016, Tamil Nadu',
        pincode: '625016',
        gstin: cleanText(req.body.customerGstin, 20),
        stateName: 'Tamil Nadu',
        stateCode: '33',
        placeOfSupply: 'Tamil Nadu',
        contactName: cleanText(customerName, 80)
      },
      consigneeDetails: consigneeDetails || buyerDetails || {},
      despatchDetails: despatchDetails || {},
      transportDetails: transportDetails || {},
      bankDetails: {
        bankName: 'ICICI Bank',
        acNo: '466805500061',
        branchIfsc: 'Madurai Simmakkal & ICIC0004668'
      },
      paymentMode: cleanPaymentMode,
      paymentTerms: cleanText(paymentTerms, 60),
      buyerRef: cleanText(buyerRef, 60),
      otherReferences: cleanText(otherReferences, 60),
      items: enrichedItems,
      subtotal,
      discountAmount: discAmt,
      couponCode: cleanText(couponCode, 50).toUpperCase(),
      taxableAmount,
      cgst: totalCgst,
      sgst: totalSgst,
      igst: totalIgst,
      totalGst,
      roundOff: computedRoundOff,
      grandTotal,
      amountInWords: cleanText(amountInWords, 250),
      taxAmountInWords: cleanText(taxAmountInWords, 250),
      cashier: req.user.name,
      status: isCreditPurchase ? 'CREDIT' : 'PAID',
    };

    // Cash is already in the till, so the invoice is issued either way; a
    // shortfall (a line not in stock, or a hand-typed line with no catalogue
    // product to take stock from) only gets flagged on the invoice, the same
    // as an online order that outran its stock.
    const stockLines = enrichedItems.filter(it => it.productId).map(it => ({ id: it.productId, qty: it.qty }));
    const reserved = stockLines.length ? await db.reserveStock(stockLines) : { ok: true };
    invoice.stockShortfall = !reserved.ok;

    const savedInvoice = await db.createInvoice(invoice);
    res.json({ success: true, message: 'POS GST Tax Invoice Generated', invoice: savedInvoice });
  } catch (err) {
    sendError(res, err, 'Create invoice');
  }
});

/** GET /api/billing/next-invoice-no
 *  Returns the next SAM-formatted invoice number for the logged-in user's store.
 */
app.get('/api/billing/next-invoice-no', requireAuth('billing', 'admin'), requireModule('pos', { roles: ['billing'] }), async (req, res) => {
  try {
    let storeCode = req.user.storeCode || '';
    if (!storeCode && req.user.storeId) {
      const store = await db.getStoreById(req.user.storeId);
      storeCode = store?.code || 'GEN';
    }
    const invoiceNo = await db.getNextInvoiceNumber(storeCode || 'GEN');
    res.json({ success: true, invoiceNo });
  } catch (err) {
    sendError(res, err, 'Next invoice number');
  }
});

app.get('/api/billing/invoices', requireAuth('billing', 'admin'), requireModule(['history', 'pos'], { roles: ['billing'] }), requireModule('orders'), async (req, res) => {
  try {
    const data = await db.getInvoices({ storeId: req.user.storeId });
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err, 'Invoice history');
  }
});

// ============================================================
// SUPPORT TICKETS
// ============================================================

const TICKET_STATUSES = ['Open', 'In Progress', 'Pending', 'Resolved', 'Closed', 'Rejected'];
const TICKET_STAFF_ROLES = ['admin', 'employee', 'delivery', 'billing'];
// Admins hold 'support-tickets', employees 'tickets' (superadminRoutes PORTAL_MODULES).
const ticketModule = requireModule(['support-tickets', 'tickets'], { roles: ['admin', 'employee'] });

function stampTime(date = new Date()) {
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function makeReply(senderName, senderRole, text) {
  const now = new Date();
  return { id: newId('REP'), senderName, senderRole, text, time: stampTime(now), createdAt: now.toISOString() };
}

// A farmer owns a ticket filed from their account, or (older, signed-out
// tickets) one filed with their phone number.
function ownsRecord(user, record) {
  if (!user || !record) return false;
  if (record.userId && record.userId === user.id) return true;
  const phone = normalizePhone(user.phone);
  return Boolean(phone && record.phone && normalizePhone(record.phone) === phone);
}

// Admins see every ticket; employees see tickets assigned to them plus the
// unassigned queue; delivery/billing staff only tickets assigned to them;
// farmers only their own.
function canSeeTicket(user, ticket) {
  if (user.role === 'superadmin' || user.role === 'admin') return true;
  if (user.role === 'employee') return !ticket.assignedToId || ticket.assignedToId === user.id;
  if (TICKET_STAFF_ROLES.includes(user.role)) return ticket.assignedToId === user.id;
  return ownsRecord(user, ticket);
}

async function findStaff(id) {
  const staff = id ? await db.getUserById(String(id)) : null;
  return staff && TICKET_STAFF_ROLES.includes(staff.role) ? staff : null;
}

app.get('/api/tickets', requireAuth(), ticketModule, async (req, res) => {
  try {
    const all = await db.getTickets();
    res.json({ success: true, data: all.filter(t => canSeeTicket(req.user, t)) });
  } catch (err) {
    sendError(res, err, 'Tickets');
  }
});

// Open to signed-out visitors (storefront help form); a signed-in farmer's
// ticket is tied to their account. Identity never comes from the body.
app.post('/api/tickets', async (req, res) => {
  try {
    const wait = await rateLimit(`ticket-ip:${clientIp(req)}`, 10, HOUR_MS);
    if (wait) return tooManyRequests(res, wait, 'Too many tickets from this connection. Please try again later.');

    const user = await getAuthenticatedUser(req);
    const { orderId, farmerName, phone, crop, subject, category, priority, description, orderItems } = req.body || {};
    const cleanSubject = cleanText(subject, 150);
    const cleanDescription = cleanText(description, 2000);

    if (!cleanSubject && !cleanDescription) {
      return res.status(400).json({ success: false, message: 'Please describe your query or problem.' });
    }

    const name = cleanText(farmerName, 80) || user?.name || 'Farmer';
    const now = new Date().toISOString();
    const newTicket = {
      id: newId('TCK'),
      orderId: cleanText(orderId, 50) || null,
      userId: user?.id || null,
      farmerName: name,
      phone: normalizePhone(phone) || normalizePhone(user?.phone) || '',
      crop: cleanText(crop, 60),
      subject: cleanSubject || 'Support Query',
      category: cleanText(category, 50) || 'General',
      priority: ['Low', 'Medium', 'High', 'Urgent'].includes(priority) ? priority : 'Medium',
      status: 'Open',
      assignedToId: null,
      assignedToName: 'Unassigned',
      assignedRole: null,
      assignedAt: null,
      orderItems: Array.isArray(orderItems)
        ? orderItems.slice(0, 50).map(item => ({ name: cleanText(item?.name, 120), qty: Number(item?.qty ?? item?.quantity) || 0 }))
        : [],
      attachment: null,
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
      replies: [makeReply(name, 'farmer', cleanDescription || cleanSubject)],
    };

    const created = await db.addTicket(newTicket);
    res.json({ success: true, message: 'Support ticket submitted successfully', ticket: created, data: created });
  } catch (err) {
    sendError(res, err, 'Create ticket');
  }
});

app.put('/api/tickets/:id/assign', requireAuth('admin'), ticketModule, async (req, res) => {
  try {
    const ticket = await db.getTicketById(req.params.id);
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
    const staff = await findStaff(req.body?.assignedToId);
    if (!staff) return res.status(400).json({ success: false, message: 'Choose a staff member to assign.' });

    await db.updateTicket(ticket.id, {
      assignedToId: staff.id,
      assignedToName: staff.name,
      assignedRole: staff.role,
      assignedAt: new Date().toISOString(),
      status: ticket.status === 'Open' ? 'In Progress' : ticket.status,
      updatedAt: new Date().toISOString(),
    });
    const updated = await db.addTicketReply(ticket.id, makeReply('System', 'system',
      `Ticket assigned to ${staff.name} (${staff.role.toUpperCase()}) by ${req.user.name}.`));
    res.json({ success: true, message: 'Ticket assigned successfully', data: updated });
  } catch (err) {
    sendError(res, err, 'Assign ticket');
  }
});

app.put('/api/tickets/:id/status', requireAuth('admin', 'employee'), ticketModule, async (req, res) => {
  try {
    const ticket = await db.getTicketById(req.params.id);
    if (!ticket || !canSeeTicket(req.user, ticket)) return res.status(404).json({ success: false, message: 'Ticket not found' });
    const status = TICKET_STATUSES.find(s => s.toLowerCase() === String(req.body?.status || '').toLowerCase());
    if (!status) return res.status(400).json({ success: false, message: 'Unknown ticket status.' });

    const now = new Date().toISOString();
    await db.updateTicket(ticket.id, { status, updatedAt: now, resolvedAt: status === 'Resolved' ? now : ticket.resolvedAt || null });
    const updated = await db.addTicketReply(ticket.id, makeReply('System', 'system', `Status changed to ${status.toUpperCase()} by ${req.user.name}.`));
    res.json({ success: true, data: updated });
  } catch (err) {
    sendError(res, err, 'Update status');
  }
});

app.post('/api/tickets/:id/replies', requireAuth(), ticketModule, async (req, res) => {
  try {
    const text = cleanText(req.body?.text, 2000);
    if (!text) return res.status(400).json({ success: false, message: 'Reply text cannot be empty' });
    const ticket = await db.getTicketById(req.params.id);
    if (!ticket || !canSeeTicket(req.user, ticket)) return res.status(404).json({ success: false, message: 'Ticket not found' });

    const role = req.user.role === 'farmer' ? 'farmer' : req.user.role;
    const updated = await db.addTicketReply(ticket.id, makeReply(req.user.name || 'User', role, text));
    if (role !== 'farmer' && ticket.status === 'Open') {
      await db.updateTicket(ticket.id, { status: 'In Progress' });
      updated.status = 'In Progress';
    }
    res.json({ success: true, data: updated });
  } catch (err) {
    sendError(res, err, 'Add reply');
  }
});

// ============================================================
// AGRONOMY EXPERTS & CALLBACK BOOKINGS
// ============================================================

const DEFAULT_EXPERT_SLOTS = ['10:00 AM - 12:00 PM', '02:00 PM - 04:00 PM', '04:00 PM - 06:00 PM'];

function cleanList(value, maxItems, maxLen) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return list.map(item => cleanText(item, maxLen)).filter(Boolean).slice(0, maxItems);
}

// Public card for the storefront. Staff profiles also hold KYC and bank
// details, so only these fields may leave the server.
function publicExpert(staff) {
  const p = staff.profile || {};
  const pick = key => staff[key] ?? p[key];
  return {
    id: staff.id,
    employeeId: staff.id,
    name: staff.name,
    avatar: p.profilePhoto || staff.profilePhoto || null,
    qualification: pick('qualification') || '',
    specialization: pick('specialization') || '',
    experienceYears: Number(pick('experienceYears')) || null,
    languages: cleanList(pick('languages'), 10, 30),
    cropsExpertise: cleanList(pick('cropsExpertise'), 20, 40),
    availableDays: pick('availableDays') || 'Monday - Saturday',
    availableSlots: cleanList(pick('availableSlots'), 10, 40).length ? cleanList(pick('availableSlots'), 10, 40) : DEFAULT_EXPERT_SLOTS,
    bio: pick('bio') || '',
    isAgronomyExpert: true,
    active: true,
  };
}

app.get('/api/agronomy-experts', async (req, res) => {
  try {
    const experts = await db.getAgronomyExperts();
    res.json({ success: true, data: experts.filter(s => !s.status || s.status === 'active').map(publicExpert) });
  } catch (err) {
    sendError(res, err, 'Agronomy experts');
  }
});

app.put('/api/admin/employees/:id/agronomy-expert', requireAuth('admin'), requireModule('employees'), async (req, res) => {
  try {
    const staff = await findStaff(req.params.id);
    if (!staff) return res.status(404).json({ success: false, message: 'Staff member not found' });
    const b = req.body || {};
    const details = {};
    if (b.specialization !== undefined) details.specialization = cleanText(b.specialization, 120);
    if (b.qualification !== undefined) details.qualification = cleanText(b.qualification, 120);
    if (b.bio !== undefined) details.bio = cleanText(b.bio, 1000);
    if (b.experienceYears !== undefined) details.experienceYears = Math.max(0, Math.min(60, Number(b.experienceYears) || 0));
    if (b.languages !== undefined) details.languages = cleanList(b.languages, 10, 30);
    if (b.cropsExpertise !== undefined) details.cropsExpertise = cleanList(b.cropsExpertise, 20, 40);
    await db.setEmployeeAgronomyExpert(staff.id, Boolean(b.isAgronomyExpert), details);
    res.json({ success: true, message: 'Agronomy expert designation updated' });
  } catch (err) {
    sendError(res, err, 'Toggle agronomy expert');
  }
});

// Only a signed-in account can book, and the booking is tied to it.
app.post('/api/agronomy-bookings', requireAuth(), async (req, res) => {
  try {
    const wait = await rateLimit(`agro-booking:${req.user.id}`, 10, HOUR_MS);
    if (wait) return tooManyRequests(res, wait, 'Too many bookings. Please try again later.');

    const { expertId, crop, acreage, preferredDate, preferredSlot, topic, notes, phone } = req.body || {};
    const expert = (await db.getAgronomyExperts()).find(e => e.id === expertId);
    if (!expert) return res.status(400).json({ success: false, message: 'Please choose an available expert.' });
    const farmerPhone = normalizePhone(phone) || normalizePhone(req.user.phone);
    if (!farmerPhone) return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit phone number.' });

    const booking = {
      id: newId('AGR'),
      expertId: expert.id,
      expertName: expert.name,
      userId: req.user.id,
      farmerName: req.user.name || 'Farmer',
      farmerPhone,
      crop: cleanText(crop, 50) || 'General Crops',
      acreage: Math.max(0, Math.min(10000, Number(acreage) || 1)),
      preferredDate: cleanText(preferredDate, 30),
      preferredSlot: cleanText(preferredSlot, 50),
      topic: cleanText(topic, 100) || 'General Agronomy Advisory',
      notes: cleanText(notes, 1000),
      status: 'Scheduled',
      callbackCompleted: false,
      callbackNotes: null,
      createdAt: new Date().toISOString(),
    };
    const created = await db.addAgronomyBooking(booking);
    res.json({ success: true, message: 'Consultation callback booked successfully', data: created });
  } catch (err) {
    sendError(res, err, 'Book agronomy consultation');
  }
});

// Admins see all bookings, an expert sees bookings made with them, and
// everyone else sees their own.
app.get('/api/agronomy-bookings', requireAuth(), async (req, res) => {
  try {
    const role = req.user.role;
    const filter = role === 'admin' || role === 'superadmin' ? {}
      : TICKET_STAFF_ROLES.includes(role) ? { expertId: req.user.id }
      : { userId: req.user.id };
    const data = await db.getAgronomyBookings(filter);
    data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err, 'Get agronomy bookings');
  }
});

app.put('/api/agronomy-bookings/:id/complete', requireAuth('admin', 'employee'), async (req, res) => {
  try {
    const booking = await db.getAgronomyBookingById(req.params.id);
    const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
    if (!booking || (!isAdmin && booking.expertId !== req.user.id)) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    const updated = await db.updateAgronomyBooking(booking.id, {
      status: 'Completed',
      callbackCompleted: true,
      callbackNotes: cleanText(req.body?.callbackNotes, 2000),
      completedAt: new Date().toISOString(),
      completedBy: req.user.name,
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    sendError(res, err, 'Complete agronomy booking');
  }
});

// ============================================================
// SOIL TEST REPORTS
// ============================================================

const SOIL_STATUSES = ['Pending Review', 'Under Agronomist Analysis', 'Prescription Issued', 'Completed', 'Rejected'];
// Admins hold 'soil-reports' as a module key; so do employees.
const soilModule = requireModule('soil-reports', { roles: ['admin', 'employee'] });

function canSeeSoilReport(user, report) {
  if (user.role === 'superadmin' || user.role === 'admin') return true;
  if (TICKET_STAFF_ROLES.includes(user.role)) return report.assignedToId === user.id;
  return report.userId === user.id;
}

// Numbers and short labels only: a report is the farmer's lab values plus the
// analysis the page computed from them.
function cleanSoilValues(src = {}) {
  const num = v => (v === '' || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
  return {
    soilType: cleanText(src.soilType, 40),
    crop: cleanText(src.crop, 50),
    areaAcres: num(src.areaAcres),
    ph: num(src.ph), ec: num(src.ec), oc: num(src.oc),
    nitrogen: num(src.nitrogen), phosphorus: num(src.phosphorus), potassium: num(src.potassium),
    zinc: cleanText(src.zinc, 20), boron: cleanText(src.boron, 20), iron: cleanText(src.iron, 20), sulphur: cleanText(src.sulphur, 20),
    labName: cleanText(src.labName, 100),
    sampleDate: cleanText(src.sampleDate, 30),
    village: cleanText(src.village, 80),
    district: cleanText(src.district, 80),
    remarks: cleanText(src.remarks, 1000),
    score: num(src.score),
    grade: cleanText(src.grade, 20),
    uploadedFileName: cleanText(src.uploadedFileName, 120) || null,
    suggestedProducts: cleanList(src.suggestedProducts, 20, 120),
  };
}

app.post('/api/soil-reports', requireAuth(), async (req, res) => {
  try {
    const wait = await rateLimit(`soil-report:${req.user.id}`, 20, HOUR_MS);
    if (wait) return tooManyRequests(res, wait, 'Too many reports. Please try again later.');

    const body = req.body || {};
    // The analysis is display data computed in the browser; keep it bounded.
    const analysis = body.analysis && typeof body.analysis === 'object' ? body.analysis : null;
    if (analysis && JSON.stringify(analysis).length > 50000) {
      return res.status(413).json({ success: false, message: 'Report is too large.' });
    }
    const report = {
      id: newId('STR'),
      ...cleanSoilValues(body),
      analysis,
      userId: req.user.id,
      farmerName: cleanText(body.farmerName, 80) || req.user.name || 'Farmer',
      phone: normalizePhone(body.phone) || normalizePhone(req.user.phone) || '',
      status: 'Pending Review',
      assignedToId: null,
      assignedToName: null,
      assignedRole: null,
      assignedDesignation: null,
      assignedAt: null,
      agronomistNotes: '',
      createdAt: new Date().toISOString(),
    };
    const created = await db.addSoilReport(report);
    res.json({ success: true, data: created });
  } catch (err) {
    sendError(res, err, 'Save soil report');
  }
});

app.get('/api/soil-reports', requireAuth(), soilModule, async (req, res) => {
  try {
    const all = await db.getSoilReports();
    res.json({ success: true, data: all.filter(r => canSeeSoilReport(req.user, r)) });
  } catch (err) {
    sendError(res, err, 'Soil reports');
  }
});

app.put('/api/soil-reports/:id/assign', requireAuth('admin'), soilModule, async (req, res) => {
  try {
    const report = await db.getSoilReportById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
    const staff = await findStaff(req.body?.staffId);
    if (!staff) return res.status(400).json({ success: false, message: 'Choose a staff member to assign.' });

    const note = cleanText(req.body?.notes, 1000);
    const updated = await db.updateSoilReport(report.id, {
      assignedToId: staff.id,
      assignedToName: staff.name,
      assignedRole: staff.role,
      assignedDesignation: cleanText(req.body?.staffDesignation, 80) || null,
      assignedBy: req.user.name,
      assignedAt: new Date().toISOString(),
      status: report.status === 'Pending Review' ? 'Under Agronomist Analysis' : report.status,
      agronomistNotes: note
        ? (report.agronomistNotes ? `${report.agronomistNotes}\n[${new Date().toLocaleDateString('en-IN')}] ${note}` : note)
        : report.agronomistNotes,
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    sendError(res, err, 'Assign soil report');
  }
});

app.put('/api/soil-reports/:id/status', requireAuth('admin', 'employee'), soilModule, async (req, res) => {
  try {
    const report = await db.getSoilReportById(req.params.id);
    if (!report || !canSeeSoilReport(req.user, report)) return res.status(404).json({ success: false, message: 'Report not found' });
    const b = req.body || {};
    const updates = { updatedAt: new Date().toISOString() };
    if (b.status !== undefined) {
      const status = SOIL_STATUSES.find(s => s === b.status);
      if (!status) return res.status(400).json({ success: false, message: 'Unknown report status.' });
      updates.status = status;
      if (status === 'Prescription Issued' || status === 'Completed') updates.resolvedAt = updates.updatedAt;
    }
    if (b.agronomistNotes !== undefined) updates.agronomistNotes = cleanText(b.agronomistNotes, 4000);
    if (Array.isArray(b.suggestedProducts)) updates.suggestedProducts = cleanList(b.suggestedProducts, 20, 120);
    const updated = await db.updateSoilReport(report.id, updates);
    res.json({ success: true, data: updated });
  } catch (err) {
    sendError(res, err, 'Update soil report');
  }
});

// ============================================================
// CHAT
// ============================================================

app.get('/api/chat/records', requireAuth('admin', 'employee'), async (req, res) => {
  try {
    const data = await db.getChatRecords();
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err, 'Chat records');
  }
});

// ============================================================
// STAFF PROFILE (employee self-service + admin viewer)
// ============================================================

// GET /api/staff-profile  — logged-in employee fetches their own profile
app.get('/api/staff-profile', requireAuth('employee', 'admin', 'superadmin', 'delivery', 'billing'), async (req, res) => {
  try {
    const profile = await db.getStaffProfile(req.user.id);
    res.json({ success: true, data: profile || {} });
  } catch (err) {
    sendError(res, err, 'Get staff profile');
  }
});

// PUT /api/staff-profile  — employee saves / updates their profile
app.put('/api/staff-profile', requireAuth('employee', 'admin', 'superadmin', 'delivery', 'billing'), async (req, res) => {
  try {
    const profile = await db.upsertStaffProfile(req.user.id, req.body || {});
    await recordActivity(req, {
      module: 'staff-profile',
      action: 'update',
      entityId: req.user.id,
      description: `${req.user.name} updated their staff profile`,
    });
    res.json({ success: true, data: profile });
  } catch (err) {
    sendError(res, userInputError(err), 'Update staff profile');
  }
});

// GET /api/admin/staff-profiles  — admin or superadmin views all staff profiles
app.get('/api/admin/staff-profiles', requireAuth('admin', 'superadmin'), requireModule('employees'), async (req, res) => {
  try {
    const storeId = req.query.storeId || (req.user.role === 'admin' ? req.user.storeId : undefined);
    const profiles = await db.listStaffProfiles(storeId ? { storeId } : {});
    res.json({ success: true, data: profiles });
  } catch (err) {
    sendError(res, err, 'List staff profiles');
  }
});

// GET /api/admin/staff-profiles/:userId  — admin views one specific staff profile
app.get('/api/admin/staff-profiles/:userId', requireAuth('admin', 'superadmin'), requireModule('employees'), async (req, res) => {
  try {
    const profile = await db.getStaffProfile(req.params.userId);
    res.json({ success: true, data: profile || {} });
  } catch (err) {
    sendError(res, err, 'Get staff profile by id');
  }
});

// ============================================================
// FALLBACKS
// ============================================================

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

// Serve the built front-end. On Vercel the platform served dist/ itself and the
// API ran as a function; on a plain Node host (Hostinger) this one process has
// to do both, so anything that is not /api and not /uploads is answered from
// the Vite build, with index.html as the fallback for client-side routes.
const DIST_DIR = process.env.DIST_DIR || path.join(__dirname, '..', 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, {
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
  console.log(`🗂  serving front-end from ${DIST_DIR}`);
} else {
  console.warn(`⚠️  ${DIST_DIR} does not exist — run \`npm run build\` before starting. API routes still work.`);
}

// Malformed JSON and anything thrown outside a route's own try/catch still get
// a clean JSON response with no stack trace.
app.use((err, req, res, _next) => {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Invalid JSON body.' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request is too large.' });
  }
  sendError(res, err, 'Unhandled');
});

// ============================================================
// START SERVER
// ============================================================

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Sathyam Agro Mart Engine running with persistent DB on port ${PORT}`);
    console.log(`📱 WhatsApp OTP system enabled`);
    if (OTP_LIMITS_OFF) console.log('⚠️  hourly OTP caps OFF (OTP_RATE_LIMITS=off) — local testing only; the 30-60s resend wait still applies');
  });
}

// ============================================================
// EXPORT APP
// ============================================================

export default app;
