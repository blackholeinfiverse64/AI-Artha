import express from 'express';
import tantraController from '../controllers/tantra.controller.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Public endpoints
router.post('/register', tantraController.register);
router.post('/heartbeat', tantraController.heartbeat);
router.get('/health', tantraController.getSystemHealth);
router.get('/metrics', tantraController.getMetrics);

// Protected endpoints
router.use(protect);

router.post('/events', tantraController.emitEvent);
router.get('/metadata', tantraController.getOperationalMetadata);
router.get('/dashboard', tantraController.getDashboardData);
router.get('/evidence/:traceId', tantraController.getEvidenceByTrace);
router.get('/evidence', tantraController.getEvidenceSummary);

export default router;
