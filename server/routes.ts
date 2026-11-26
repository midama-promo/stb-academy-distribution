import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import os from 'os';
import { execFileSync } from 'child_process';
import {
  db,
  hashPassword,
  generateToken,
  generateRefNumber,
  createSessionToken,
  verifySessionToken,
  DESIGNATED_ADMIN_EMAILS,
  SUPER_ADMIN_EMAIL,
  isSuperAdminEmail,
  UPLOADS_DIR,
  ARTWORK_DIR,
  AUDIO_DIR,
  DOCUMENTS_DIR,
} from './db.ts';
import type {
  User,
  Release,
  ReleaseStatus,
  ReleaseDocumentItem,
  WithdrawalRequest,
  VevoApplication,
  VideoSubmission,
  ArtistCredit,
  SupportMessage,
} from './db.ts';
import { sendNotification, sendAdminReleaseEmail, sendAdminEnquiryEmail, sendAdminTakedownEmail, sendAdminVevoApplicationEmail, sendAdminVideoSubmissionEmail, sendVideoSubmissionStatusEmail, sendAnnouncementBatch } from './mailer.ts';
import { requestEmailOtp, verifyEmailOtp } from './otp.ts';
import {
  remotePersistenceConfigured,
  remoteStorageConfigured,
  remoteUploadFile,
  remoteSignedUrl,
  remoteSignedUrlForStoredName,
  encodeRemoteAssetPath,
  decodeRemoteAssetPath,
  remoteObjectPathFromStoredName,
  remoteCheckDatabase,
  remoteCheckStorage,
  remoteCheckAuth,
} from './remote.ts';

export const apiRouter = express.Router();

// Application-side OTP throttling adds a per-IP and per-email defense layer.
const otpRequestByKey = new Map<string, number>();
const otpVerifyAttempts = new Map<string, { count: number; resetAt: number }>();
const OTP_REQUEST_COOLDOWN_MS = 60_000;
const OTP_VERIFY_WINDOW_MS = 10 * 60_000;
const OTP_MAX_VERIFY_ATTEMPTS = 8;

function normalizeAuthEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  return req.ip || 'unknown';
}

function setSessionCookie(res: Response, token: string, maxAgeMs = 24 * 60 * 60 * 1000) {
  res.cookie('stbacademy_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || Boolean(process.env.K_SERVICE),
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs,
  });
}

function clearSessionCookie(res: Response) {
  res.clearCookie('stbacademy_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || Boolean(process.env.K_SERVICE),
    sameSite: 'lax',
    path: '/',
  });
}

// Multer storage for artwork
const artworkStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ARTWORK_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `art_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    cb(null, safeName);
  }
});

// Multer storage for audio masters (MP3 only)
const audioStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AUDIO_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `track_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    cb(null, safeName);
  }
});

// Multer storage for supporting documents (PDF, DOCX, TXT)
const documentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DOCUMENTS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    cb(null, safeName);
  }
});

const uploadDocument = multer({
  storage: documentStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.pdf', '.doc', '.docx', '.txt', '.csv', '.rtf'];
    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid document format. Only PDF, DOC, DOCX, TXT, CSV files are accepted.'));
    }
  }
});

const uploadArtwork = multer({
  storage: artworkStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg'];
    if (allowed.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Invalid artwork format. Only JPG/JPEG and PNG image files are accepted.'));
    }
  }
});

const VIDEO_DIR = path.join(UPLOADS_DIR, 'videos');
fs.mkdirSync(VIDEO_DIR, { recursive: true });
const videoStorage = multer.diskStorage({ destination: (_req, _file, cb) => cb(null, VIDEO_DIR), filename: (_req, file, cb) => cb(null, `video_${Date.now()}_${Math.random().toString(36).slice(2,8)}${path.extname(file.originalname).toLowerCase()}`) });
const uploadVideo = multer({ storage: videoStorage, limits: { fileSize: 500 * 1024 * 1024 }, fileFilter: (_req, file, cb) => { const ext = path.extname(file.originalname).toLowerCase(); if (['.mp4','.mov','.m4v'].includes(ext) || ['video/mp4','video/quicktime','video/x-m4v'].includes(file.mimetype.toLowerCase())) cb(null, true); else cb(new Error('Upload an MP4, MOV or M4V video file.')); } });

const uploadAudio = multer({
  storage: audioStorage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const accepted = name.endsWith('.mp3') || ['audio/mpeg','audio/mp3'].includes(file.mimetype.toLowerCase());
    if (accepted) cb(null, true);
    else cb(new Error('Only MP3 master files are accepted for audio submissions.'));
  }
});

// Helper auth middleware
interface AuthenticatedRequest extends Request {
  user?: User;
  impersonatedBy?: string;
}

export function getAuthTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  if (req.query && typeof req.query.token === 'string' && req.query.token.length > 20) {
    return req.query.token;
  }
  const cookies = req.headers.cookie;
  if (cookies) {
    const match = cookies.match(/(?:^|;\s*)stbacademy_token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = getAuthTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  const verified = verifySessionToken(token);
  if (!verified) {
    return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }
  const user = db.findUserById(verified.userId);

  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }

  req.user = user;
  req.impersonatedBy = verified.impersonatedBy;
  next();
}

function isOwnedUploadedAsset(userId: string, folder: 'audio' | 'artwork', storedFilename: string, fileUrl: string): boolean {
  if (!storedFilename || !fileUrl) return false;
  if (remoteStorageConfigured) {
    if (!storedFilename.startsWith(`r2:${userId}/${folder}/`)) return false;
    const objectPath = storedFilename.slice(3);
    return fileUrl === `/api/assets/${encodeRemoteAssetPath(objectPath)}`;
  }
  const filename = path.basename(storedFilename);
  return filename === storedFilename && fileUrl === `/uploads/${folder}/${filename}`;
}

function activeClientOnly(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.user?.role === 'client' && req.user.status === 'disabled') {
    return res.status(403).json({
      error: req.user.disabledReason
        ? `Your STB Academy account is currently banned / terminated. Reason: ${req.user.disabledReason}`
        : 'Your STB Academy account is currently banned / terminated. Please contact STB Academy administration.',
      code: 'ACCOUNT_DISABLED',
      reason: req.user.disabledReason || null,
    });
  }
  next();
}

function adminOnly(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || !DESIGNATED_ADMIN_EMAILS.includes(req.user.email.toLowerCase())) {
    return res.status(403).json({ error: 'Access denied. Administrative privilege required.' });
  }
  next();
}

function superAdminOnly(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || !isSuperAdminEmail(req.user.email)) {
    return res.status(403).json({ error: 'This action is not available to this account.' });
  }
  next();
}

// Artist records are stored on the owning client account in the authoritative Neon state.
// A single saved artist can be used as either a primary or featured artist on any release.
function upsertClientArtistLibrary(userId: string, incoming: Array<Partial<ArtistCredit> & { name?: string }>): ArtistCredit[] {
  return db.upsertUserArtists(userId, incoming);
}

function artistCreditsFromNames(primary: string[], featured: string[]): ArtistCredit[] {
  return [
    ...primary.map(name => ({ name, role: 'primary' as const })),
    ...featured.map(name => ({ name, role: 'featured' as const })),
  ];
}

const PLAN_CONFIG = {
  free: { id: 'free' as const, name: 'Unlimited Artist Access', amountZar: 0, amountKobo: 0, monthlyReleaseLimit: null as number | null, artistLimit: null as number | null },
  starter: { id: 'starter' as const, name: 'Legacy Unlimited', amountZar: 0, amountKobo: 0, monthlyReleaseLimit: null as number | null, artistLimit: null as number | null },
};
type PaidPlanId = 'starter';

function effectivePlanId(_user: User): 'free' { return 'free'; }

function releaseArtistNames(release: Release): string[] {
  const names: string[] = [
    ...(release.primaryArtists || []), ...(release.featuredArtists || []),
    ...(release.primaryArtistProfiles || []).map((p: any) => p.name),
    ...(release.featuredArtistProfiles || []).map((p: any) => p.name),
    ...(release.artistProfiles || []).map((p: any) => p.name),
  ];
  for (const track of release.tracks || []) {
    if (track.primaryArtist) names.push(track.primaryArtist);
    names.push(...(track.featuredArtists || []));
    names.push(...(track.artistProfiles || []).map((p: any) => p.name));
  }
  return names.map(n => String(n || '').trim()).filter(Boolean);
}

function planUsage(user: User) {
  const planId = effectivePlanId(user);
  const plan = PLAN_CONFIG[planId];
  const allUserReleases = db.getReleases().filter(r => r.userId === user.id);
  const now = Date.now();
  const windowStart = now - 30 * 24 * 60 * 60 * 1000;
  const monthlyReleases = allUserReleases.filter(r => new Date(r.submittedAt).getTime() >= windowStart);
  const artistNames = new Set([...(user.artistName || user.name ? [user.artistName || user.name] : []), ...allUserReleases.flatMap(releaseArtistNames)].map(n => n.toLocaleLowerCase()));
  return {
    planId,
    planName: plan.name,
    planExpiresAt: planId === 'free' ? null : user.planExpiresAt || null,
    usage: { releasesThisMonth: monthlyReleases.length, artists: artistNames.size },
    limits: { releasesPerMonth: plan.monthlyReleaseLimit, artists: plan.artistLimit },
  };
}

function applyPaidPlan(userId: string, planId: PaidPlanId, reference: string): User | undefined {
  const user = db.findUserById(userId);
  if (!user || user.role !== 'client') return undefined;
  if (user.lastPaymentReference === reference) return user;
  const now = Date.now();
  const currentExpiry = user.planExpiresAt ? new Date(user.planExpiresAt).getTime() : 0;
  const base = Number.isFinite(currentExpiry) && currentExpiry > now ? currentExpiry : now;
  const expiresAt = new Date(base + 30 * 24 * 60 * 60 * 1000).toISOString();
  return db.updateUser(user.id, {
    planId,
    planExpiresAt: expiresAt,
    planActivatedAt: new Date().toISOString(),
    lastPaymentReference: reference,
  });
}

async function verifyPaystackTransaction(reference: string) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error('Paystack is not configured on the server yet. Add PAYSTACK_SECRET_KEY to your hosting environment.');
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' },
  });
  const result: any = await response.json().catch(() => ({}));
  if (!response.ok || !result?.status) throw new Error(result?.message || 'Paystack could not verify this payment.');
  return result.data;
}

function activateFromVerifiedTransaction(data: any, expectedUserId: string) {
  const metadata = data?.metadata || {};
  const userId = String(metadata.user_id || metadata.userId || '');
  const planId = String(metadata.plan_id || metadata.planId || '') as PaidPlanId;
  if (data?.status !== 'success') throw new Error('Payment has not been completed successfully.');
  if (userId !== expectedUserId) throw new Error('This payment does not belong to the signed-in account.');
  if (!(planId in PLAN_CONFIG)) throw new Error('The paid plan on this transaction is invalid.');
  const plan = PLAN_CONFIG[planId];
  if (Number(data.amount) !== plan.amountKobo || String(data.currency || '').toUpperCase() !== 'ZAR') {
    throw new Error('Payment amount or currency does not match the selected plan.');
  }
  const customerEmail = String(data.customer?.email || '').toLowerCase();
  const user = db.findUserById(expectedUserId);
  if (!user || customerEmail !== user.email.toLowerCase()) throw new Error('The payment email does not match your account email.');
  const activated = applyPaidPlan(user.id, planId, String(data.reference || ''));
  if (!activated) throw new Error('Could not activate the plan for this account.');
  return activated;
}

// Paid-plan purchases remain deliberately disabled until STB Academy confirms Paystack business approval.
// Re-enable only after approval and an end-to-end test of live checkout, verification, and webhooks.
const PAYSTACK_PLAN_PURCHASES_ENABLED = false;

