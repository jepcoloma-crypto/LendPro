import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { config } from './config';
import { authenticate } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { pool } from './database/connection';
import routes from './routes';

const app = express();

// Trust proxy (Cloudflare tunnel, reverse proxy)
app.set('trust proxy', 1);

// Disable ETags to prevent 304 responses (API should always return fresh data)
app.set('etag', false);

// Security
app.use(helmet({
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  contentSecurityPolicy: false, // Disabled for API (frontend handles its own CSP)
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    // Reject wildcard origins — must be explicit
    if (config.allowedOrigins.some((o: string) => o !== '*' && (origin === o || (o.startsWith('*.') && origin.endsWith(o.slice(1)))))) {
      callback(null, origin);
    } else if (config.allowedOrigins.includes(origin)) {
      callback(null, origin);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// --- Rate Limiting ---
const isProd = config.nodeEnv === 'production';
const tooMany = { success: false, error: 'Too many requests, please try again later.' };

// Key by userId for authenticated requests, IP otherwise (fairer for shared-IP offices)
const userKey = (req: express.Request): string =>
  (req as any).user?.userId || req.ip || 'unknown';

// 1. Global safety net — all incoming requests regardless of route
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 1000 : 10000,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany,
});
app.use(globalLimiter);

// 2. General API limiter — all /api routes, keyed by user
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 300 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKey,
  message: tooMany,
});
app.use('/api', apiLimiter);

// 3. Write operation limiter — POST/PUT/DELETE/PATCH on /api (skip reads)
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 100 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKey,
  skip: (req) => !['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method),
  message: { success: false, error: 'Too many write requests, please try again later.' },
});
app.use('/api', writeLimiter);

// 4. Refresh token limiter — higher limit since it's a critical auth path
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 500 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany,
});
app.use('/api/auth/refresh', refreshLimiter);

// 5. Auth-specific limiter — tighter than general API limit
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 100 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany,
});
app.use('/api/auth', authLimiter);

// 5. Strict limit for sensitive operations (login, password reset, import, backup/restore)
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 20 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany,
});
app.use('/api/auth/login', strictLimiter);
app.use('/api/auth/forgot-password', strictLimiter);
app.use('/api/utilities/backup', strictLimiter);
app.use('/api/utilities/restore', strictLimiter);
app.use('/api/payments/import', strictLimiter);

// 6. Twilio webhook (unauthenticated, IP-based)
const twilioLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 30 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany,
});
app.use('/twilio/webhook', twilioLimiter);

// Static files (uploads) — authenticated access only
app.use('/uploads', authenticate, express.static(path.join(__dirname, '..', 'uploads')));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
// Twilio webhook needs raw urlencoded body (handled by its own route middleware)
app.use('/api/twilio', express.urlencoded({ extended: false }));

// Logging
if (config.nodeEnv !== 'test') {
  app.use(morgan('dev'));
}

// API Routes — disable caching for API responses
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, routes);

// Health check
app.get('/health', async (_req, res) => {
  let dbStatus = 'unknown';
  try {
    await pool.query('SELECT NOW()');
    dbStatus = 'connected';
  } catch {
    dbStatus = 'disconnected';
  }
  res.json({
    success: true,
    message: 'Lending Management API is running',
    timestamp: new Date().toISOString(),
    database: dbStatus,
  });
});

// Error handling
app.use(errorHandler);

// 404 handler (frontend served by Vercel)
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

export default app;
