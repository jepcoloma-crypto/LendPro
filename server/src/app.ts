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

// Disable ETags to prevent 304 responses (API should always return fresh data)
app.set('etag', false);

// Security
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.allowedOrigins.includes(origin) || config.allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting (generous in dev)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.nodeEnv === 'production' ? 100 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
});
app.use('/api/auth', limiter);

// Static files (uploads) — authenticated access only
app.use('/uploads', authenticate, express.static(path.join(__dirname, '..', 'uploads')));

// In production, serve the built client app
if (config.nodeEnv === 'production') {
  app.use(express.static(path.join(__dirname, '..', '..', 'client', 'dist')));
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

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

// SPA fallback (production) / 404 handler
app.use((req, res) => {
  if (config.nodeEnv === 'production' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
    res.sendFile(path.join(__dirname, '..', '..', 'client', 'dist', 'index.html'));
  } else {
    res.status(404).json({ success: false, error: 'Route not found' });
  }
});

export default app;