// Paystack checkout initialization. Amounts and plan entitlements are always determined server-side.
apiRouter.post('/payments/paystack/initialize', authMiddleware, activeClientOnly, async (req: AuthenticatedRequest, res: Response) => {
  if (!PAYSTACK_PLAN_PURCHASES_ENABLED) return res.status(503).json({ error: 'STB Academy has no paid subscription plans. Artist and release access is unlimited.' });
  const user = req.user!;
  if (user.role !== 'client') return res.status(403).json({ error: 'Only client accounts can purchase a plan.' });
  const planId = String(req.body?.planId || '') as PaidPlanId;
  if (planId !== 'starter') return res.status(400).json({ error: 'Paid subscription plans are not available on STB Academy.' });
  if (!process.env.PAYSTACK_SECRET_KEY) return res.status(503).json({ error: 'Paystack is not configured yet. Add PAYSTACK_SECRET_KEY to the server environment before accepting payments.' });
  try {
    const plan = PLAN_CONFIG[planId];
    const reference = `stbacademy_${user.id}_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
    const baseUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        email: user.email,
        amount: plan.amountKobo,
        currency: 'ZAR',
        reference,
        callback_url: `${baseUrl}/?payment=paystack&reference=${encodeURIComponent(reference)}`,
        metadata: { user_id: user.id, plan_id: plan.id, plan_name: plan.name, billing_period_days: 30, service: 'STB Academy - Distribution music distribution' },
      }),
    });
    const result: any = await response.json().catch(() => ({}));
    if (!response.ok || !result?.status || !result?.data?.authorization_url) {
      console.error('[Paystack] Initialize failed:', result?.message || response.status);
      return res.status(502).json({ error: result?.message || 'Paystack could not start checkout. Please try again.' });
    }
    return res.json({ authorizationUrl: result.data.authorization_url, reference, planId, amount: plan.amountZar });
  } catch (error: any) {
    console.error('[Paystack] Initialize error:', error?.message || error);
    return res.status(502).json({ error: 'Could not connect to Paystack. Please try again shortly.' });
  }
});

apiRouter.get('/payments/plan', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  if (req.user!.role !== 'client') return res.status(403).json({ error: 'This endpoint is for client accounts.' });
  return res.json(planUsage(req.user!));
});

apiRouter.post('/payments/paystack/verify', authMiddleware, activeClientOnly, async (req: AuthenticatedRequest, res: Response) => {
  if (!PAYSTACK_PLAN_PURCHASES_ENABLED) return res.status(503).json({ error: 'STB Academy has no paid subscription plans. Artist and release access is unlimited.' });
  const reference = typeof req.body?.reference === 'string' ? req.body.reference.trim() : '';
  if (!reference) return res.status(400).json({ error: 'Payment reference is required.' });
  try {
    const data = await verifyPaystackTransaction(reference);
    const updated = activateFromVerifiedTransaction(data, req.user!.id);
    const { passwordHash: _passwordHash, ...safeUser } = updated;
    return res.json({ message: 'Payment verified and plan activated.', user: safeUser, plan: planUsage(updated) });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Could not verify payment.' });
  }
});

apiRouter.post('/payments/paystack/webhook', (req: Request, res: Response) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const signature = req.header('x-paystack-signature') || '';
  const rawBody = (req as any).rawBody as Buffer | undefined;
  if (!secret || !rawBody || !signature) return res.status(400).send('Invalid webhook request.');
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  const received = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (received.length !== expectedBuffer.length || !crypto.timingSafeEqual(received, expectedBuffer)) return res.status(401).send('Invalid signature.');
  const event = req.body;
  if (PAYSTACK_PLAN_PURCHASES_ENABLED && event?.event === 'charge.success') {
    try {
      const metadata = event?.data?.metadata || {};
      const userId = String(metadata.user_id || metadata.userId || '');
      if (userId) activateFromVerifiedTransaction(event.data, userId);
    } catch (error: any) {
      console.error('[Paystack webhook] Could not activate plan:', error?.message || error);
      // Acknowledge signed events; the user can still verify from the callback page.
    }
  }
  return res.status(200).json({ received: true });
});

// ----------------------------------------------------
// AUTH ROUTES
// ----------------------------------------------------

apiRouter.get('/site-settings', (_req: Request, res: Response) => {
  const settings = (db.getAuthoritativeData() as any).siteSettings || { logoUrl: '', socialLinks: [] };
  res.json({ settings });
});

apiRouter.put('/admin/site-settings', authMiddleware, adminOnly, (req: AuthenticatedRequest, res: Response) => {
  const logoUrl = String(req.body?.logoUrl || '').trim();
  if (logoUrl && ((!/^https:\/\//i.test(logoUrl) && !/^\/api\/assets\/[A-Za-z0-9_-]+$/.test(logoUrl)) || logoUrl.length > 2000)) return res.status(400).json({ error: 'Logo must be a valid HTTPS image URL or an uploaded STB Academy logo asset.' });
  const incoming = Array.isArray(req.body?.socialLinks) ? req.body.socialLinks : [];
  if (incoming.length > 12) return res.status(400).json({ error: 'A maximum of 12 social links is allowed.' });
  const socialLinks = incoming.map((item: any) => ({ platform: String(item?.platform || '').trim().slice(0,40), url: String(item?.url || '').trim().slice(0,2000) })).filter((item: any) => item.platform && /^https:\/\//i.test(item.url));
  db.mutate((data: any) => { data.siteSettings = { logoUrl, socialLinks }; });
  res.json({ message: 'Website branding settings saved.', settings: { logoUrl, socialLinks } });
});

apiRouter.post('/admin/site-settings/logo', authMiddleware, adminOnly, uploadArtwork.single('artwork'), (req: AuthenticatedRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a JPG or PNG logo image.' });
  if (!remoteStorageConfigured) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(503).json({ error: 'Cloudflare R2 must be configured before uploading a public website logo.' });
  }
  const objectPath = `site-branding/${req.file.filename}`;
  remoteUploadFile(req.file.path, objectPath, req.file.mimetype || 'image/png');
  try { fs.unlinkSync(req.file.path); } catch (_) {}
  const logoUrl = `/api/assets/${encodeRemoteAssetPath(objectPath)}`;
  db.mutate((data: any) => { data.siteSettings = { ...(data.siteSettings || { socialLinks: [] }), logoUrl }; });
  res.json({ message: 'Website logo uploaded and saved.', logoUrl });
});


// Support chat API (previously called by the UI but missing from the Express router).
apiRouter.get('/messages', authMiddleware, activeClientOnly, (req: AuthenticatedRequest, res: Response) => {
  if (req.user!.role !== 'client') return res.status(403).json({ error: 'Client account required.' });
  return res.json({ messages: db.getSupportMessages(req.user!.id) });
});
apiRouter.post('/messages', authMiddleware, activeClientOnly, (req: AuthenticatedRequest, res: Response) => {
  if (req.user!.role !== 'client' || req.impersonatedBy) return res.status(403).json({ error: 'Only the signed-in artist can send support messages.' });
  const message = String(req.body?.message || '').trim().slice(0, 4000);
  if (!message) return res.status(400).json({ error: 'Write a message before sending.' });
  const saved: SupportMessage = { id: `msg_${crypto.randomUUID()}`, userId: req.user!.id, userEmail: req.user!.email, userName: req.user!.name, senderRole: 'client', senderEmail: req.user!.email, message, createdAt: new Date().toISOString() };
  db.addSupportMessage(saved);
  return res.status(201).json({ message: saved });
});
apiRouter.get('/admin/messages', authMiddleware, adminOnly, (req: AuthenticatedRequest, res: Response) => {
  const all = db.getSupportMessages();
  const grouped = new Map<string, SupportMessage[]>();
  for (const item of all) grouped.set(item.userId, [...(grouped.get(item.userId) || []), item]);
  const threads = [...grouped.entries()].map(([userId, messages]) => ({ userId, userName: messages[0].userName, userEmail: messages[0].userEmail, messages }));
  return res.json({ threads });
});
apiRouter.post('/admin/messages/:userId', authMiddleware, adminOnly, (req: AuthenticatedRequest, res: Response) => {
  const target = db.findUserById(req.params.userId);
  if (!target || target.role !== 'client') return res.status(404).json({ error: 'Client account not found.' });
  const message = String(req.body?.message || '').trim().slice(0, 4000);
  if (!message) return res.status(400).json({ error: 'Write a message before sending.' });
  const saved: SupportMessage = { id: `msg_${crypto.randomUUID()}`, userId: target.id, userEmail: target.email, userName: target.name, senderRole: 'admin', senderEmail: req.user!.email, message, createdAt: new Date().toISOString() };
  db.addSupportMessage(saved);
  return res.status(201).json({ message: saved });
});

apiRouter.get('/auth/config', (_req: Request, res: Response) => res.json({ provider: 'resend', otpLength: 6 }));

apiRouter.post('/auth/request-otp', async (req: Request, res: Response) => {
  const email = normalizeAuthEmail(req.body?.email);
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const key = `${clientIp(req)}:${email}`;
  const now = Date.now();
  const last = otpRequestByKey.get(key) || 0;
  if (now - last < OTP_REQUEST_COOLDOWN_MS) {
    const remainingSecs = Math.max(1, Math.ceil((OTP_REQUEST_COOLDOWN_MS - (now - last)) / 1000));
    return res.status(429).json({ error: `Please wait ${remainingSecs} seconds before requesting another login code.` });
  }
  otpRequestByKey.set(key, now);
  const user = db.findUserByEmail(email);
  // Return the same response for unknown accounts to avoid account enumeration.
  if (user && user.status !== 'disabled') {
    try { await requestEmailOtp(email); }
    catch (error: any) {
      otpRequestByKey.delete(key);
      console.error('[AUTH OTP] Resend delivery failed:', error?.message || error);
      return res.status(502).json({ error: 'We could not send your login code. Please try again later.' });
    }
  }
  return res.json({ message: 'If this email is registered with STB Academy, a one-time login code has been sent. Check your inbox and spam folder.' });
});

// Public artist registration. New accounts are verified by the existing email OTP flow.
apiRouter.post('/auth/register-artist', async (req: Request, res: Response) => {
  const email = normalizeAuthEmail(req.body?.email);
  const name = String(req.body?.name || '').trim().slice(0,180);
  const realFirstName = String(req.body?.realFirstName || '').trim().slice(0,90);
  const realSurname = String(req.body?.realSurname || '').trim().slice(0,90);
  const artistName = String(req.body?.artistName || '').trim().slice(0,180);
  const phone = String(req.body?.phone || '').trim().slice(0,40);
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!realFirstName || !realSurname || !artistName) return res.status(400).json({ error: 'Your real first name, surname and artist name are required.' });
  if (DESIGNATED_ADMIN_EMAILS.includes(email)) return res.status(409).json({ error: 'This email is reserved for STB Academy administration.' });
  if (db.findUserByEmail(email)) return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
  const user: User = { id: `usr_${crypto.randomUUID()}`, email, name: `${realFirstName} ${realSurname}`, realFirstName, realSurname, artistName, role: 'client', passwordHash: hashPassword(crypto.randomBytes(32).toString('hex')), status: 'active', createdAt: new Date().toISOString(), phone, country: String(req.body?.country || 'South Africa').slice(0,80), adminRoyaltyAllocation: 0 };
  db.createUser(user);
  try { await requestEmailOtp(email); }
  catch (error:any) { db.deleteUser(user.id); console.error('[AUTH REGISTER] OTP send failed:', error?.message || error); return res.status(502).json({ error: 'Account could not be verified because the email code could not be sent. Please try again later.' }); }
  return res.status(201).json({ message: 'Artist account created. A six-digit verification code has been sent to your email.', email });
});

apiRouter.post('/auth/verify-otp', async (req: Request, res: Response) => {
  const email = normalizeAuthEmail(req.body?.email);
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the 6-digit code sent to your email.' });

  const key = `${clientIp(req)}:${email}`;
  const now = Date.now();
  const existing = otpVerifyAttempts.get(key);
  if (!existing || existing.resetAt <= now) otpVerifyAttempts.set(key, { count: 0, resetAt: now + OTP_VERIFY_WINDOW_MS });
  const state = otpVerifyAttempts.get(key)!;
  if (state.count >= OTP_MAX_VERIFY_ATTEMPTS) return res.status(429).json({ error: 'Too many incorrect code attempts. Please request a new code and try again later.' });

  try { await verifyEmailOtp(email, code); }
  catch (error: any) {
    state.count += 1;
    return res.status(401).json({ error: 'The code is invalid or has expired. Please request a new code.' });
  }

  const user = db.findUserByEmail(email);
  if (!user || user.status === 'disabled') {
    clearSessionCookie(res);
    return res.status(403).json({ error: 'This email is not authorized to access STB Academy.' });
  }
  const role = DESIGNATED_ADMIN_EMAILS.includes(email) ? 'admin' : 'client';
  if (user.role !== role) db.updateUser(user.id, { role });
  otpVerifyAttempts.delete(key);
  const token = createSessionToken(user.id);
  setSessionCookie(res, token);
  const { passwordHash: _passwordHash, ...safeUser } = { ...user, role };
  return res.json({ token, user: safeUser });
});

apiRouter.post('/auth/logout', (_req: Request, res: Response) => {
  clearSessionCookie(res);
  return res.json({ message: 'Signed out.' });
});

apiRouter.get('/auth/me', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  const { passwordHash, ...safeUser } = req.user;
  res.json({ user: safeUser });
});

// Client self-report for Spotify for Artists profile claiming.
apiRouter.patch('/auth/spotify-profile-claim', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (req.user.role !== 'client') return res.status(403).json({ error: 'Only client accounts can update this confirmation.' });
  if (typeof req.body?.claimed !== 'boolean') {
    return res.status(400).json({ error: 'Please confirm whether you have claimed your Spotify for Artists profile.' });
  }

  const updated = db.updateUser(req.user.id, {
    spotifyProfileClaimed: req.body.claimed,
    spotifyProfileClaimedAt: req.body.claimed ? new Date().toISOString() : null,
  });
  if (!updated) return res.status(404).json({ error: 'Client account not found.' });
  const { passwordHash: _passwordHash, ...safeUser } = updated;
  return res.json({
    message: req.body.claimed ? 'Spotify profile claim marked as completed.' : 'Spotify profile claim marked as not yet completed.',
    user: safeUser,
  });
});

// Password creation/reset through a bare email is intentionally disabled.
// Authentication is email OTP based; this closes any previous password takeover path.
apiRouter.post('/auth/set-password', (_req: Request, res: Response) => {
  return res.status(410).json({ error: 'Password login has been retired. Use the email one-time login code instead.' });
});

apiRouter.post('/auth/reset-password-direct', (_req: Request, res: Response) => {
  return res.status(410).json({ error: 'Password login has been retired. Use the email one-time login code instead.' });
});

apiRouter.post('/auth/register-invite', (_req: Request, res: Response) => {
  return res.status(410).json({ error: 'Invitation activation is no longer available. Please sign in with your registered email or contact STB Academy administration.' });
});

apiRouter.post('/auth/forgot-password', (_req: Request, res: Response) => {
  return res.status(410).json({ error: 'Password recovery is no longer used. Sign in with an email one-time login code.' });
});

apiRouter.post('/auth/reset-password', (_req: Request, res: Response) => {
  return res.status(410).json({ error: 'Password recovery is no longer used. Sign in with an email one-time login code.' });
});

// ----------------------------------------------------
// FILE UPLOAD ROUTES (Artwork & MP3 Audio)
// ----------------------------------------------------

function detectImageDimensions(filePath: string, mime: string): { width: number; height: number } | null {
  const b = fs.readFileSync(filePath);
  if (mime === 'image/png' || b.subarray(0,8).toString('hex') === '89504e470d0a1a0a') {
    if (b.length >= 24) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    return null;
  }
  if (mime === 'image/jpeg' || b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i+1]; i += 2;
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (i + 1 >= b.length) break;
      const len = b.readUInt16BE(i);
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && i + 7 < b.length) {
        return { width: b.readUInt16BE(i+5), height: b.readUInt16BE(i+3) };
      }
      i += len;
    }
  }
  return null;
}

apiRouter.post('/upload/artwork', authMiddleware, activeClientOnly, uploadArtwork.single('artwork'), (req: AuthenticatedRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No artwork image file uploaded.' });
  }

  const detected = detectImageDimensions(req.file.path, req.file.mimetype);
  const parsedWidth = detected?.width;
  const parsedHeight = detected?.height;
  if (!parsedWidth || !parsedHeight) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(400).json({ error: 'Could not read artwork dimensions. Please upload a valid JPG/PNG image.' });
  }
  const ratio = parsedWidth && parsedHeight ? parsedWidth / parsedHeight : 0;
  const squareCover = parsedWidth === parsedHeight && parsedWidth >= 1500 && parsedWidth <= 3000;
  const widescreenVideoCover = Math.abs(ratio - (16 / 9)) < 0.02 && parsedWidth >= 1920 && parsedWidth <= 3840;
  if (!squareCover && !widescreenVideoCover) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(400).json({ error: `Artwork must be a square 1500–3000px audio cover or a 16:9 video cover between 1920×1080 and 3840×2160px (received ${parsedWidth}×${parsedHeight}px).` });
  }

  let storedFilename = req.file.filename;
  let fileUrl = `/uploads/artwork/${req.file.filename}`;
  if (remoteStorageConfigured) { const objectPath = `${req.user!.id}/artwork/${req.file.filename}`; remoteUploadFile(req.file.path, objectPath, req.file.mimetype || 'application/octet-stream'); try { fs.unlinkSync(req.file.path); } catch (_) {} storedFilename = `r2:${objectPath}`; fileUrl = `/api/assets/${encodeRemoteAssetPath(objectPath)}`; }
  res.json({
    success: true,
    message: 'Cover artwork uploaded successfully',
    filename: req.file.originalname,
    storedFilename,
    fileUrl,
    size: req.file.size,
    dimensions: parsedWidth && parsedHeight ? { width: parsedWidth, height: parsedHeight } : undefined
  });
});

apiRouter.post('/upload/audio', authMiddleware, activeClientOnly, (req: AuthenticatedRequest, res: Response, next: NextFunction) => { if (!req.user!.contractAcceptedAt) return res.status(409).json({ error: 'Sign the STB Academy Artist Distribution Agreement before uploading audio.', code: 'CONTRACT_REQUIRED' }); next(); }, uploadAudio.single('audio'), (req: AuthenticatedRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file uploaded.' });
  }

  const audioName = req.file.originalname.toLowerCase();
  if (!audioName.endsWith('.mp3')) { try { fs.unlinkSync(req.file.path); } catch (_) {} return res.status(400).json({ error: 'Only MP3 files can be uploaded through the portal.' }); }

  let storedFilename = req.file.filename;
  let fileUrl = `/uploads/audio/${req.file.filename}`;
  if (remoteStorageConfigured) { const objectPath = `${req.user!.id}/audio/${req.file.filename}`; remoteUploadFile(req.file.path, objectPath, 'audio/mpeg'); try { fs.unlinkSync(req.file.path); } catch (_) {} storedFilename = `r2:${objectPath}`; fileUrl = `/api/assets/${encodeRemoteAssetPath(objectPath)}`; }
  res.json({
    success: true,
    message: 'Optional MP3 reference file uploaded successfully',
    filename: req.file.originalname,
    storedFilename,
    fileUrl,
    fileSize: req.file.size,
  });
});

// Supporting Document Upload (PDF, DOCX, TXT, CSV)
apiRouter.post('/upload/document', authMiddleware, activeClientOnly, uploadDocument.single('document'), (req: AuthenticatedRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No document file uploaded.' });
  }

  let storedFilename = req.file.filename;
  let fileUrl = `/uploads/documents/${req.file.filename}`;
  if (remoteStorageConfigured) { const objectPath = `${req.user!.id}/documents/${req.file.filename}`; remoteUploadFile(req.file.path, objectPath, req.file.mimetype || 'application/octet-stream'); try { fs.unlinkSync(req.file.path); } catch (_) {} storedFilename = `r2:${objectPath}`; fileUrl = `/api/assets/${encodeRemoteAssetPath(objectPath)}`; }
  res.json({
    success: true,
    message: 'Supporting document uploaded successfully',
    filename: req.file.originalname,
    storedFilename,
    fileUrl,
    fileSize: req.file.size,
  });
});

// ----------------------------------------------------
// SECURE SIGNED ASSET DOWNLOAD SYSTEM
// ----------------------------------------------------

const DOWNLOAD_SECRET = process.env.DOWNLOAD_SECRET || 'stbacademy_mg_secure_signing_salt_2026_x89q';

export interface DownloadTicketPayload {
  releaseId: string;
  assetType: 'artwork' | 'track' | 'document';
  assetId?: string;
  userId: string;
  userRole: 'admin' | 'client';
  filename: string;
  filePath: string;
  contentType: string;
  expiresAt: number; // Unix timestamp in ms
}

export function generateSignedDownloadToken(payload: DownloadTicketPayload): string {
  const jsonStr = JSON.stringify(payload);
  const data = Buffer.from(jsonStr, 'utf-8').toString('base64url');
  const signature = crypto.createHmac('sha256', DOWNLOAD_SECRET).update(data).digest('base64url');
  return `${data}.${signature}`;
}

export function verifySignedDownloadToken(token: string): { valid: boolean; payload?: DownloadTicketPayload; error?: string; expired?: boolean } {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) {
      return { valid: false, error: 'Malformed download token.' };
    }
    const [data, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', DOWNLOAD_SECRET).update(data).digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return { valid: false, error: 'Invalid or tampered download token signature.' };
    }

    const payload: DownloadTicketPayload = JSON.parse(Buffer.from(data, 'base64url').toString('utf-8'));
    if (Date.now() > payload.expiresAt) {
      return { valid: false, expired: true, error: 'This download link has expired. Please click Download again to generate a fresh link.' };
    }

    return { valid: true, payload };
  } catch (err: any) {
    return { valid: false, error: 'Failed to verify download token.' };
  }
}

// Generates an official STB Academy QC Verification & Metadata Cue Sheet document
export function generateReleaseQcDocument(release: Release): string {
  if (!fs.existsSync(DOCUMENTS_DIR)) {
    fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
  }

  const docFilename = `${release.refNumber}-QC-Metadata-Sheet.txt`;
  const docPath = path.join(DOCUMENTS_DIR, docFilename);

  const content = `================================================================================
STB ACADEMY - DISTRIBUTION - OFFICIAL DISTRIBUTION QC & METADATA CUE SHEET
Worldwide Digital Music Distribution & Quality Control Administration
Portal: STB Academy - Distribution | Contact: djyslactrumpza@gmail.com
================================================================================

RELEASE IDENTIFICATION:
--------------------------------------------------------------------------------
Catalogue Reference:    ${release.refNumber}
Release Title:          ${release.title}
Release Type:           ${release.releaseType}
Primary Artist(s):      ${release.primaryArtists.join(', ')}
Featured Artist(s):     ${release.featuredArtists?.length ? release.featuredArtists.join(', ') : 'None'}
Main Genre:             ${release.genre}
Sub-Genre:              ${release.subGenre || 'Amapiano / Private School Piano'}
Primary Language:       ${release.language || 'Zulu / English / Multilingual'}
Target Release Date:    ${release.targetReleaseDate}
Submission Timestamp:   ${release.submittedAt}
Current Status:         ${release.status.toUpperCase()}
${release.approvalDate ? `Approval Timestamp:     ${release.approvalDate}` : ''}

RECORD LABEL & RIGHTS OWNER DETAILS:
--------------------------------------------------------------------------------
Artist / Record Label:  ${release.artistLabelName}
Client Account Email:   ${release.userEmail}
C-Line (Copyright):     ${release.cLine || `${new Date().getFullYear()} STB Academy`}
P-Line (Phonogram):     ${release.pLine || '℗ ' + new Date().getFullYear()}
Composer(s):            ${release.composers?.length ? release.composers.join(', ') : release.primaryArtists.join(', ')}
Producer(s):            ${release.producers?.length ? release.producers.join(', ') : release.primaryArtists.join(', ')}

TECHNICAL QUALITY CONTROL AUDIT:
--------------------------------------------------------------------------------
Master Audio Standard:  MP3 (Verified)
Artwork Standard:       Square 1:1 Aspect Ratio JPG/PNG (Verified)
Artwork Dimensions:     ${release.artworkDimensions ? `${release.artworkDimensions.width}×${release.artworkDimensions.height}px` : 'Square compliant'}
Artwork Source File:    ${release.artworkFilename}
Track Total Count:      ${release.tracks.length} track(s)

SUBMITTED MASTER TRACKLIST & ISRCs:
--------------------------------------------------------------------------------
${release.tracks.map(t => `Track #${t.trackNumber}
  Title:      ${t.title}
  Version:    ${t.version || 'Original Mix'}
  Filename:   ${t.filename}
  File Size:  ${(t.fileSize / (1024 * 1024)).toFixed(2)} MB
  Explicit:   ${t.explicit ? 'YES (Parental Advisory)' : 'NO (Clean / All Audiences)'}
  ISRC:       ${t.isrc || 'Pending DSP Distribution Code'}
`).join('\n')}

ADMINISTRATIVE NOTES & REVIEW:
--------------------------------------------------------------------------------
${release.adminNotes ? release.adminNotes : 'Quality control check verified by STB Academy - Distribution Administration.'}
${release.denialReason ? `Denial Reason: ${release.denialReason}` : ''}
${release.clientNotes ? `Client Notes: "${release.clientNotes}"` : ''}

STATUS AUDIT TRAIL:
--------------------------------------------------------------------------------
${(release.statusHistory || []).map(h => `[${h.timestamp}] Status changed to ${h.status} by ${h.updatedBy}${h.note ? ` - Note: "${h.note}"` : ''}`).join('\n')}

================================================================================
CONFIDENTIAL NOTICE: This document contains proprietary metadata submitted to STB ACADEMY - DISTRIBUTION.
Master ownership: Artists retain 100% ownership of their masters. Publishing rights are separate.
================================================================================
`;

  fs.writeFileSync(docPath, content, 'utf-8');
  return docPath;
}

// Endpoint 1: Generate a secure temporary signed download URL (For authenticated Admin and Release Owner)
apiRouter.post('/releases/:id/download-ticket', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const releaseId = req.params.id;
  const { assetType, trackId, documentId } = req.body;
  const user = req.user!;

  if (!assetType || !['artwork', 'track', 'audio', 'document'].includes(assetType)) {
    return res.status(400).json({ error: 'Valid assetType (artwork, track, document) is required.' });
  }

  const release = db.findReleaseById(releaseId);
  if (!release) {
    return res.status(404).json({ error: 'Release not found.' });
  }

  // Strict RBAC: Admin has access to all submitted releases. Customers ONLY to their own releases.
  if (user.role !== 'admin' && release.userId !== user.id) {
    return res.status(403).json({ error: 'Access denied. You can only download assets from your own releases.' });
  }

  let filePath = '';
  let filename = '';
  let contentType = 'application/octet-stream';
  const normAssetType = assetType === 'audio' ? 'track' : assetType;

  if (normAssetType === 'artwork') {
    const storedName = release.storedArtworkFilename || path.basename(release.artworkUrl);
    filePath = path.join(ARTWORK_DIR, storedName);
    filename = release.artworkFilename || `${release.refNumber}-artwork${path.extname(storedName) || '.jpg'}`;
    contentType = filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  } else if (normAssetType === 'track') {
    if (!trackId) {
      const track = release.tracks[0];
      if (!track) return res.status(404).json({ error: 'No audio tracks found in this release.' });
      const storedName = track.storedFilename || path.basename(track.fileUrl);
      filePath = path.join(AUDIO_DIR, storedName);
      filename = track.filename || `${release.refNumber}-track-1.mp3`;
      contentType = 'audio/mpeg';
    } else {
      const track = release.tracks.find(t => t.id === trackId);
      if (!track) return res.status(404).json({ error: 'Audio track not found in this release.' });
      const storedName = track.storedFilename || path.basename(track.fileUrl);
      filePath = path.join(AUDIO_DIR, storedName);
      filename = track.filename || `${release.refNumber}-${track.trackNumber}-${track.title}.mp3`;
      contentType = 'audio/mpeg';
    }
  } else if (normAssetType === 'document') {
    if (documentId && release.documents && release.documents.length > 0) {
      const doc = release.documents.find(d => d.id === documentId);
      if (!doc) return res.status(404).json({ error: 'Document not found in this release.' });
      filePath = path.join(DOCUMENTS_DIR, doc.storedFilename || path.basename(doc.fileUrl));
      filename = doc.filename;
      contentType = 'application/pdf';
    } else if (release.documents && release.documents.length > 0 && !documentId) {
      const doc = release.documents[0];
      filePath = path.join(DOCUMENTS_DIR, doc.storedFilename || path.basename(doc.fileUrl));
      filename = doc.filename;
      contentType = 'application/pdf';
    } else {
      filePath = generateReleaseQcDocument(release);
      filename = `${release.refNumber}-QC-Metadata-Sheet.txt`;
      contentType = 'text/plain; charset=utf-8';
    }
  }

  const selectedStoredName = normAssetType === 'artwork' ? (release.storedArtworkFilename || '') : normAssetType === 'track' ? ((release.tracks.find(t => !trackId || t.id === trackId) || release.tracks[0])?.storedFilename || '') : (documentId ? (release.documents?.find(d => d.id === documentId)?.storedFilename || '') : (release.documents?.[0]?.storedFilename || ''));
  if (selectedStoredName && /^(remote:|r2:)/.test(selectedStoredName)) {
    filePath = selectedStoredName;
  } else if (selectedStoredName && !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'The requested file is not available in local storage. Legacy non-R2 files require a separately verified migration before download.' });
  } else if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'The requested file no longer exists on the server.' });
  }

  // Temporary signed token valid for 60 seconds
  const expiresAt = Date.now() + 60 * 1000;
  const token = generateSignedDownloadToken({
    releaseId: release.id,
    assetType: normAssetType as 'artwork' | 'track' | 'document',
    assetId: normAssetType === 'track' ? trackId : documentId,
    userId: user.id,
    userRole: user.role,
    filename,
    filePath,
    contentType,
    expiresAt,
  });

  return res.json({
    success: true,
    downloadUrl: `/api/downloads/${token}`,
    filename,
    contentType,
    expiresAt,
    expiresInSeconds: 60,
  });
});

// Endpoint 2: Serve the secure signed download (With expiration, signature, and access validation)
apiRouter.get('/downloads/:token', (req: Request, res: Response) => {
  const token = req.params.token;
  const result = verifySignedDownloadToken(token);

  if (!result.valid) {
    if (result.expired) {
      return res.status(410).json({
        error: 'This download link has expired. Please click Download again to generate a fresh link.',
        expired: true,
        code: 'DOWNLOAD_EXPIRED'
      });
    }
    return res.status(403).json({
      error: result.error || 'Invalid or unauthorized download link.',
    });
  }

  const payload = result.payload!;

  // Verify user still exists and not disabled
  const user = db.findUserById(payload.userId);
  if (!user || user.status === 'disabled') {
    return res.status(403).json({ error: 'User account disabled or not found.' });
  }

  // Verify release still exists
  const release = db.findReleaseById(payload.releaseId);
  if (!release) {
    return res.status(404).json({ error: 'Release no longer exists.' });
  }

  // Verify permissions: admin has access, customer only to own release
  if (user.role !== 'admin' && release.userId !== user.id) {
    return res.status(403).json({ error: 'Unauthorized. You cannot access another customer\'s files.' });
  }

  if (payload.filePath && /^(remote:|r2:)/.test(payload.filePath)) {
    if (payload.filePath.startsWith('/') || payload.filePath.includes('\\')) {
      return res.status(404).json({ error: 'The requested remote asset is not configured.' });
    }
    try {
      return res.redirect(remoteSignedUrlForStoredName(payload.filePath, 120, payload.filename));
    } catch (error: any) {
      return res.status(404).json({ error: `The requested file could not be retrieved from persistent storage: ${error?.message || 'storage error'}` });
    }
  }

  if (!fs.existsSync(payload.filePath)) {
    return res.status(404).json({ error: 'The requested file no longer exists on the server.' });
  }

  res.setHeader('Content-Type', payload.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(payload.filename)}"; filename*=UTF-8''${encodeURIComponent(payload.filename)}`);
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  res.download(payload.filePath, payload.filename, (err) => {
    if (err && !res.headersSent) res.status(500).json({ error: 'Error transmitting file.' });
  });
});

