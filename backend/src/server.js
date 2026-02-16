import express from 'express';
import dotenv from 'dotenv';
import connectDB from './config/database.js';
import { connectRedis } from './config/redis.js';
import logger from './config/logger.js';
import healthService from './services/health.service.js';
import { validateEnvironment } from './config/validation.js';

import {
  helmetConfig,
  limiter,
  sanitizeInput,
  watermark,
} from './middleware/security.js';

import {
  requestLogger,
  performanceMonitor,
  errorTracker,
} from './middleware/monitoring.js';

import { memoryMonitor } from './middleware/performance.js';

// Routes
import authRoutes from './routes/auth.routes.js';
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
import legacyRoutes from './routes/index.js';

dotenv.config();

// Validate env in production
if (process.env.NODE_ENV === 'production') {
  validateEnvironment();
}

// DB
connectDB();

// Redis (safe fallback)
(async () => {
  try {
    await connectRedis();
    logger.info('Redis connected');
  } catch (err) {
    logger.warn('Redis unavailable, continuing without cache');
  }
})();

const app = express();

/* =========================================================
   🔥 CORS + PREFLIGHT (MUST BE FIRST)
   ========================================================= */
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS'
  );
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

/* =========================================================
   🔐 SECURITY MIDDLEWARE
   ========================================================= */
app.use(helmetConfig);
app.use(limiter);
app.use(watermark);

/* =========================================================
   📊 MONITORING (PRODUCTION ONLY)
   ========================================================= */
if (process.env.NODE_ENV === 'production') {
  app.use(requestLogger);
  app.use(performanceMonitor);
  memoryMonitor();
}

/* =========================================================
   🧾 BODY PARSERS
   ========================================================= */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* =========================================================
   🧹 SANITIZATION
   ========================================================= */
app.use(sanitizeInput);

/* =========================================================
   📂 STATIC FILES
   ========================================================= */
app.use('/uploads', express.static('uploads'));

/* =========================================================
   ❤️ HEALTH ROUTES
   ========================================================= */
app.use('/', healthRoutes);

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

/* =========================================================
   🧪 TEST ROUTES
   ========================================================= */
app.get('/test', (req, res) => {
  res.json({ success: true, message: 'Server running' });
});

app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API accessible',
    origin: req.headers.origin,
  });
});

app.get('/api/v1/auth/test', (req, res) => {
  res.json({ success: true, message: 'Auth routes working' });
});

/* =========================================================
   🚀 API ROUTES
   ========================================================= */
app.use('/api/v1/auth', authRoutes);
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

// Legacy
app.use('/api', legacyRoutes);

/* =========================================================
   ❌ 404 HANDLER
   ========================================================= */
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

/* =========================================================
   🧯 ERROR HANDLING
   ========================================================= */
app.use(errorTracker);

app.use((err, req, res, _next) => {
  logger.error(err);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Server error',
  });
});

/* =========================================================
   ▶️ START SERVER
   ========================================================= */
if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    logger.info(`✅ Server running on port ${PORT}`);
    logger.info(`✅ CORS + OPTIONS fixed`);
  });
}

export default app;
