import express from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import connectDB from './config/database.js';
import { connectRedis } from './config/redis.js';
import logger from './config/logger.js';
import healthService from './services/health.service.js';
import { validateEnvironment } from './config/validation.js';
import { buildAllowedOrigins } from './config/cors.js';
import { getResolvedUrls } from './config/urls.js';
import {
  protect,
  clearBlackholeCookie,
} from './middleware/auth.js';
import { login } from './controllers/auth.controller.js';

import {
  helmetConfig,
  limiter,
  sanitizeInput,
  watermark,
  authPasswordLimiter,
} from './middleware/security.js';

import {
  requestLogger,
  performanceMonitor,
  errorTracker,
} from './middleware/monitoring.js';

import { memoryMonitor } from './middleware/performance.js';

import ledgerRoutes from './routes/ledger.routes.js';
import accountsRoutes from './routes/accounts.routes.js';
import reportsRoutes from './routes/reports.routes.js';
import invoiceRoutes from './routes/invoice.routes.js';
import expenseRoutes from './routes/expense.routes.js';
import insightflowRoutes from './routes/insightflow.routes.js';
import gstRoutes from './routes/gst.routes.js';
import tdsRoutes from './routes/tds.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import performanceRoutes from './routes/performance.routes.js';
import databaseRoutes from './routes/database.routes.js';
import healthRoutes from './routes/health.routes.js';
import usersRoutes from './routes/users.routes.js';
import bankStatementRoutes from './routes/bankStatement.routes.js';
import smartUploadRoutes from './routes/smartUpload.routes.js';
import signalRoutes from './routes/signal.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { SPA_URL, API_PUBLIC_URL } = getResolvedUrls();

if (process.env.NODE_ENV === 'production') {
  validateEnvironment();
}

connectDB();

(async () => {
  try {
    await connectRedis();
    logger.info('Redis connected');
  } catch (err) {
    logger.warn('Redis unavailable, continuing without cache');
  }
})();

const app = express();

// Render / reverse proxies: required so rate limits and req.ip use the real client (X-Forwarded-For).
app.set('trust proxy', process.env.TRUST_PROXY === '0' || process.env.TRUST_PROXY === 'false' ? false : 1);

const ALLOWED_ORIGINS = buildAllowedOrigins({
  frontendUrl: SPA_URL,
  appUrl: API_PUBLIC_URL,
  corsOrigin: process.env.CORS_ORIGIN,
  corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS,
  authServerUrl: '',
  // Default on: local Vite (localhost:5173) can call prod API without extra Render env.
  // Set ALLOW_LOCALHOST_CORS=false to disable.
  allowLocalhostCors: process.env.ALLOW_LOCALHOST_CORS !== 'false',
});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.header('Access-Control-Allow-Origin', SPA_URL);
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(helmetConfig);
app.use(limiter);
app.use(watermark);

if (process.env.NODE_ENV === 'production') {
  app.use(requestLogger);
  app.use(performanceMonitor);
  memoryMonitor();
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(sanitizeInput);

app.use('/uploads', express.static('uploads'));

app.use('/', healthRoutes);

/** Root: send browsers to the SPA (when someone opens the API host in a browser). */
app.get('/', (req, res) => {
  if (req.accepts('html')) {
    return res.redirect(`${SPA_URL}/`);
  }
  res.json({ success: true, service: 'artha-api', docs: 'Use /api/v1/*' });
});

function redirectToSpaPath(req, res, pathName) {
  try {
    const target = new URL(`${SPA_URL}${pathName}`);
    const requestOrigin = `${req.protocol}://${req.get('host')}`;
    // Prevent accidental redirect loops when API and SPA are configured to the same origin+path.
    if (target.origin === requestOrigin && target.pathname === req.path) {
      return res.status(404).json({ success: false, message: 'Route not found' });
    }
    return res.redirect(target.toString());
  } catch {
    return res.redirect(`${SPA_URL}${pathName}`);
  }
}

app.get(['/login', '/dashboard'], (req, res) => {
  return redirectToSpaPath(req, res, req.path);
});

app.get('/api/health', async (req, res) => {
  try {
    const health = await healthService.getSystemHealth();
    res.status(health.status === 'healthy' ? 200 : 503).json({
      success: health.status === 'healthy',
      message: `ARTHA API is ${health.status}`,
      data: health,
    });
  } catch (err) {
    res.status(503).json({ success: false, message: 'Health check failed' });
  }
});

app.get('/test', (req, res) => {
  res.json({ success: true, message: 'Server running' });
});

app.get('/api/test', (req, res) => {
  res.json({ success: true, message: 'API accessible', origin: req.headers.origin });
});

app.get('/api/v1/auth/test', (req, res) => {
  res.json({ success: true, message: 'Auth routes working' });
});

/** Local password login — returns JWT for `Authorization: Bearer`. */
app.post('/api/v1/auth/login', authPasswordLimiter, login);

app.get('/api/v1/auth/me', protect, (req, res) => {
  res.json({
    success: true,
    data: {
      id: req.user._id,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      roles: req.user.roles,
      allowedApps: req.user.allowedApps,
    },
  });
});

/** Clear legacy session cookie and send user to SPA login (client clears Bearer token). */
app.get('/logout', (req, res) => {
  clearBlackholeCookie(res);
  return res.redirect(`${SPA_URL}/login`);
});

app.use('/api/v1/ledger', ledgerRoutes);
app.use('/api/v1/accounts', accountsRoutes);
app.use('/api/v1/reports', reportsRoutes);
app.use('/api/v1/invoices', invoiceRoutes);
app.use('/api/v1/expenses', expenseRoutes);
app.use('/api/v1/insightflow', insightflowRoutes);
app.use('/api/v1/gst', gstRoutes);
app.use('/api/v1/tds', tdsRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/performance', performanceRoutes);
app.use('/api/v1/database', databaseRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/statements', bankStatementRoutes);
app.use('/api/v1/upload', smartUploadRoutes);
app.use('/api/v1/signals', signalRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorTracker);

app.use((err, req, res, _next) => {
  logger.error(err);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Server error',
  });
});

if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`SPA (public app): ${SPA_URL}`);
    logger.info(`API public URL: ${API_PUBLIC_URL}`);
    const enforcedAppId = process.env.APP_ID || process.env.BHIV_APP_ID;
    if (enforcedAppId) {
      logger.info(`allowedApps enforced for APP_ID: ${enforcedAppId}`);
    }
  });
}

export default app;