// Direct download fallback routes (Support Bearer auth header OR signed token ticket)
apiRouter.get('/releases/:id/download-artwork', (req: Request, res: Response) => {
  // If ticket passed in query
  if (req.query.ticket && typeof req.query.ticket === 'string') {
    return res.redirect(`/api/downloads/${req.query.ticket}`);
  }

  // Otherwise run auth
  authMiddleware(req as AuthenticatedRequest, res, () => {
    const authReq = req as AuthenticatedRequest;
    const release = db.findReleaseById(authReq.params.id);
    if (!release) return res.status(404).json({ error: 'Release not found.' });

    if (authReq.user!.role !== 'admin' && release.userId !== authReq.user!.id) {
      return res.status(403).json({ error: 'Unauthorized. You cannot access another customer\'s files.' });
    }

    const filename = release.storedArtworkFilename || path.basename(release.artworkUrl);
    if (/^(remote:|r2:)/.test(filename)) return res.redirect(remoteSignedUrlForStoredName(filename, 300, release.artworkFilename || `${release.refNumber}-cover.jpg`));
    const filePath = path.join(ARTWORK_DIR, filename);

    if (fs.existsSync(filePath)) {
      return res.download(filePath, release.artworkFilename || `${release.refNumber}-cover.jpg`);
    }
    return res.status(404).json({ error: 'The requested artwork file no longer exists on the server.' });
  });
});

apiRouter.get('/releases/:id/download-track/:trackId', (req: Request, res: Response) => {
  if (req.query.ticket && typeof req.query.ticket === 'string') {
    return res.redirect(`/api/downloads/${req.query.ticket}`);
  }

  authMiddleware(req as AuthenticatedRequest, res, () => {
    const authReq = req as AuthenticatedRequest;
    const release = db.findReleaseById(authReq.params.id);
    if (!release) return res.status(404).json({ error: 'Release not found.' });

    if (authReq.user!.role !== 'admin' && release.userId !== authReq.user!.id) {
      return res.status(403).json({ error: 'Unauthorized. You cannot access another customer\'s files.' });
    }

    const track = release.tracks.find(t => t.id === authReq.params.trackId);
    if (!track) return res.status(404).json({ error: 'Track not found in this release.' });

    const filename = track.storedFilename || path.basename(track.fileUrl);
    if (/^(remote:|r2:)/.test(filename)) return res.redirect(remoteSignedUrlForStoredName(filename, 300, track.filename || `${release.refNumber}-${track.trackNumber}-${track.title}.mp3`));
    const filePath = path.join(AUDIO_DIR, filename);

    if (fs.existsSync(filePath)) {
      return res.download(filePath, track.filename || `${release.refNumber}-${track.trackNumber}-${track.title}.mp3`);
    }
    return res.status(404).json({ error: 'The requested lossless audio file no longer exists on the server.' });
  });
});

apiRouter.get('/releases/:id/download-document', (req: Request, res: Response) => {
  if (req.query.ticket && typeof req.query.ticket === 'string') {
    return res.redirect(`/api/downloads/${req.query.ticket}`);
  }

  authMiddleware(req as AuthenticatedRequest, res, () => {
    const authReq = req as AuthenticatedRequest;
    const release = db.findReleaseById(authReq.params.id);
    if (!release) return res.status(404).json({ error: 'Release not found.' });

    if (authReq.user!.role !== 'admin' && release.userId !== authReq.user!.id) {
      return res.status(403).json({ error: 'Unauthorized. You cannot access another customer\'s files.' });
    }

    const filePath = generateReleaseQcDocument(release);
    const filename = `${release.refNumber}-QC-Metadata-Sheet.txt`;

    if (fs.existsSync(filePath)) {
      return res.download(filePath, filename);
    }
    return res.status(404).json({ error: 'The requested document file no longer exists on the server.' });
  });
});

// Hosted persistent assets. The object path is base64url encoded so slashes are safe in the URL.
apiRouter.get('/assets/:encoded', (req: Request, res: Response) => {
  if (!remoteStorageConfigured) return res.status(404).json({ error: 'Cloudflare R2 asset storage is not enabled.' });
  let objectPath: string;
  try { objectPath = decodeRemoteAssetPath(req.params.encoded); } catch (_) { return res.status(400).json({ error: 'Invalid asset path.' }); }

  let user: User | null = null;
  const token = getAuthTokenFromRequest(req);
  if (token) { const verified = verifySessionToken(token); if (verified) user = db.findUserById(verified.userId) || null; }

  const releaseMatch = db.getReleases().flatMap(r => {
    const paths = [r.storedArtworkFilename, ...(r.tracks || []).map(t => t.storedFilename), ...(r.documents || []).map(d => d.storedFilename)].filter(Boolean) as string[];
    const match = paths.find(p => remoteObjectPathFromStoredName(p) === objectPath);
    return match ? [{ storedName: match, allowed: r.userId === user?.id || r.allowPublicShare || user?.role === 'admin' }] : [];
  })[0];
  const catalogueMatch = db.getCatalogue().flatMap(c => {
    const paths = [c.storedArtworkFilename, ...(c.tracks || []).map(t => t.storedFilename), ...(c.documents || []).map(d => d.storedFilename)].filter(Boolean) as string[];
    const match = paths.find(p => remoteObjectPathFromStoredName(p) === objectPath);
    return match ? [{ storedName: match, allowed: c.userId === user?.id || user?.role === 'admin' }] : [];
  })[0];
  const videoMatch = db.getVideoSubmissions().flatMap(v => {
    const storedName = v.storedVideoFilename;
    return storedName && remoteObjectPathFromStoredName(storedName) === objectPath
      ? [{ storedName, allowed: v.userId === user?.id || user?.role === 'admin' }]
      : [];
  })[0];
  const brandingMatch = objectPath.startsWith('site-branding/') ? { storedName: `r2:${objectPath}`, allowed: true } : null;
  const matched = brandingMatch || releaseMatch || catalogueMatch || videoMatch;
  if (!matched || (!matched.allowed && (!user || user.role !== 'admin'))) return res.status(403).json({ error: 'Access denied.' });

  try { return res.redirect(remoteSignedUrlForStoredName(matched.storedName, 300)); }
  catch (error: any) { return res.status(404).json({ error: `Asset unavailable: ${error?.message || 'storage error'}` }); }
});

// ----------------------------------------------------
// RELEASES API
// ----------------------------------------------------
apiRouter.get('/releases', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  if (user.role === 'admin') {
    const releases = db.getReleases();
    return res.json({ releases });
  }

  // Client only ever sees their OWN real releases
  const clientReleases = db.getReleasesByUserId(user.id);
  res.json({ releases: clientReleases });
});

// Admin-controlled royalty value for each release.
apiRouter.patch('/releases/:id/royalty', authMiddleware, superAdminOnly, (req: AuthenticatedRequest, res: Response) => {
  const existing = db.findReleaseById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Release not found.' });

  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > 999999999.99) {
    return res.status(400).json({ error: 'Royalty amount must be a valid non-negative Rand value.' });
  }

  const gross = Math.round((amount + Number.EPSILON) * 100) / 100;
  const artistShare = Math.round((gross * 0.8 + Number.EPSILON) * 100) / 100;
  const normalAdminShare = Math.round((gross * 0.1 + Number.EPSILON) * 100) / 100;
  const superAdminShare = Math.round((gross - artistShare - normalAdminShare + Number.EPSILON) * 100) / 100;
  const updated = db.updateRelease(existing.id, { grossRoyaltyAmount: gross, royaltyAmount: artistShare, normalAdminShareAmount: normalAdminShare, superAdminShareAmount: superAdminShare, labelShareAmount: normalAdminShare + superAdminShare });
  if (!updated) return res.status(404).json({ error: 'Release could not be updated.' });

  res.json({ message: `Gross royalty R${gross.toFixed(2)} split: artist R${artistShare.toFixed(2)} (80%), STB Academy R${(normalAdminShare + superAdminShare).toFixed(2)} (20%).`, release: updated });
});


apiRouter.patch('/releases/:id/codes', authMiddleware, superAdminOnly, (req: AuthenticatedRequest, res: Response) => {
  const release = db.findReleaseById(req.params.id);
  if (!release) return res.status(404).json({ error: 'Release not found.' });
  const isrc = String(req.body?.isrc || '').trim().toUpperCase();
  const upc = String(req.body?.upc || '').trim();
  if (isrc && !/^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/.test(isrc)) return res.status(400).json({ error: 'Enter a valid 12-character ISRC.' });
  if (upc && !/^[0-9]{12,13}$/.test(upc)) return res.status(400).json({ error: 'UPC/EAN must contain 12 or 13 digits.' });
  let updated;
  try {
    const trackCodes = Array.isArray(req.body?.tracks) ? req.body.tracks : [];
    const tracks = release.tracks.map(track => {
      const incoming = trackCodes.find((item:any)=>String(item?.id||'')===track.id);
      if (!incoming) return track;
      const trackIsrc = String(incoming.isrc||'').trim().toUpperCase();
      if (trackIsrc && !/^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/.test(trackIsrc)) throw new Error(`Track ${track.trackNumber} requires a valid 12-character ISRC.`);
      return { ...track, isrc: trackIsrc || undefined };
    });
    updated = db.updateRelease(release.id, { isrc: isrc || (tracks.length===1 ? tracks[0].isrc : undefined), upc: upc || undefined, tracks, updatedAt: new Date().toISOString() });
  } catch(error:any){ return res.status(400).json({error:error?.message||'Could not save release identifiers.'}); }
  res.json({ release: updated });
});

apiRouter.get('/releases/:id', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const release = db.findReleaseById(req.params.id);

  if (!release) {
    return res.status(404).json({ error: 'Release not found.' });
  }

  // Client cannot view another client's release
  if (user.role !== 'admin' && release.userId !== user.id) {
    return res.status(403).json({ error: 'Unauthorized to view this release.' });
  }

  res.json({ release });
});

apiRouter.patch('/releases/:id/client-edit', authMiddleware, activeClientOnly, (req: AuthenticatedRequest, res: Response) => {
  if (req.impersonatedBy) return res.status(403).json({ error: 'Client submissions can only be edited by the signed-in artist.' });
  const existing = db.findReleaseById(req.params.id);
  if (!existing || existing.userId !== req.user!.id || req.user!.role !== 'client') return res.status(404).json({ error: 'Release submission not found.' });
  const withinWindow = Date.now() - new Date(existing.submittedAt).getTime() <= 12 * 60 * 60 * 1000;
  if (!withinWindow && existing.status !== 'Corrections Required') return res.status(403).json({ error: 'Editing is available for 12 hours after submission and whenever the release is returned for corrections.' });
  const body = req.body || {};
  const title = body.title === undefined ? existing.title : String(body.title).trim().slice(0,180);
  const genre = body.genre === undefined ? existing.genre : String(body.genre).trim().slice(0,100);
  const subGenre = body.subGenre === undefined ? existing.subGenre : String(body.subGenre).trim().slice(0,100);
  const language = body.language === undefined ? existing.language : String(body.language).trim().slice(0,80);
  const lyricsLanguage = body.lyricsLanguage === undefined ? existing.lyricsLanguage : String(body.lyricsLanguage).trim().slice(0,80);
  const lyrics = body.lyrics === undefined ? existing.lyrics : String(body.lyrics).slice(0,20000);
  const clientNotes = body.clientNotes === undefined ? existing.clientNotes : String(body.clientNotes).trim().slice(0,3000);
  const targetReleaseDate = body.targetReleaseDate === undefined ? existing.targetReleaseDate : String(body.targetReleaseDate).trim();
  if (!title || !genre || !targetReleaseDate) return res.status(400).json({ error: 'Title, genre and target release date are required.' });
  let tracks = existing.tracks;
  if (Array.isArray(body.tracks)) {
    if (!body.tracks.length) return res.status(400).json({ error: 'At least one MP3 master is required.' });
    for (const track of body.tracks) {
      if (!track || !isOwnedUploadedAsset(req.user!.id, 'audio', String(track.storedFilename || ''), String(track.fileUrl || '')) || !String(track.filename || '').toLowerCase().endsWith('.mp3')) return res.status(400).json({ error: 'Replacement audio files must be MP3 masters uploaded through this account.' });
    }
    tracks = body.tracks.map((track:any,index:number)=>({ ...track, id:String(track.id||`track_${crypto.randomUUID()}`), trackNumber:index+1, fileSize:Number(track.fileSize||0) }));
  }
  const artworkPatch:any={};
  if(body.artworkUrl!==undefined){if(!isOwnedUploadedAsset(req.user!.id,'artwork',String(body.storedArtworkFilename||''),String(body.artworkUrl||'')))return res.status(400).json({error:'Replacement artwork must be uploaded through this account.'});artworkPatch.artworkUrl=String(body.artworkUrl);artworkPatch.artworkFilename=String(body.artworkFilename||'cover-art.jpg');artworkPatch.storedArtworkFilename=String(body.storedArtworkFilename);artworkPatch.artworkDimensions=body.artworkDimensions;}
  const resubmitted = existing.status === 'Corrections Required';
  const statusHistory = [...(existing.statusHistory || []), ...(resubmitted ? [{ status:'Pending Review', timestamp:new Date().toISOString(), note:'Artist resubmitted the corrected release.' }] : [])];
  const updated = db.updateRelease(existing.id, { title, genre, subGenre, language, lyricsLanguage, lyrics, clientNotes, targetReleaseDate, tracks, ...artworkPatch, ...(resubmitted ? { status:'Pending Review' as ReleaseStatus, statusHistory } : {}), updatedAt: new Date().toISOString() });
  if(resubmitted) void sendNotification({recipientEmail:SUPER_ADMIN_EMAIL,recipientName:'STB Academy Platform Owner',subject:`Corrected release resubmitted — ${updated?.title||title}`,template:'status_change',metadata:{releaseId:existing.id,artistName:existing.artistName,status:'Pending Review'}});
  return res.json({ message: 'Submission details updated.', release: updated });
});

apiRouter.delete('/releases/:id/client-delete', authMiddleware, activeClientOnly, (req: AuthenticatedRequest, res: Response) => {
  if (req.impersonatedBy) return res.status(403).json({ error: 'Client submissions can only be deleted by the signed-in artist.' });
  const existing = db.findReleaseById(req.params.id);
  if (!existing || existing.userId !== req.user!.id || req.user!.role !== 'client') return res.status(404).json({ error: 'Release submission not found.' });
  db.deleteRelease(existing.id);
  return res.json({ success: true, message: 'Your release submission was deleted.' });
});

apiRouter.delete('/releases/:id/artwork', authMiddleware, superAdminOnly, (req: AuthenticatedRequest, res: Response) => {
  const existing=db.findReleaseById(req.params.id);if(!existing)return res.status(404).json({error:'Release not found.'});
  const updated=db.updateRelease(existing.id,{artworkUrl:'',artworkFilename:'',storedArtworkFilename:undefined,updatedAt:new Date().toISOString()});
  return res.json({message:'Cover artwork removed from the release record.',release:updated});
});
apiRouter.post('/releases/:id/artwork', authMiddleware, superAdminOnly, uploadArtwork.single('artwork'), (req: AuthenticatedRequest, res: Response) => {
  const existing = db.findReleaseById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Release not found.' });
  if (!req.file) return res.status(400).json({ error: 'Choose replacement artwork.' });
  let storedFilename = req.file.filename; let artworkUrl = `/uploads/artwork/${req.file.filename}`;
  if (remoteStorageConfigured) { const objectPath = `${existing.userId}/artwork/${req.file.filename}`; remoteUploadFile(req.file.path, objectPath, req.file.mimetype || 'image/jpeg'); try { fs.unlinkSync(req.file.path); } catch {} storedFilename = `r2:${objectPath}`; artworkUrl = `/api/assets/${encodeRemoteAssetPath(objectPath)}`; }
  const updated = db.updateRelease(existing.id, { artworkUrl, artworkFilename: req.file.originalname, storedArtworkFilename: storedFilename, updatedAt: new Date().toISOString() });
  return res.json({ message: 'Cover artwork replaced.', release: updated });
});

// Admin-only permanent deletion of an audio release submission.
apiRouter.delete('/releases/:id', authMiddleware, superAdminOnly, (req: AuthenticatedRequest, res: Response) => {
  const existing = db.findReleaseById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Release not found.' });
  const deleted = db.deleteRelease(existing.id);
  if (!deleted) return res.status(500).json({ error: 'Release could not be deleted.' });
  res.json({ success: true, message: `Release ${existing.refNumber} was deleted.` });
});

apiRouter.delete('/account', authMiddleware, activeClientOnly, (req: AuthenticatedRequest, res: Response) => {
  if (req.impersonatedBy) return res.status(403).json({ error: 'Administrators cannot delete a client account while accessing it.' });
  if (req.user!.role !== 'client') return res.status(403).json({ error: 'Administrator accounts cannot be deleted from the client portal.' });
  const deleted = db.deleteUser(req.user!.id);
  if (!deleted) return res.status(500).json({ error: 'Your account could not be deleted. Contact STB Academy support.' });
  clearSessionCookie(res);
  return res.json({ success: true, message: 'Your account and associated portal submissions, payout requests and profile data have been deleted.' });
});

// ----------------------------------------------------
// CLIENT ARTIST LIBRARY — private to the authenticated client
// ----------------------------------------------------
apiRouter.post('/artists', authMiddleware, activeClientOnly, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  if (user.role !== 'client') return res.status(403).json({ error: 'This endpoint is for client accounts.' });
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Artist name is required.' });
  if (name.length > 180) return res.status(400).json({ error: 'Artist names must be 180 characters or fewer.' });
  const spotifyProfileUrl = String(req.body?.spotifyProfileUrl || '').trim();
  const appleMusicProfileUrl = String(req.body?.appleMusicProfileUrl || '').trim();
  const validUrl = (value: string) => {
    if (!value) return true;
    try { const parsed = new URL(value); return parsed.protocol === 'http:' || parsed.protocol === 'https:'; }
    catch { return false; }
  };
  if (!validUrl(spotifyProfileUrl) || !validUrl(appleMusicProfileUrl)) return res.status(400).json({ error: 'Artist profile links must be valid HTTP or HTTPS URLs.' });
  const incoming: Partial<ArtistCredit> = {
    name,
    role: req.body?.role === 'featured' ? 'featured' : req.body?.role === 'primary' ? 'primary' : undefined,
    spotifyProfileUrl: spotifyProfileUrl || undefined,
    appleMusicProfileUrl: appleMusicProfileUrl || undefined,
    spotifyProfileCreateRequested: req.body?.spotifyProfileCreateRequested,
    appleMusicProfileCreateRequested: req.body?.appleMusicProfileCreateRequested,
    socialMediaLinks: Array.isArray(req.body?.socialMediaLinks) ? req.body.socialMediaLinks : undefined,
  };
  const artists = upsertClientArtistLibrary(user.id, [incoming]);
  const normalized = name.normalize('NFKC').toLocaleLowerCase('en-US');
  const artist = artists.find(item => item.name.normalize('NFKC').toLocaleLowerCase('en-US') === normalized);
  return res.status(200).json({ message: 'Artist saved to your STB Academy artist library.', artist, artists });
});

apiRouter.get('/artists', authMiddleware, activeClientOnly, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  if (user.role !== 'client') return res.status(403).json({ error: 'This endpoint is for client accounts.' });
  const legacyArtists: ArtistCredit[] = [];
  for (const release of db.getReleasesByUserId(user.id)) {
    legacyArtists.push(...(release.primaryArtistProfiles || []).map(item => ({ ...item, role: 'primary' as const })));
    legacyArtists.push(...(release.featuredArtistProfiles || []).map(item => ({ ...item, role: 'featured' as const })));
    legacyArtists.push(...(release.primaryArtists || []).map(name => ({ name, role: 'primary' as const })));
    legacyArtists.push(...(release.featuredArtists || []).map(name => ({ name, role: 'featured' as const })));
  }
  for (const video of db.getVideoSubmissionsForUser(user.id)) {
    legacyArtists.push(...(video.primaryArtists || [video.artistName]).filter(Boolean).map(name => ({ name, role: 'primary' as const })));
    legacyArtists.push(...(video.featuredArtists || []).map(name => ({ name, role: 'featured' as const })));
  }
  // Merge historical release profile links into the saved library as well as
  // importing missing artist names. Existing URLs are preserved when legacy
  // records contain only a name, and filled in when an older release has links.
  const currentLibrary = Array.isArray(user.artistLibrary) ? user.artistLibrary : [];
  const mergedLibrary = legacyArtists.length
    ? upsertClientArtistLibrary(user.id, legacyArtists)
    : currentLibrary;
  return res.json({ artists: mergedLibrary });
});

const STB_CONTRACT_VERSION = '2026-11-v1';
function buildSTBAcademyContract(user: User, signature = ''): string {
  return `STB ACADEMY - DISTRIBUTION — ARTIST DISTRIBUTION & LABEL AGREEMENT\nIndependent label and distribution service\nAgreement version: ${STB_CONTRACT_VERSION}\n\nARTIST: ${user.artistName || user.name}\nACCOUNT EMAIL: ${user.email}\nEFFECTIVE DATE: ${new Date().toISOString()}\nE-SIGNATURE: ${signature || 'Not yet signed'}\n\n1. APPOINTMENT & AUTHORITY\nThe Artist appoints STB Academy - Distribution ("STB Academy"), an independent label and distribution service, as the Artist's label and distribution representative for the sound recordings, music videos, artwork and metadata submitted and accepted through this portal. The Artist authorises STB Academy to prepare, deliver, administer, promote, monetise and manage those accepted releases through its authorised distribution partners and applicable digital service providers.\n\n2. ROYALTY SPLIT\nFor each accepted release, gross royalties actually received and attributable to that release are allocated 80% to the Artist and 20% to STB Academy administration. Amounts are calculated after deductions, reversals, taxes, platform adjustments, distributor fees or other charges imposed upstream and shown in the applicable reporting. Audio and video royalty amounts are combined in the Artist's account for withdrawal. STB Academy may record and adjust release-level royalty credits based on verified statements.\n\n3. OWNERSHIP & RIGHTS\nThe Artist retains 100% ownership of the Artist's master recordings. This agreement does not transfer ownership of the master recording to STB Academy. The STB Academy portal does not charge a platform subscription fee and provides unlimited artist profiles and release submissions under this label arrangement. The Artist remains responsible for obtaining and maintaining all necessary rights, consents, performer permissions, producer agreements, publishing permissions, samples clearances and artwork licences. Publishing ownership is not changed by this master-rights clause.\n\n4. DISTRIBUTION LICENCE\nFor the duration of distribution, the Artist grants STB Academy a non-exclusive, worldwide licence to deliver, reproduce, encode, communicate, monetise, market and administer the submitted content solely as needed to provide label and distribution services. STB Academy may submit music and video releases to available DSPs and video platforms, including eligible services such as VEVO, subject to partner access, platform rules, technical requirements, territory availability and approval. Submission does not guarantee acceptance, placement, a release date, monetisation or continued availability.\n\n5. CONTENT ID & OFFICIAL ARTIST CHANNEL REQUESTS\nSTB Academy may submit eligible recordings for YouTube Content ID and may request a YouTube Official Artist Channel on the Artist's behalf without a separate STB Academy application fee. Approval, eligibility, matching, claims, monetisation and channel consolidation remain subject to YouTube and partner requirements. The Artist must disclose prior Content ID enrolment, conflicting distributors, licences and authorised channels, and must not create duplicate or fraudulent claims.\n\n6. AUDIO & VIDEO SUBMISSIONS\nThe Artist warrants that all metadata, audio, video, cover art, credits and release instructions are complete and accurate. Audio submissions must meet the displayed file specifications. For music videos, the Artist submits cover artwork and metadata through the portal and separately sends a required accessible download link to the full video master (for example Google Drive or MediaFire). Video delivery may be handled by STB Academy through authorised distribution partners. STB Academy does not charge a separate portal submission fee for video submissions; third-party partner requirements and charges, if any, must be disclosed before delivery. The Artist must supply a master that meets the chosen platform's current technical specifications.\n\n7. REVIEW, CORRECTIONS & DELIVERY\nSTB Academy may mark a submission Pending Review, Approved, Corrections Required, Denied, Delivered, In Distribution or Rejected. STB Academy may request corrections, decline content that breaches law, rights, quality or platform policies, or delay submission while investigating a rights or metadata issue. Delivered means the label has recorded delivery through its distribution workflow; it does not guarantee that every store has published the content.\n\n8. PAYOUTS & PAYPAL DETAILS\nThe Artist may request withdrawal of available royalty funds by linking a PayPal payout identifier and submitting a withdrawal request. STB Academy will review and manually process approved requests. A request may remain pending until payment is actually completed. STB Academy may only mark a request Paid after the manual PayPal transfer has been completed and recorded in the Artist dashboard. The Artist is responsible for checking all submitted PayPal payout identifiers. STB Academy is not liable for funds lost or misdirected because the Artist supplied incorrect or incomplete PayPal payout details, to the extent permitted by applicable law. Never provide a PIN, CVV, one-time password or online banking password.\n\n9. ARTIST WARRANTIES & INDEMNITY\nThe Artist confirms they are legally entitled to enter this agreement and that the content does not infringe third-party rights, contain unlawful material, or breach platform policies. The Artist will promptly notify STB Academy of disputes, takedown demands, ownership changes or claims. The Artist is responsible for losses, claims and costs arising from false rights declarations or unauthorised content, subject to applicable law.\n\n10. TERM, TERMINATION & TAKEDOWNS\nThis agreement applies to each submission accepted by STB Academy until the applicable distribution is terminated or taken down. The Artist may request a takedown through the portal. Removal timing depends on external distributors and DSPs. Outstanding royalties, reversals, fraud investigations and platform adjustments may be reconciled after termination.\n\n11. DATA & COMMUNICATIONS\nThe Artist authorises STB Academy to process account, release, royalty, payout and contact information as reasonably necessary to operate the label and distribution service, communicate about submissions and process payouts. PayPal payout identifiers are used for payment administration; passwords, PINs, OTPs and card security codes must never be shared.\n\n12. ACCEPTANCE\nBy ticking the acceptance box and submitting the generated electronic signature, the Artist confirms that they have read, understood and agreed to this agreement, including the 80% Artist / 20% STB Academy administration royalty split and 100% Artist master ownership. The Artist's electronic acceptance, timestamp, account identity and agreement text are retained in the Artist dashboard and administrator records.\n\nSTB Academy - Distribution\nSupport: STB Academy - Distribution\nAdministration: STB Academy - Distribution\n`;
}
apiRouter.get('/contract', authMiddleware, activeClientOnly, (req: AuthenticatedRequest, res: Response) => {
  const u = db.findUserById(req.user!.id)!;
  res.json({ accepted: !!u.contractAcceptedAt, contractText: u.contractText || buildSTBAcademyContract(u), acceptedAt: u.contractAcceptedAt, signature: u.contractSignature, version: u.contractVersion || STB_CONTRACT_VERSION });
});
apiRouter.post('/contract/accept', authMiddleware, activeClientOnly, (req: AuthenticatedRequest, res: Response) => {
  if (req.user!.role !== 'client') return res.status(403).json({ error: 'Only artist accounts sign the artist agreement.' });
  const signature = String(req.body?.signature || '').trim().slice(0,180);
  if (!signature || signature.length < 3) return res.status(400).json({ error: 'A valid generated artist signature is required.' });
  const acceptedAt = new Date().toISOString();
  const contractText = buildSTBAcademyContract(req.user!, signature).replace(/EFFECTIVE DATE: .*/, `EFFECTIVE DATE: ${acceptedAt}`);
  const updated = db.updateUser(req.user!.id, { contractAcceptedAt: acceptedAt, contractSignature: signature, contractText, contractVersion: STB_CONTRACT_VERSION });
  res.json({ message: 'Artist agreement signed and saved.', acceptedAt, signature, contractText, version: STB_CONTRACT_VERSION });
});

// Audio release submission — STB Academy label portal
apiRouter.post('/releases', authMiddleware, activeClientOnly, async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  if (user.role !== 'client') return res.status(403).json({ error: 'Only artist accounts can submit releases.' });
  if (!user.contractAcceptedAt) return res.status(409).json({ error: 'Please sign the STB Academy Artist Distribution Agreement before creating an audio release.', code: 'CONTRACT_REQUIRED' });
  const body = req.body || {};
  const releaseType = ['Single','EP','Album'].includes(body.releaseType) ? body.releaseType : null;
  const title = String(body.title || '').trim().slice(0,180);
  const primaryArtists = Array.isArray(body.primaryArtists) ? body.primaryArtists.map((x: any) => String(x).trim()).filter(Boolean) : [];
  const genre = String(body.genre || '').trim().slice(0,100);
  const credits = [...(Array.isArray(body.composers) ? body.composers : []), ...(Array.isArray(body.producers) ? body.producers : []), ...(Array.isArray(body.publishers) ? body.publishers : [])].map((x: any) => String(x || '').trim()).filter(Boolean);
  if (credits.some((name: string) => name.split(/\s+/).length < 2)) return res.status(400).json({ error: 'Composer and producer credits must be entered using real first name and surname.' });
  const artworkUrl = String(body.artworkUrl || '').trim();
  const artworkStoredFilename = String(body.storedArtworkFilename || '').trim();
  if (!isOwnedUploadedAsset(user.id, 'artwork', artworkStoredFilename, artworkUrl)) return res.status(400).json({ error: 'Upload the release cover artwork through this STB Academy portal before submitting.' });
  const tracksIn = Array.isArray(body.tracks) ? body.tracks : [];
  const audioMasterPending = false;
  if (!releaseType || !title || !primaryArtists.length || !genre || !artworkUrl || !tracksIn.length) return res.status(400).json({ error: 'Release type, title, primary artist, genre, cover artwork and at least one uploaded MP3 master are required.' });
  if (releaseType === 'Single' && tracksIn.length > 1) return res.status(400).json({ error: 'A Single can contain only one optional MP3 reference file. Choose EP or Album for multiple tracks.' });
  if (body.previouslyReleased && (!String(body.originalReleaseDate || '').trim() || !String(body.previousISRC || '').trim() || !String(body.previousUPC || '').trim())) return res.status(400).json({ error: 'Previously released songs require the original release date, ISRC and UPC.' });
  const releaseDate = String(body.targetReleaseDate || '').trim();
  const releaseDateMs = new Date(`${releaseDate}T00:00:00`).getTime();
  const minimumReleaseDate = new Date(); minimumReleaseDate.setHours(0,0,0,0); minimumReleaseDate.setDate(minimumReleaseDate.getDate() + 7);
  if (!releaseDate || !Number.isFinite(releaseDateMs) || releaseDateMs < minimumReleaseDate.getTime()) return res.status(400).json({ error: 'Choose a release date at least 7 days ahead to allow review and delivery.' });
  const profileRows = [...(Array.isArray(body.primaryArtistProfiles) ? body.primaryArtistProfiles : []), ...(Array.isArray(body.featuredArtistProfiles) ? body.featuredArtistProfiles : [])];
  for (const profile of profileRows) {
    const name = String(profile?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Every artist profile entry requires an artist name.' });
    const requestingNew = !!(profile?.spotifyProfileCreateRequested || profile?.appleMusicProfileCreateRequested);
    if (requestingNew && !(Array.isArray(profile?.socialMediaLinks) && profile.socialMediaLinks.some((x: any) => /^https:\/\//i.test(String(x))))) return res.status(400).json({ error: `At least one valid social-media link is required to request new profiles for ${name}.` });
    if (!requestingNew && (!/^https:\/\//i.test(String(profile?.spotifyProfileUrl || '')) || !/^https:\/\//i.test(String(profile?.appleMusicProfileUrl || '')))) return res.status(400).json({ error: `Provide Spotify and Apple Music profile URLs for ${name}, or request new profiles.` });
  }
  const invalidTrack = tracksIn.find((t: any) => !String(t.filename || '').trim() || !/\.mp3$/i.test(String(t.filename || '')) || !isOwnedUploadedAsset(user.id, 'audio', String(t.storedFilename || ''), String(t.fileUrl || '')));
  if (invalidTrack) return res.status(400).json({ error: 'Every track must be an MP3 file uploaded through this portal.' });
  const tracks = tracksIn.map((t: any, i: number) => {
    const filename = String(t.filename || '').trim(); const fileUrl = String(t.fileUrl || '').trim(); const storedFilename = String(t.storedFilename || '').trim();
    return { id: `trk_${crypto.randomUUID()}`, trackNumber: i + 1, title: String(t.title || filename.replace(/\.mp3$/i,'')).trim().slice(0,180), version: String(t.version || body.version || '1.0').trim().slice(0,40), filename, storedFilename, fileUrl, fileSize: Number(t.fileSize) || 0, explicit: !!body.explicit };
  });
  const now = new Date().toISOString();
  const release: Release = {
    id: `rel_${crypto.randomUUID()}`, userId: user.id, userEmail: user.email, artistLabelName: user.artistName || user.name, labelName: String(body.labelName || '').trim().slice(0,180) || undefined,
    refNumber: generateRefNumber(), title, releaseType, primaryArtists, featuredArtists: Array.isArray(body.featuredArtists) ? body.featuredArtists.map((x: any) => String(x).trim()).filter(Boolean) : [],
    genre, subGenre: String(body.subGenre || '').trim().slice(0,100), language: String(body.language || '').trim().slice(0,80), lyricsLanguage: String(body.lyricsLanguage || '').trim().slice(0,80),
    version: String(body.version || '1.0').trim().slice(0,40), lyrics: String(body.lyrics || '').slice(0,20000), previewStart: Number.isFinite(Number(body.previewStart)) ? Number(body.previewStart) : undefined,
    dspSelections: Array.isArray(body.dspSelections) ? body.dspSelections.map((x: any) => String(x).slice(0,80)).slice(0,30) : [],
    composers: Array.isArray(body.composers) ? body.composers.map((x: any) => String(x).trim()).filter(Boolean) : [], producers: Array.isArray(body.producers) ? body.producers.map((x: any) => String(x).trim()).filter(Boolean) : [], publishers: Array.isArray(body.publishers) ? body.publishers.map((x: any) => String(x).trim()).filter(Boolean) : [],
    targetReleaseDate: releaseDate, previouslyReleased: !!body.previouslyReleased, originalReleaseDate: String(body.originalReleaseDate || '').trim() || undefined, previousISRC: String(body.previousISRC || '').trim().slice(0,40) || undefined, previousUPC: String(body.previousUPC || '').trim().slice(0,40) || undefined, previousReleaseDetails: String(body.previousReleaseDetails || '').trim().slice(0,1000) || undefined,
    cLine: String(body.cLine || '').trim().slice(0,180) || undefined, pLine: String(body.pLine || '').trim().slice(0,180) || undefined,
    artworkUrl, artworkFilename: String(body.artworkFilename || 'cover-art.jpg'), storedArtworkFilename: artworkStoredFilename,
    artworkDimensions: body.artworkDimensions && Number.isFinite(Number(body.artworkDimensions.width)) ? { width: Number(body.artworkDimensions.width), height: Number(body.artworkDimensions.height) } : undefined,
    tracks, audioMasterPending, primaryArtistProfiles: Array.isArray(body.primaryArtistProfiles) ? body.primaryArtistProfiles : [], featuredArtistProfiles: Array.isArray(body.featuredArtistProfiles) ? body.featuredArtistProfiles : [], artistProfiles: [...(Array.isArray(body.primaryArtistProfiles) ? body.primaryArtistProfiles : []), ...(Array.isArray(body.featuredArtistProfiles) ? body.featuredArtistProfiles : [])], clientNotes: String(body.clientNotes || '').trim().slice(0,3000) || undefined, status: 'Pending Review', allowPublicShare: false, submittedAt: now, updatedAt: now,
    statusHistory: [{ status: 'Pending Review', note: 'New STB Academy audio release submitted.', timestamp: now, updatedBy: user.name }], grossRoyaltyAmount: 0, royaltyAmount: 0, labelShareAmount: 0,
  };
  db.createRelease(release);
  const audioArtistProfiles = [
    ...(Array.isArray(body.primaryArtistProfiles) ? body.primaryArtistProfiles.map((artist: any) => ({ ...artist, role: 'primary' as const })) : []),
    ...(Array.isArray(body.featuredArtistProfiles) ? body.featuredArtistProfiles.map((artist: any) => ({ ...artist, role: 'featured' as const })) : []),
    ...artistCreditsFromNames(primaryArtists, Array.isArray(body.featuredArtists) ? body.featuredArtists.map((x: any) => String(x).trim()).filter(Boolean) : []),
  ];
  upsertClientArtistLibrary(user.id, audioArtistProfiles);
  const baseUrl = (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  void sendAdminReleaseEmail(release, baseUrl).catch(err => console.error('[RELEASE] Admin notification failed:', err));
  res.status(201).json({ message: 'Your audio release has been submitted to STB Academy for review.', release });
});

// Admin workflow milestones that are distinct from approval and final distribution completion.
apiRouter.patch('/releases/:id/workflow-status', authMiddleware, superAdminOnly, (req: AuthenticatedRequest, res: Response) => {
  const existing = db.findReleaseById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Release not found.' });

  const status = req.body?.status;
  if (!['Delivered', 'In Distribution', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'Choose Delivered, In Distribution or Rejected.' });
  }

  const now = new Date().toISOString();
  const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
  const statusHistory = [
    ...(existing.statusHistory || []),
    {
      status: status as ReleaseStatus,
      note: note || (status === 'Delivered' ? 'Release delivery has been confirmed.' : status === 'In Distribution' ? 'Release is now in distribution.' : 'Release rejected by super administrator.'),
      timestamp: now,
      updatedBy: req.user!.name,
    },
  ];
  const updated = db.updateRelease(existing.id, {
    status: status as ReleaseStatus,
    adminNotes: note || existing.adminNotes,
    statusHistory,
  });
  if (!updated) return res.status(404).json({ error: 'Release could not be updated.' });

  res.json({
    message: `${existing.refNumber} status updated to ${status}.`,
    release: updated,
  });
});

// Admin Approve Release
apiRouter.post('/releases/:id/approve', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  const existing = db.findReleaseById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Release not found.' });

  const now = new Date().toISOString();
  const updatedHistory = [
    ...(existing.statusHistory || []),
    {
      status: 'Approved' as ReleaseStatus,
      note: req.body.note || 'Release approved for worldwide distribution.',
      timestamp: now,
      updatedBy: req.user!.name,
    }
  ];

  const updated = db.updateRelease(existing.id, {
    status: 'Approved',
    approvalDate: now,
    adminNotes: req.body.note || 'Approved by STB Academy Administration.',
    statusHistory: updatedHistory,
  });

  // Notify client of approval
  void sendNotification({
    recipientEmail: existing.userEmail,
    recipientName: existing.artistLabelName,
    subject: `Release Approved: ${existing.title} (${existing.refNumber}) - STB Academy - Distribution`,
    template: 'approved_distribution',
    metadata: {
      refNumber: existing.refNumber,
      title: existing.title,
      approvalDate: now,
      note: req.body.note,
    }
  }).catch((error) => console.error('Release status notification failed:', error));

  res.json({
    message: `Release ${existing.refNumber} has been approved!`,
    release: updated,
  });
});

// Admin-managed pre-save links for approved releases
apiRouter.patch('/releases/:id/presave-links', authMiddleware, superAdminOnly, (req: AuthenticatedRequest, res: Response) => {
  const existing = db.findReleaseById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Release not found.' });

  if (!['Delivered', 'In Distribution'].includes(existing.status)) {
    return res.status(400).json({ error: 'Pre-save links can only be managed when a release is Delivered or In Distribution.' });
  }

  if (!Array.isArray(req.body?.links)) {
    return res.status(400).json({ error: 'A links array is required.' });
  }

  const links = req.body.links.map((raw: any, index: number) => {
    const label = String(raw?.label || '').trim();
    const url = String(raw?.url || '').trim();
    if (!label) throw new Error(`Pre-save link #${index + 1} requires a label.`);
    if (label.length > 80) throw new Error(`Pre-save link #${index + 1} label is too long.`);
    if (url.length > 2000) throw new Error(`Pre-save link #${index + 1} URL is too long.`);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Pre-save link #${index + 1} must be a valid URL.`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`Pre-save link #${index + 1} must use http:// or https://.`);
    }
    return {
      id: String(raw?.id || `presave_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`),
      label,
      url,
    };
  });

  if (links.length > 20) {
    return res.status(400).json({ error: 'A release can have a maximum of 20 pre-save links.' });
  }

  const updated = db.updateRelease(existing.id, { preSaveLinks: links });
  if (!updated) return res.status(404).json({ error: 'Release could not be updated.' });

  res.json({
    message: links.length ? 'Pre-save links updated successfully.' : 'Pre-save links removed.',
    release: updated,
  });
});


// ----------------------------------------------------
// VIDEO DISTRIBUTION SUBMISSIONS (available after VEVO approval)
// ----------------------------------------------------
apiRouter.post('/upload/video', authMiddleware, activeClientOnly, (_req: AuthenticatedRequest, res: Response) => res.status(410).json({ error: 'Upload video masters to an accessible Google Drive, MediaFire or equivalent download link and paste that link into the required field.' }));
/* Legacy upload route retained below only as historical reference.
apiRouter.post('/upload/video', authMiddleware, activeClientOnly, (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a video file to upload.' });
  const approved = db.getVevoApplicationsForUser(req.user!.id).some(a => a.status === 'Approved');
  if (!approved) { try { fs.unlinkSync(req.file.path); } catch {} return res.status(403).json({ error: 'A VEVO channel application must be approved before video submission is available.' }); }
  let storedFilename = req.file.filename; let fileUrl = `/uploads/videos/${req.file.filename}`;
  if (remoteStorageConfigured) { const objectPath = `${req.user!.id}/videos/${req.file.filename}`; remoteUploadFile(req.file.path, objectPath, req.file.mimetype || 'video/mp4'); try { fs.unlinkSync(req.file.path); } catch {} storedFilename = `r2:${objectPath}`; fileUrl = `/api/assets/${encodeRemoteAssetPath(objectPath)}`; }
  return res.json({ fileUrl, filename: req.file.originalname, storedFilename, fileSize: req.file.size });
});
*/
apiRouter.post('/video-submissions', authMiddleware, activeClientOnly, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  if (user.role !== 'client') return res.status(403).json({ error: 'Only artist accounts can submit music videos.' });
  if (!user.contractAcceptedAt) return res.status(409).json({ error: 'Please review and sign the STB Academy Artist Distribution Agreement before submitting a video.', code: 'CONTRACT_REQUIRED' });
  const { videoTitle, videoType, artworkUrl, artworkFilename, storedArtworkFilename, artistName, primaryArtists, featuredArtists, description, youtubeDescription, lyrics, director, language, explicit, releaseDate, notes, genre, subGenre, songLanguage, lyricsLanguage, contributors, dspSelections, version, labelName, publisher, lyricist, composer, sourceDownloadUrl, sourceDownloadLinkAccessible } = req.body || {};
  const videoPrimaryArtists = Array.isArray(primaryArtists) ? primaryArtists.map((x: any) => String(x).trim()).filter(Boolean) : String(artistName || '').split(',').map((x: string) => x.trim()).filter(Boolean);
  const videoFeaturedArtists = Array.isArray(featuredArtists) ? featuredArtists.map((x: any) => String(x).trim()).filter(Boolean) : [];
  const videoCreditNames = [String(composer || '').trim(), String(lyricist || '').trim()].filter(Boolean);
  if (videoCreditNames.some((name: string) => name.split(/\s+/).length < 2)) return res.status(400).json({ error: 'Composer and lyricist credits must use each contributor’s real first name and surname.' });
  if (sourceDownloadLinkAccessible !== true || !/^https?:\/\//i.test(String(sourceDownloadUrl || '').trim()) || !String(videoTitle || '').trim() || !videoPrimaryArtists.length || !String(description || '').trim() || !isOwnedUploadedAsset(user.id, 'artwork', String(storedArtworkFilename || ''), String(artworkUrl || '')) || !String(genre || '').trim() || !String(language || songLanguage || '').trim() || !String(releaseDate || '').trim()) return res.status(400).json({ error: 'A valid video download URL with access confirmation, video title, at least one primary artist, description, genre, song language, release date and cover artwork are required.' });
  const videoDate = new Date(`${String(releaseDate).trim()}T00:00:00`).getTime(); const minVideoDate = new Date(); minVideoDate.setHours(0,0,0,0); minVideoDate.setDate(minVideoDate.getDate()+7);
  if (!Number.isFinite(videoDate) || videoDate < minVideoDate.getTime()) return res.status(400).json({ error: 'Choose a video release date at least 7 days ahead.' });
  const now = new Date().toISOString();
  const item: VideoSubmission = { id: `vid_${crypto.randomUUID()}`, userId: user.id, userEmail: user.email, clientName: user.name, artistName: videoPrimaryArtists.join(', ').slice(0,500), primaryArtists: videoPrimaryArtists, featuredArtists: videoFeaturedArtists, primaryArtistProfiles: Array.isArray(req.body?.primaryArtistProfiles) ? req.body.primaryArtistProfiles : [], featuredArtistProfiles: Array.isArray(req.body?.featuredArtistProfiles) ? req.body.featuredArtistProfiles : [], description: String(description).trim().slice(0,10000), youtubeDescription: String(youtubeDescription || '').slice(0,10000) || undefined, lyrics: String(lyrics || '').slice(0,20000) || undefined, videoTitle: String(videoTitle).trim().slice(0,180), videoType: ['Official Music Video','Visualizer','Lyric Video','Other'].includes(videoType) ? videoType : 'Official Music Video', videoUrl: String(sourceDownloadUrl).trim().slice(0,2000), videoFilename: 'External video download link', storedVideoFilename: undefined, fileSize: 0, artworkUrl: String(artworkUrl), artworkFilename: String(artworkFilename || 'video-cover.jpg'), storedArtworkFilename: String(storedArtworkFilename), genre: String(genre || '').trim(), subGenre: String(subGenre || '').trim(), songLanguage: String(songLanguage || language || '').trim(), lyricsLanguage: String(lyricsLanguage || '').trim(), version: String(version || '1.0').trim().slice(0,40), labelName: String(labelName || '').trim().slice(0,180), publisher: String(publisher || '').trim().slice(0,180), lyricist: String(lyricist || '').trim().slice(0,180), composer: String(composer || '').trim().slice(0,180), contributors: String(contributors || '').trim(), dspSelections: Array.isArray(dspSelections) ? dspSelections : [], director: String(director || '').trim().slice(0,180) || undefined, language: String(language || '').trim().slice(0,80) || undefined, explicit: !!explicit, releaseDate: String(releaseDate || '').trim() || undefined, notes: String(notes || '').trim().slice(0,3000) || undefined, status: 'Pending Review', grossRoyaltyAmount: 0, royaltyAmount: 0, labelShareAmount: 0, createdAt: now, updatedAt: now };
  db.createVideoSubmission(item);
  upsertClientArtistLibrary(user.id, [ ...(Array.isArray(req.body?.primaryArtistProfiles) ? req.body.primaryArtistProfiles.map((a:any)=>({...a, role:'primary' as const})) : videoPrimaryArtists.map(name=>({name,role:'primary' as const}))), ...(Array.isArray(req.body?.featuredArtistProfiles) ? req.body.featuredArtistProfiles.map((a:any)=>({...a, role:'featured' as const})) : videoFeaturedArtists.map(name=>({name,role:'featured' as const}))) ]);
  void Promise.all([
    sendAdminVideoSubmissionEmail({ ...item, clientName: user.name, email: user.email, createdAt: now }),
    sendNotification({ recipientEmail: SUPER_ADMIN_EMAIL, recipientName: 'STB Academy Platform Owner', subject: `New Video Distribution Submission — ${item.videoTitle}`, template: 'submission_received', metadata: { submissionId: item.id, artistName: item.artistName, clientName: user.name, clientEmail: user.email, videoTitle: item.videoTitle, status: item.status } }),
  ]).catch(err => console.error('[VIDEO] Admin notification failed:', err));
  return res.status(201).json({ message: 'Your video has been submitted for review.', submission: item });
});
apiRouter.patch('/video-submissions/:id/client-edit', authMiddleware, activeClientOnly, (req: AuthenticatedRequest, res: Response) => {
  if (req.impersonatedBy) return res.status(403).json({ error: 'Video submissions can only be edited by the signed-in artist.' });
  const existing = db.getVideoSubmissionsForUser(req.user!.id).find(v => v.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Video submission not found.' });
  const withinWindow = Date.now() - new Date(existing.createdAt).getTime() <= 12 * 60 * 60 * 1000;
  if (!withinWindow && existing.status !== 'Corrections Required') return res.status(403).json({ error: 'Editing is available for 12 hours after submission and whenever the video is returned for corrections.' });
  const body=req.body||{};const videoTitle=body.videoTitle===undefined?existing.videoTitle:String(body.videoTitle).trim().slice(0,180);const description=body.description===undefined?existing.description:String(body.description).trim().slice(0,10000);const videoUrl=body.videoUrl===undefined?existing.videoUrl:String(body.videoUrl).trim().slice(0,2000);
  if(body.sourceDownloadLinkAccessible!==true||!videoTitle||!description||!/^https?:\/\//i.test(videoUrl||''))return res.status(400).json({error:'Video title, description, a valid download URL and download-access confirmation are required.'});
  const resubmitted=existing.status==='Corrections Required';
  const updated=db.updateVideoSubmission(existing.id,{videoTitle,description,videoUrl,...(resubmitted?{status:'Pending Review' as const}:{}),updatedAt:new Date().toISOString()});
  if(resubmitted)void sendNotification({recipientEmail:SUPER_ADMIN_EMAIL,recipientName:'STB Academy Platform Owner',subject:`Corrected video resubmitted — ${videoTitle}`,template:'status_change',metadata:{submissionId:existing.id,artistName:existing.artistName,status:'Pending Review'}});
  return res.json({message:'Video submission updated.',submission:updated});
});
apiRouter.delete('/admin/video-submissions/:id/artwork', authMiddleware, superAdminOnly, (req: AuthenticatedRequest, res: Response) => {
  const existing=db.getVideoSubmissions().find(v=>v.id===req.params.id);if(!existing)return res.status(404).json({error:'Video submission not found.'});
  const updated=db.updateVideoSubmission(existing.id,{artworkUrl:'',artworkFilename:'',storedArtworkFilename:undefined,updatedAt:new Date().toISOString()});return res.json({message:'Video cover artwork removed from the submission record.',submission:updated});
});
apiRouter.post('/admin/video-submissions/:id/artwork', authMiddleware, superAdminOnly, uploadArtwork.single('artwork'), (req: AuthenticatedRequest, res: Response) => {
  const existing=db.getVideoSubmissions().find(v=>v.id===req.params.id);if(!existing)return res.status(404).json({error:'Video submission not found.'});if(!req.file)return res.status(400).json({error:'Choose replacement artwork.'});
  let storedFilename=req.file.filename;let artworkUrl=`/uploads/artwork/${req.file.filename}`;if(remoteStorageConfigured){const objectPath=`${existing.userId}/artwork/${req.file.filename}`;remoteUploadFile(req.file.path,objectPath,req.file.mimetype||'image/jpeg');try{fs.unlinkSync(req.file.path);}catch{}storedFilename=`r2:${objectPath}`;artworkUrl=`/api/assets/${encodeRemoteAssetPath(objectPath)}`;}
  const updated=db.updateVideoSubmission(existing.id,{artworkUrl,artworkFilename:req.file.originalname,storedArtworkFilename:storedFilename,updatedAt:new Date().toISOString()});return res.json({message:'Video cover artwork replaced.',submission:updated});
});

apiRouter.get('/video-submissions', authMiddleware, (req: AuthenticatedRequest, res: Response) => res.json({ submissions: req.user!.role === 'admin' ? db.getVideoSubmissions() : db.getVideoSubmissionsForUser(req.user!.id) }));
apiRouter.delete('/video-submissions/:id', authMiddleware, activeClientOnly, (req: AuthenticatedRequest, res: Response) => {
  if (req.impersonatedBy) return res.status(403).json({ error: 'Video submissions can only be deleted by the signed-in artist.' });
  const existing = db.getVideoSubmissionsForUser(req.user!.id).find(v => v.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Video submission not found.' });
  db.deleteVideoSubmission(existing.id);
  return res.json({ success: true, message: 'Your video submission was deleted.' });
});
apiRouter.delete('/admin/video-submissions/:id', authMiddleware, superAdminOnly, (req: AuthenticatedRequest, res: Response) => {
  const existing = db.getVideoSubmissions().find(v => v.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Video submission not found.' });
  if (!db.deleteVideoSubmission(existing.id)) return res.status(500).json({ error: 'Video submission could not be deleted.' });
  res.json({ success: true, message: 'Video submission deleted.' });
});
apiRouter.patch('/admin/video-submissions/:id', authMiddleware, adminOnly, (req: AuthenticatedRequest, res: Response) => {
  const existing = db.getVideoSubmissions().find(v => v.id === req.params.id); if (!existing) return res.status(404).json({ error: 'Video submission not found.' });
  const status = req.body?.status || existing.status; if (!['Pending Review','Approved','Corrections Required','Denied','Rejected','Delivered','In Distribution'].includes(status)) return res.status(400).json({ error: 'Choose a valid video submission status.' });
  if (!isSuperAdminEmail(req.user!.email) && !['Approved','Corrections Required','Denied'].includes(status)) return res.status(403).json({ error: 'Normal administrators can only approve, request corrections or deny video submissions.' });
  if (!isSuperAdminEmail(req.user!.email) && req.body?.grossRoyaltyAmount !== undefined) return res.status(403).json({ error: 'Only the super administrator can assign royalty amounts.' });
  const grossRoyaltyAmount = req.body?.grossRoyaltyAmount === undefined ? Number((existing as any).grossRoyaltyAmount ?? (Number((existing as any).royaltyAmount || 0) / 0.8)) : Math.round(Math.max(0, Number(req.body.grossRoyaltyAmount || 0)) * 100) / 100;
  if (!Number.isFinite(grossRoyaltyAmount) || grossRoyaltyAmount < 0) return res.status(400).json({ error: 'Enter a valid gross video royalty amount.' });
  const royaltyAmount = Math.round((grossRoyaltyAmount * 0.8 + Number.EPSILON) * 100) / 100;
  const normalAdminShareAmount = Math.round((grossRoyaltyAmount * 0.1 + Number.EPSILON) * 100) / 100;
  const superAdminShareAmount = Math.round((grossRoyaltyAmount - royaltyAmount - normalAdminShareAmount + Number.EPSILON) * 100) / 100;
  const labelShareAmount = normalAdminShareAmount + superAdminShareAmount;
  const updated = db.updateVideoSubmission(existing.id, { status, grossRoyaltyAmount, royaltyAmount, normalAdminShareAmount, superAdminShareAmount, labelShareAmount, adminNote: String(req.body?.adminNote || '').trim().slice(0,1500) || undefined, updatedAt: new Date().toISOString() });
  if (updated) void Promise.all([
    sendVideoSubmissionStatusEmail({ videoTitle: existing.videoTitle, artistName: existing.artistName, clientName: existing.clientName, email: existing.userEmail, status, adminNote: updated.adminNote }),
    sendNotification({ recipientEmail: existing.userEmail, recipientName: existing.clientName, subject: `Video Submission Update — ${existing.videoTitle}`, template: 'status_change', metadata: { artistName: existing.artistName, videoTitle: existing.videoTitle, status, adminNote: updated.adminNote || '' } }),
  ]).catch(err => console.error('[VIDEO] Client status email failed:', err));
  return res.json({ submission: updated, message: `Video submission marked ${status}.` });
});

// ----------------------------------------------------
// VEVO CHANNEL APPLICATIONS
// Stored as an additive field in the existing application state; no existing records are replaced.
// ----------------------------------------------------
// VEVO channel applications have been retired from the legacy portal.
apiRouter.post('/vevo/applications', authMiddleware, activeClientOnly, (_req: AuthenticatedRequest, res: Response) => {
  return res.status(410).json({ error: 'VEVO applications are no longer accepted through this portal.' });
});
apiRouter.get('/vevo/applications', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  if (req.user!.role === 'admin') return res.json({ applications: db.getVevoApplications() });
  return res.json({ applications: db.getVevoApplicationsForUser(req.user!.id) });
});
// Legacy VEVO application decisions are disabled; existing application records remain preserved.
apiRouter.patch('/admin/vevo/applications/:id', authMiddleware, superAdminOnly, (_req: AuthenticatedRequest, res: Response) => {
  return res.status(410).json({ error: 'VEVO application management is no longer available in this portal.' });
});
// Admin Mark Release Completed / Distributed
apiRouter.post('/releases/:id/complete', authMiddleware, superAdminOnly, (_req: AuthenticatedRequest, res: Response) => res.status(410).json({ error: 'Use Delivered or In Distribution as the final release status.' }));

// Admin Deny Release (Requires Reason)
apiRouter.post('/releases/:id/deny', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'A denial reason is required when denying a release.' });
  }

  const existing = db.findReleaseById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Release not found.' });

  const now = new Date().toISOString();
  const updatedHistory = [
    ...(existing.statusHistory || []),
    {
      status: 'Denied' as ReleaseStatus,
      note: `Denied: ${reason.trim()}`,
      timestamp: now,
      updatedBy: req.user!.name,
    }
  ];

  const updated = db.updateRelease(existing.id, {
    status: 'Denied',
    denialReason: reason.trim(),
    adminNotes: reason.trim(),
    statusHistory: updatedHistory,
  });

  // Notify client of denial with reason
  void sendNotification({
    recipientEmail: existing.userEmail,
    recipientName: existing.artistLabelName,
    subject: `Release Denied: ${existing.title} (${existing.refNumber}) - STB Academy - Distribution`,
    template: 'denied',
    metadata: {
      refNumber: existing.refNumber,
      title: existing.title,
      reason: reason.trim(),
    }
  }).catch((error) => console.error('Release status notification failed:', error));

  res.json({
    message: `Release ${existing.refNumber} has been denied.`,
    release: updated,
  });
});

// Admin Request Corrections
apiRouter.post('/releases/:id/request-corrections', authMiddleware, adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  const { note } = req.body;
  if (!note || !note.trim()) {
    return res.status(400).json({ error: 'Please specify the corrections required from the artist.' });
  }

  const existing = db.findReleaseById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Release not found.' });

  const now = new Date().toISOString();
  const updatedHistory = [
    ...(existing.statusHistory || []),
    {
      status: 'Corrections Required' as ReleaseStatus,
      note: `Corrections Required: ${note.trim()}`,
      timestamp: now,
      updatedBy: req.user!.name,
    }
  ];

  const updated = db.updateRelease(existing.id, {
    status: 'Corrections Required',
    adminNotes: note.trim(),
    statusHistory: updatedHistory,
  });

  // Notify client
  void sendNotification({
    recipientEmail: existing.userEmail,
    recipientName: existing.artistLabelName,
    subject: `Corrections Required: ${existing.title} (${existing.refNumber}) - STB Academy - Distribution`,
    template: 'corrections_required',
    metadata: {
      refNumber: existing.refNumber,
      title: existing.title,
      note: note.trim(),
    }
  }).catch((error) => console.error('Release status notification failed:', error));

  res.json({
    message: `Corrections requested for ${existing.refNumber}.`,
    release: updated,
  });
});

// Client resubmission for a release explicitly returned for corrections.
// This updates the existing release record (same ID/reference) and never creates
// or deletes stored assets. Unchanged asset URLs/filenames are preserved.
apiRouter.post('/releases/:id/corrections-resubmit', authMiddleware, activeClientOnly, (_req: AuthenticatedRequest, res: Response) => {
  return res.status(410).json({ error: 'Legacy release editing is no longer available. Please use the new artist portal for new distribution.' });
});

// ----------------------------------------------------
// PUBLIC SHARE / SHOWCASE (If allowed)
// ----------------------------------------------------

apiRouter.get('/public/share/:refNumber', (req: Request, res: Response) => {
  const refNumber = req.params.refNumber;
  const release = db.findReleaseByRef(refNumber);

  if (!release) {
    return res.status(404).json({ error: 'Release not found. Please verify reference number.' });
  }

  if (!release.allowPublicShare || release.status === 'Denied') {
    return res.status(403).json({ error: 'This release showcase is currently restricted.' });
  }

  const publicData = {
    refNumber: release.refNumber,
    title: release.title,
    releaseType: release.releaseType,
    primaryArtists: release.primaryArtists,
    featuredArtists: release.featuredArtists,
    genre: release.genre,
    subGenre: release.subGenre,
    language: release.language,
    targetReleaseDate: release.targetReleaseDate,
    artworkUrl: release.artworkUrl,
    artistLabelName: release.artistLabelName,
    status: release.status,
    tracks: release.tracks.map(t => ({
      id: t.id,
      trackNumber: t.trackNumber,
      title: t.title,
      version: t.version,
      fileUrl: t.fileUrl,
      duration: t.duration,
      explicit: t.explicit,
    })),
  };

  res.json({ release: publicData });
});

// ----------------------------------------------------
// ADMIN DASHBOARD & REAL CLIENT REGISTRATION
// ----------------------------------------------------

// Admin Diagnostic Endpoint reporting safe persistence and connectivity status without secrets
apiRouter.get('/admin/diagnostic', authMiddleware, adminOnly, (_req: AuthenticatedRequest, res: Response) => {
  const isConfigured = remotePersistenceConfigured;
  const dbOk = isConfigured ? remoteCheckDatabase() : false;
  const storageOk = remoteCheckStorage();
  const authOk = isConfigured ? remoteCheckAuth() : false;

  res.json({
    persistenceMode: isConfigured ? 'neon-postgres' : 'local-json',
    neonConfigured: isConfigured,
    databaseConfigured: dbOk,
    storageConfigured: storageOk,
    storageProvider: remoteStorageConfigured ? 'cloudflare-r2' : 'not-configured',
    authConfigured: authOk,
  });
});

apiRouter.get('/admin/persistence-health', authMiddleware, adminOnly, (_req: AuthenticatedRequest, res: Response) => {
  const isConfigured = remotePersistenceConfigured;
  const dbOk = isConfigured ? remoteCheckDatabase() : false;
  const storageOk = remoteCheckStorage();
  const authOk = isConfigured ? remoteCheckAuth() : false;

  res.json({
    persistenceMode: isConfigured ? 'neon-postgres' : 'local-json',
    neonConfigured: isConfigured,
    databaseConfigured: dbOk,
    storageConfigured: storageOk,
    storageProvider: remoteStorageConfigured ? 'cloudflare-r2' : 'not-configured',
    authConfigured: authOk,
    persistence: db.getPersistenceInfo(),
  });
});

function calculateRoyaltySummary(userId: string) {
  const releases = db.getReleasesByUserId(userId);
  const releaseEarnings = releases.filter(r => ['Delivered','In Distribution','Completed'].includes(r.status)).reduce((sum, r) => sum + Math.max(0, Number(r.royaltyAmount || 0)), 0);
  const videoEarnings = db.getVideoSubmissionsForUser(userId).filter(v => ['Delivered','In Distribution'].includes(v.status)).reduce((sum, v) => sum + Math.max(0, Number(v.royaltyAmount || 0)), 0);
  const totalEarnings = releaseEarnings + videoEarnings;
  const withdrawals = db.getWithdrawalsByUserId(userId);
  const pendingAmount = withdrawals.filter(w => w.status === 'pending' || w.status === 'awaiting_confirmation').reduce((sum, w) => sum + w.amount, 0);
  const paidAmount = withdrawals.filter(w => w.status === 'paid').reduce((sum, w) => sum + w.amount, 0);
  const availableAmount = Math.max(0, totalEarnings - pendingAmount - paidAmount);
  return {
    totalEarnings: Number(totalEarnings.toFixed(2)),
    pendingAmount: Number(pendingAmount.toFixed(2)),
    paidAmount: Number(paidAmount.toFixed(2)),
    availableAmount: Number(availableAmount.toFixed(2)),
  };
}


apiRouter.patch('/admin/royalties/admin-allocation/:id', authMiddleware, superAdminOnly, (req: AuthenticatedRequest, res: Response) => {
  const target = db.findUserById(req.params.id);
  if (!target || !DESIGNATED_ADMIN_EMAILS.includes(target.email.toLowerCase()) || isSuperAdminEmail(target.email)) {
    return res.status(404).json({ error: 'Normal administrator not found.' });
  }
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > 999999999.99) return res.status(400).json({ error: 'Enter a valid non-negative royalty allocation.' });
  const updated = db.updateUser(target.id, { adminRoyaltyAllocation: Math.round(amount * 100) / 100 });
  if (!updated) return res.status(404).json({ error: 'Administrator could not be updated.' });
  const { passwordHash: _passwordHash, ...safeUser } = updated;
  res.json({ user: safeUser });
});

apiRouter.get('/admin/royalties/admins', authMiddleware, superAdminOnly, (_req: AuthenticatedRequest, res: Response) => {
  const admins = db.getUsers().filter(u => u.role === 'admin' && !isSuperAdminEmail(u.email) && DESIGNATED_ADMIN_EMAILS.includes(u.email.toLowerCase())).map(u => ({ id: u.id, name: u.name, email: u.email, adminRoyaltyAllocation: Number(u.adminRoyaltyAllocation || 0), payoutProfile: u.payoutProfile || null }));
  res.json({ admins });
});

apiRouter.get('/admin/royalties/payout-profiles', authMiddleware, superAdminOnly, (_req: AuthenticatedRequest, res: Response) => {
  const profiles = db.getUsers().filter(u => (u.role === 'client' || (u.role === 'admin' && !isSuperAdminEmail(u.email))) && u.payoutProfile).map(u => ({ userId:u.id, name:u.name, email:u.email, role:u.role, payoutProfile:u.payoutProfile }));
  res.json({ profiles });
});

apiRouter.get('/admin/royalties/overview', authMiddleware, superAdminOnly, (_req: AuthenticatedRequest, res: Response) => {
  const releases = db.getReleases();
  const eligible = releases.filter(r => ['Delivered', 'In Distribution', 'Completed'].includes(r.status));
  const eligibleVideos = db.getVideoSubmissions().filter(v => ['Delivered','In Distribution'].includes(v.status));
  const gross = eligible.reduce((sum, r) => sum + Math.max(0, Number(r.grossRoyaltyAmount || 0)), 0) + eligibleVideos.reduce((sum,v)=>sum+Math.max(0,Number(v.grossRoyaltyAmount||0)),0);
  const normalShare = eligible.reduce((sum, r) => sum + Math.max(0, Number(r.normalAdminShareAmount ?? Number(r.grossRoyaltyAmount || 0) * 0.1)), 0) + eligibleVideos.reduce((sum,v)=>sum+Math.max(0,Number((v as any).normalAdminShareAmount ?? Number(v.grossRoyaltyAmount||0)*0.1)),0);
  const superShare = eligible.reduce((sum, r) => sum + Math.max(0, Number(r.superAdminShareAmount ?? Number(r.grossRoyaltyAmount || 0) * 0.1)), 0) + eligibleVideos.reduce((sum,v)=>sum+Math.max(0,Number((v as any).superAdminShareAmount ?? Number(v.grossRoyaltyAmount||0)*0.1)),0);
  res.json({ grossRoyalty: Number(gross.toFixed(2)), normalAdminShare: Number(normalShare.toFixed(2)), superAdminShare: Number(superShare.toFixed(2)), eligibleReleases: eligible.length + eligibleVideos.length });
});

apiRouter.get('/admin/royalties/summary', authMiddleware, adminOnly, (req: AuthenticatedRequest, res: Response) => {
  if (isSuperAdminEmail(req.user!.email)) return res.json({ totalEarnings: 0, pendingAmount: 0, paidAmount: 0, availableAmount: 0, withdrawals: [] });
  const withdrawals = db.getWithdrawalsByUserId(req.user!.id);
  const assigned = Math.max(0, Number(req.user!.adminRoyaltyAllocation || 0));
  const pendingAmount = withdrawals.filter(w => w.status === 'pending' || w.status === 'awaiting_confirmation').reduce((sum, w) => sum + w.amount, 0);
  const paidAmount = withdrawals.filter(w => w.status === 'paid').reduce((sum, w) => sum + w.amount, 0);
  res.json({ totalEarnings: assigned, pendingAmount, paidAmount, availableAmount: Math.max(0, assigned - pendingAmount - paidAmount), withdrawals });
});

apiRouter.get('/royalties/summary', authMiddleware, activeClientOnly, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const summary = calculateRoyaltySummary(userId);
  const withdrawals = db.getWithdrawalsByUserId(userId);
  res.json({ ...summary, withdrawals });
});

apiRouter.put('/account/paypal-profile', authMiddleware, activeClientOnly, (req: AuthenticatedRequest, res: Response) => {
  if (req.impersonatedBy) return res.status(403).json({ error: 'Administrators cannot change a client PayPal profile while accessing their account.' });
  const body = req.body || {};
  const email = String(body.email || '').trim();
  const mobile = String(body.mobile || '').trim();
  const username = String(body.username || '').trim();
  const paypalMeUrl = String(body.paypalMeUrl || '').trim();
  if (!email && !mobile && !username && !paypalMeUrl) return res.status(400).json({ error: 'Provide at least one PayPal payout identifier.' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid PayPal email address.' });
  if (paypalMeUrl && !/^https:\/\/(www\.)?paypal\.me\/[A-Za-z0-9._-]+\/?$/.test(paypalMeUrl)) return res.status(400).json({ error: 'Enter a valid PayPal.Me URL.' });
  const payoutProfile = { provider: 'PayPal' as const, email: email || undefined, mobile: mobile || undefined, username: username || undefined, paypalMeUrl: paypalMeUrl || undefined, linkedAt: new Date().toISOString() };
  const updated = db.updateUser(req.user!.id, { payoutProfile });
  res.json({ linked: true, payoutProfile: updated?.payoutProfile });
});

apiRouter.post('/royalties/paypal-withdrawals', authMiddleware, (_req: AuthenticatedRequest, res: Response) => res.status(410).json({ error: 'Use the PayPal payment request workflow in your dashboard.' }));

apiRouter.post('/royalties/withdrawals', authMiddleware, activeClientOnly, (req: AuthenticatedRequest, res: Response) => {
  if (req.impersonatedBy) return res.status(403).json({ error: 'Administrators cannot request withdrawals while accessing a client account.' });
  const user = db.findUserById(req.user!.id);
  if (!user || (user.role !== 'client' && !(user.role === 'admin' && !isSuperAdminEmail(user.email)))) return res.status(403).json({ error: 'This account cannot request royalty payments.' });
  if (!user.payoutProfile) return res.status(400).json({ error: 'Link your PayPal payout details before requesting payment.' });
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Enter a valid withdrawal amount.' });
  const withdrawals = db.getWithdrawalsByUserId(user.id);
  const pending = withdrawals.filter(w => ['pending','awaiting_confirmation'].includes(w.status)).reduce((sum,w)=>sum+w.amount,0);
  const paid = withdrawals.filter(w => w.status === 'paid').reduce((sum,w)=>sum+w.amount,0);
  const total = user.role === 'admin' ? Number(user.adminRoyaltyAllocation || 0) : calculateRoyaltySummary(user.id).totalEarnings;
  const available = Math.max(0, total - pending - paid);
  const roundedAmount = Math.round(amount * 100) / 100;
  if (roundedAmount > available) return res.status(400).json({ error: `The maximum available amount is R${available.toFixed(2)}.` });
  const profile = user.payoutProfile;
  const identifiers = [profile.email, profile.mobile, profile.username, profile.paypalMeUrl].filter(Boolean);
  const withdrawal: WithdrawalRequest = {
    id: `wd_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`, userId: user.id, userEmail: user.email, clientName: user.name,
    amount: roundedAmount, currency: 'ZAR', bankName: '', accountHolder: user.name, accountNumber: '', branchCode: '', accountType: 'Other',
    payoutMethod: 'PayPal', payoutIdentifier: identifiers.join(' | '), liabilityAcknowledged: true, status: 'pending', createdAt: new Date().toISOString(),
  };
  try { db.createWithdrawal(withdrawal); } catch (error: any) { return res.status(400).json({ error: error?.message || 'The withdrawal could not be created.' }); }
  void sendNotification({ recipientEmail:SUPER_ADMIN_EMAIL, recipientName:'STB Academy Platform Owner', subject:`PayPal payout request — ${user.name}`, template:'status_change', metadata:{ userName:user.name, userEmail:user.email, amount:roundedAmount, currency:'ZAR', payoutMethod:'PayPal', withdrawalId:withdrawal.id } });
  res.status(201).json({ message: 'PayPal payment request submitted to STB Academy.', withdrawal, summary: user.role === 'admin' ? { totalEarnings: total, pendingAmount: pending + roundedAmount, paidAmount: paid, availableAmount: Math.max(0, available-roundedAmount) } : calculateRoyaltySummary(user.id) });
});

apiRouter.get('/admin/royalties/withdrawals', authMiddleware, superAdminOnly, (_req: AuthenticatedRequest, res: Response) => {
  res.json({ withdrawals: db.getWithdrawals() });
});

apiRouter.patch('/admin/royalties/withdrawals/:id', authMiddleware, superAdminOnly, (req: AuthenticatedRequest, res: Response) => {
  const existing = db.getWithdrawals().find(w => w.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Withdrawal request not found.' });
  const status = req.body?.status;
  if (!['awaiting_confirmation', 'paid', 'rejected'].includes(status)) return res.status(400).json({ error: 'Choose a valid withdrawal status.' });
  if (status === 'awaiting_confirmation' && existing.status !== 'pending') return res.status(400).json({ error: 'This request has already been processed.' });
  if (status === 'paid' && !['pending','awaiting_confirmation'].includes(existing.status)) return res.status(400).json({ error: 'This request has already been processed.' });
  if (status === 'rejected' && existing.status !== 'pending') return res.status(400).json({ error: 'This withdrawal request has already moved beyond the pending stage.' });

  const updated = db.updateWithdrawal(existing.id, {
    status,
    processedAt: new Date().toISOString(),
    processedBy: req.user!.email,
    adminNote: String(req.body?.adminNote || '').trim() || undefined,
    clientConfirmedReceived: status === 'paid' ? true : existing.clientConfirmedReceived,
  });
  if (!updated) return res.status(404).json({ error: 'Withdrawal request could not be updated.' });
  void sendNotification({ recipientEmail:existing.userEmail, recipientName:existing.clientName, subject:status==='paid'?'PayPal payment completed':'PayPal payment request update', template:'status_change', metadata:{ amount:existing.amount, currency:existing.currency, status, adminNote:updated.adminNote||'' } });
  res.json({ message: status === 'paid' ? 'Withdrawal marked as paid.' : status === 'awaiting_confirmation' ? 'Payment marked as awaiting confirmation.' : 'Withdrawal rejected. The amount is available to the client again.', withdrawal: updated });
});

apiRouter.get('/admin/stats', authMiddleware, adminOnly, (_req: AuthenticatedRequest, res: Response) => {
  const releases = db.getReleases();
  const users = db.getUsers().filter(u => u.role === 'client');

  const totalClients = users.length;
  const totalReleases = releases.length;
  const pendingReviews = releases.filter(r => r.status === 'Pending Review').length;
  const correctionsRequired = releases.filter(r => r.status === 'Corrections Required').length;
  const approved = releases.filter(r => r.status === 'Approved').length;
  const denied = releases.filter(r => r.status === 'Denied').length;

  res.json({
    stats: {
      totalClients,
      totalReleases,
      pendingReviews,
      correctionsRequired,
      approved,
      denied,
    }
  });
});

apiRouter.get('/admin/clients', authMiddleware, adminOnly, (_req: AuthenticatedRequest, res: Response) => {
  const users = db.getUsers().filter(u => u.role === 'client');
  const releases = db.getReleases();

  const clientsWithStats = users.map(u => {
    const clientReleases = releases.filter(r => r.userId === u.id);
    const { passwordHash, payoutProfile, adminRoyaltyAllocation, isPlatformOwner, ...safeUser } = u;
    return {
      ...safeUser,
      payoutLinked: Boolean(payoutProfile),
      releasesCount: clientReleases.length,
      releases: clientReleases,
      privateAccessUrl: u.inviteToken ? `/register?invite=${u.inviteToken}` : null,
    };
  });

  res.json({ clients: clientsWithStats });
});

// Client announcement campaigns. Recipient addresses are returned only to the authenticated administrator.
apiRouter.get('/admin/email-campaigns/recipients', authMiddleware, superAdminOnly, (_req: AuthenticatedRequest, res: Response) => {
  const currentRecipients = db.getUsers()
    .filter(u => u.role === 'client' && typeof u.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(u.email.trim()))
    .map(u => ({ id: u.id, email: u.email.trim(), name: u.name || [u.realFirstName, u.realSurname].filter(Boolean).join(' ') || 'Client', status: u.status, group: 'current' }));
  res.json({ recipients: currentRecipients });
});

apiRouter.get('/admin/email-campaigns', authMiddleware, superAdminOnly, (_req: AuthenticatedRequest, res: Response) => {
  res.json({ campaigns: db.getEmailCampaigns() });
});

apiRouter.post('/admin/email-campaigns/test', authMiddleware, superAdminOnly, async (req: AuthenticatedRequest, res: Response) => {
  const subject = String(req.body?.subject || '').trim();
  const message = String(req.body?.message || '').trim();
  if (!subject || subject.length > 200 || !message || message.length > 20000) {
    return res.status(400).json({ error: 'Enter a subject (maximum 200 characters) and message (maximum 20,000 characters).' });
  }
  try {
    const results = await sendAnnouncementBatch([{ userId: req.user!.id, email: req.user!.email, name: req.user!.name || 'Administrator' }], `[TEST] ${subject}`, message);
    if (!results[0]?.success) throw new Error(results[0]?.error || 'Test email was not accepted by Resend.');
    res.json({ message: `Test email accepted for ${req.user!.email}.`, recipient: req.user!.email });
  } catch (error: any) {
    res.status(502).json({ error: error?.message || 'Test email failed.' });
  }
});

apiRouter.post('/admin/email-campaigns/send', authMiddleware, superAdminOnly, async (req: AuthenticatedRequest, res: Response) => {
  const subject = String(req.body?.subject || '').trim();
  const message = String(req.body?.message || '').trim();
  const requestedIds = Array.isArray(req.body?.recipientIds) ? req.body.recipientIds.map((id: unknown) => String(id)) : [];
  const recipientIds = [...new Set(requestedIds)].slice(0, 1000);
  if (!subject || subject.length > 200 || !message || message.length > 20000) {
    return res.status(400).json({ error: 'Enter a subject (maximum 200 characters) and message (maximum 20,000 characters).' });
  }
  if (!recipientIds.length || requestedIds.length > 1000) {
    return res.status(400).json({ error: 'Select between 1 and 1,000 clients.' });
  }

  const currentById = new Map<string, User>(db.getUsers().filter(u => u.role === 'client').map(u => [u.id, u] as const));
  const targets: Array<{ userId: string; email: string; name: string; isLegacy?: boolean }> = [];
  const seenEmails = new Set<string>();
  for (const id of recipientIds) {
    const current = currentById.get(id);
    if (!current) {
      return res.status(400).json({ error: 'One or more selected recipients are no longer eligible. Refresh the recipient list and try again.' });
    }
    const email = current.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'One or more selected recipients have an invalid email address.' });
    }
    const normalizedEmail = email.toLowerCase();
    if (seenEmails.has(normalizedEmail)) continue;
    seenEmails.add(normalizedEmail);
    targets.push({ userId: current.id, email, name: current.name || [current.realFirstName, current.realSurname].filter(Boolean).join(' ') || 'Client' });
  }
  if (!targets.length) return res.status(400).json({ error: 'No unique eligible recipients were selected.' });

  const fingerprint = crypto.createHash('sha256').update(`${subject.toLowerCase()}\n${message}`).digest('hex');
  const sender = process.env.EMAIL_FROM || 'STB Academy - Distribution <no-reply@YOUR-VERIFIED-DOMAIN>'; // Same sender identity used by OTP
  const campaignId = `campaign_${crypto.randomUUID()}`;
  try {
    db.createEmailCampaign({
      id: campaignId,
      fingerprint,
      subject,
      message,
      sender,
      createdAt: new Date().toISOString(),
      createdBy: req.user!.email,
      status: 'sending',
      recipients: targets.map(t => ({ ...t, status: 'pending' })),
    });
  } catch (error: any) {
    return res.status(409).json({ error: error?.message || 'This announcement may already have been sent.' });
  }

  // Resend batch API supports up to 100 messages per request. Smaller chunks
  // keep each operation bounded and let us persist a result after every batch.
  for (let offset = 0; offset < targets.length; offset += 50) {
    const batch = targets.slice(offset, offset + 50);
    try {
      const outcomes = await sendAnnouncementBatch(batch, subject, message, `${campaignId}/chunk-${Math.floor(offset / 50)}`);
      const byUser = new Map(outcomes.map(result => [result.userId, result]));
      const campaign = db.getEmailCampaigns().find(c => c.id === campaignId);
      if (campaign) {
        const updatedRecipients = campaign.recipients.map(recipient => {
          const result = byUser.get(recipient.userId);
          return result ? { ...recipient, status: result.success ? 'sent' as const : 'failed' as const, sentAt: result.success ? new Date().toISOString() : undefined, resendId: result.resendId, error: result.error } : recipient;
        });
        db.updateEmailCampaign(campaignId, { recipients: updatedRecipients });
      }
    } catch (error: any) {
      const detail = String(error?.message || 'Resend batch failed').slice(0, 500);
      const campaign = db.getEmailCampaigns().find(c => c.id === campaignId);
      if (campaign) {
        const batchIds = new Set(batch.map(t => t.userId));
        db.updateEmailCampaign(campaignId, { recipients: campaign.recipients.map(r => batchIds.has(r.userId) ? { ...r, status: 'failed', error: detail } : r) });
      }
    }
  }

  const finished = db.getEmailCampaigns().find(c => c.id === campaignId)!;
  const sent = finished.recipients.filter(r => r.status === 'sent').length;
  const failed = finished.recipients.filter(r => r.status === 'failed').length;
  const status = sent === finished.recipients.length ? 'completed' : sent > 0 ? 'partial' : 'failed';
  db.updateEmailCampaign(campaignId, { status });
  res.json({ campaignId, status, sent, failed, total: finished.recipients.length, message: `Campaign finished: ${sent} sent, ${failed} failed.` });
});

// Admin Register Client Manually (Client creates their password upon first visit, or admin sets it)
apiRouter.post('/admin/clients/register', authMiddleware, superAdminOnly, async (req: AuthenticatedRequest, res: Response) => {
  const { email, name, realFirstName, realSurname, phone, country } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid client email address is required.' });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Artist name is required.' });
  }
  const normalizedFirstName = typeof realFirstName === 'string' ? realFirstName.trim() : '';
  const normalizedSurname = typeof realSurname === 'string' ? realSurname.trim() : '';

  const existing = db.findUserByEmail(email.trim());
  if (existing) {
    return res.status(400).json({ error: 'A client account with this email address already exists.' });
  }

  const now = new Date().toISOString();
  const passwordHash = hashPassword(generateToken());
  const status: 'active' = 'active';

  const newClient: User = {
    id: `usr_client_${Date.now()}`,
    email: email.trim().toLowerCase(),
    name: name.trim(),
    artistName: name.trim(),
    realFirstName: normalizedFirstName || undefined,
    realSurname: normalizedSurname || undefined,
    role: 'client',
    passwordHash,
    status,
    phone: phone?.trim() || '',
    country: country?.trim() || 'South Africa',
    createdAt: now,
  };

  db.createUser(newClient);

  // Internal audit log
  await sendNotification({
    recipientEmail: newClient.email,
    recipientName: newClient.name,
    subject: 'STB Academy - Distribution - Client Account Registered',
    template: 'invitation',
    metadata: {
      registeredBy: req.user!.name,
      status: newClient.status,
    }
  });

  const { passwordHash: _hash, ...safeUser } = newClient;
  res.status(201).json({
    message: `Client "${newClient.name}" successfully registered. They can sign in using the one-time code sent to ${newClient.email}.`,
    client: safeUser,
    hasDirectPassword: false,
  });
});

// Password management is retired. All client authentication uses email OTP.
apiRouter.post('/admin/clients/:id/password', authMiddleware, adminOnly, (_req: AuthenticatedRequest, res: Response) => {
  return res.status(410).json({ error: 'Client passwords are retired. Clients sign in with an email one-time code.' });
});

// Admin: Access client account without client password (support & management)
apiRouter.post('/admin/clients/:id/access-session', authMiddleware, adminOnly, (req: AuthenticatedRequest, res: Response) => {
  const targetId = req.params.id;
  const targetClient = db.findUserById(targetId);
  if (!targetClient) {
    return res.status(404).json({ error: 'Client account not found.' });
  }
  if (targetClient.role !== 'client') {
    return res.status(403).json({ error: 'Access denied. You can only access client accounts.' });
  }

  // Issue a fresh authenticated session token for the target client.
  // The client's existing password remains completely untouched and is never read, stored, or revealed.
  const clientToken = createSessionToken(targetClient.id, 2 * 60 * 60, req.user!.id);
  const { passwordHash: _hash, payoutProfile, adminRoyaltyAllocation, isPlatformOwner, ...safeClient } = targetClient;

  return res.json({
    message: `Access granted for client ${targetClient.name}.`,
    token: clientToken,
    client: { ...safeClient, payoutLinked: Boolean(payoutProfile) },
  });
});

// Admin update client status (enable/disable)
apiRouter.patch('/admin/clients/:id', authMiddleware, superAdminOnly, (req: AuthenticatedRequest, res: Response) => {
  const { status, name, realFirstName, realSurname, phone, disabledReason, planId } = req.body;
  const client = db.findUserById(req.params.id);

  if (!client || client.role !== 'client') {
    return res.status(404).json({ error: 'Client not found.' });
  }

  const updates: Partial<User> = {};
  if (status && ['active', 'disabled', 'pending_activation'].includes(status)) {
    updates.status = status;
    if (status === 'disabled') {
      const reason = typeof disabledReason === 'string' ? disabledReason.trim() : '';
      if (!reason) return res.status(400).json({ error: 'A reason is required when banning / terminating a client account.' });
      updates.disabledReason = reason;
    } else if (status === 'active') {
      updates.disabledReason = undefined;
    }
  }
  if (name) { updates.name = name.trim(); updates.artistName = name.trim(); }
  if (realFirstName !== undefined) updates.realFirstName = typeof realFirstName === 'string' ? realFirstName.trim() : '';
  if (realSurname !== undefined) updates.realSurname = typeof realSurname === 'string' ? realSurname.trim() : '';
  if (phone !== undefined) updates.phone = phone.trim();
  if (planId !== undefined) {
    updates.planId = 'free';
    updates.planExpiresAt = null;
    updates.planActivatedAt = null;
  }

  const updated = db.updateUser(client.id, updates);
  const { passwordHash, ...safeUser } = updated!;
  res.json({ message: 'Client account updated.', client: safeUser });
});

// Admin delete client account
apiRouter.delete('/admin/clients/:id', authMiddleware, superAdminOnly, (req: AuthenticatedRequest, res: Response) => {
  const client = db.findUserById(req.params.id);
  if (!client || client.role !== 'client') {
    return res.status(404).json({ error: 'Client account not found.' });
  }

  const success = db.deleteUser(client.id);
  if (!success) {
    return res.status(500).json({ error: 'Failed to delete client account.' });
  }

  res.json({ success: true, message: `Client "${client.name}" successfully deleted.` });
});

// Admin get single client's submitted releases
apiRouter.get('/admin/clients/:id/releases', authMiddleware, adminOnly, (req: AuthenticatedRequest, res: Response) => {
  const client = db.findUserById(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found.' });

  const clientReleases = db.getReleasesByUserId(client.id);
  res.json({ client, releases: clientReleases });
});

// ----------------------------------------------------
// ADMIN DATA SAFETY / BACKUP & CATALOGUE
// ----------------------------------------------------

const backupUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) => cb(null, `stbacademy-restore-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname) || '.tar.gz'}`),
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
});

apiRouter.get('/admin/backup/export', authMiddleware, superAdminOnly, (req: AuthenticatedRequest, res: Response) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'midama-backup-'));
  const archive = path.join(tempDir, `stbacademy-mg-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.tar.gz`);
  try {
    // The archive is a complete copy of the persistent application state.
    execFileSync('tar', ['-czf', archive, '-C', process.cwd(), 'data/db.json', 'uploads'], { stdio: 'ignore' });
    res.download(archive, path.basename(archive), err => {
      fs.rmSync(tempDir, { recursive: true, force: true });
      if (err && !res.headersSent) res.status(500).json({ error: 'Backup download failed.' });
    });
  } catch (error: any) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    res.status(500).json({ error: `Backup export failed: ${error?.message || 'tar is unavailable on this server.'}` });
  }
});

apiRouter.post('/admin/backup/import', authMiddleware, superAdminOnly, backupUpload.single('backup'), (req: AuthenticatedRequest, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'Select a STB Academy .tar.gz backup file.' });
  const archive = req.file.path;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stbacademy-restore-'));
  try {
    const listing = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' });
    const entries = listing.split('\n').map(x => x.trim()).filter(Boolean);
    const unsafe = entries.some(entry => {
      const n = entry.replace(/\\/g, '/');
      return n.startsWith('/') || n.split('/').includes('..') || (!['data/db.json', 'uploads'].some(prefix => n === prefix || n.startsWith(prefix + '/')));
    });
    if (unsafe) return res.status(400).json({ error: 'Backup contains unsafe paths and was rejected.' });

    execFileSync('tar', ['-xzf', archive, '-C', tempDir, '--no-same-owner', '--no-same-permissions']);
    const backupDbPath = path.join(tempDir, 'data', 'db.json');
    if (!fs.existsSync(backupDbPath)) return res.status(400).json({ error: 'Backup is missing data/db.json.' });
    const snapshot = JSON.parse(fs.readFileSync(backupDbPath, 'utf8'));
    // STB Academy no longer supports a separate catalogue; legacy catalogue records are never restored.
    snapshot.catalogue = [];
    const result = db.importAdditive(snapshot);

    let assetsRestored = 0;
    const backupUploads = path.join(tempDir, 'uploads');
    const copyMissing = (currentDir: string, backupDir: string) => {
      if (!fs.existsSync(backupDir)) return;
      for (const name of fs.readdirSync(backupDir)) {
        const src = path.join(backupDir, name);
        const dst = path.join(currentDir, name);
        const stat = fs.statSync(src);
        if (stat.isDirectory()) {
          fs.mkdirSync(dst, { recursive: true });
          copyMissing(dst, src);
        } else if (stat.isFile() && !fs.existsSync(dst)) {
          fs.mkdirSync(path.dirname(dst), { recursive: true });
          fs.copyFileSync(src, dst);
          assetsRestored++;
        }
      }
    };
    copyMissing(UPLOADS_DIR, backupUploads);
    res.json({ success: true, message: 'Backup imported additively. Existing records and files were preserved.', ...result, assetsRestored });
  } catch (error: any) {
    res.status(400).json({ error: `Backup import failed: ${error?.message || 'Invalid backup archive.'}` });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(archive, { force: true });
  }
});

// ----------------------------------------------------
// TAKEDOWN REQUESTS
// ----------------------------------------------------
apiRouter.post('/releases/:id/takedown-request', authMiddleware, activeClientOnly, (req: AuthenticatedRequest, res: Response) => {
  const release = db.findReleaseById(req.params.id);
  if (!release) return res.status(404).json({ error: 'Release not found.' });
  if (req.impersonatedBy || req.user!.role !== 'client' || release.userId !== req.user!.id) return res.status(403).json({ error: 'Only the signed-in artist can request a takedown.' });
  if (release.status === 'Takedown Completed' || release.status === 'Takedown Processing') return res.status(400).json({ error: 'A takedown is already being processed for this release.' });
  const updated = db.updateRelease(release.id, { status: 'Takedown Requested', statusHistory: [...(release.statusHistory || []), { status: 'Takedown Requested', timestamp: new Date().toISOString(), updatedBy: req.user!.name, note: 'Takedown requested by client.' }] });
  if (updated) void sendAdminTakedownEmail(updated);
  res.json({ message: 'Takedown request submitted.', release: updated });
});

apiRouter.post('/releases/:id/takedown-process', authMiddleware, superAdminOnly, (req: AuthenticatedRequest, res: Response) => {
  const release = db.findReleaseById(req.params.id);
  if (!release) return res.status(404).json({ error: 'Release not found.' });
  const status = req.body?.status === 'Takedown Completed' ? 'Takedown Completed' : 'Takedown Processing';
  const history = [...(release.statusHistory || []), { status: status as ReleaseStatus, timestamp: new Date().toISOString(), updatedBy: req.user!.name, note: req.body?.note || 'Admin updated takedown status.' }];
  const updated = db.updateRelease(release.id, { status: status as ReleaseStatus, statusHistory: history });
  res.json({ message: `Takedown status updated to ${status}.`, release: updated });
});

// ----------------------------------------------------
// ENQUIRIES / CONTACT
// ----------------------------------------------------

apiRouter.post('/enquiries', (req: Request, res: Response) => {
  const { name, email, phone, subject, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }

  const enquiry = db.createEnquiry({
    id: `enq_${Date.now()}`,
    name: name.trim(),
    email: email.trim(),
    phone: phone?.trim() || '',
    subject: subject?.trim() || 'General Music Distribution Enquiry',
    message: message.trim(),
    createdAt: new Date().toISOString(),
    status: 'new',
  });

  void sendAdminEnquiryEmail(enquiry);
  res.status(201).json({
    message: 'Enquiry received. STB Academy administration will review your message.',
    enquiry,
  });
});

apiRouter.get('/admin/enquiries', authMiddleware, adminOnly, (_req: AuthenticatedRequest, res: Response) => {
  const enquiries = db.getEnquiries();
  res.json({ enquiries });
});

apiRouter.patch('/admin/enquiries/:id', authMiddleware, adminOnly, (req: AuthenticatedRequest, res: Response) => {
  const { status } = req.body;
  if (!status || !['new', 'read', 'replied'].includes(status)) {
    return res.status(400).json({ error: 'Valid status required.' });
  }
  const updated = db.updateEnquiryStatus(req.params.id, status);
  if (!updated) return res.status(404).json({ error: 'Enquiry not found.' });
  res.json({ message: 'Enquiry updated.', enquiry: updated });
});

// ----------------------------------------------------
// NOTIFICATIONS AUDIT LOG
// ----------------------------------------------------

apiRouter.get('/notifications', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const user = req.user!;
  const allNotifs = db.getNotifications();

  const userNotifs = allNotifs.filter(n => String(n.recipientEmail || '').toLowerCase().split(',').map((email:string)=>email.trim()).includes(user.email.toLowerCase())).map(n => ({ ...n, recipientEmail:user.email }));
  res.json({ notifications: userNotifs });
});
