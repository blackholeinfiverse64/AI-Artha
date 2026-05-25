import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import {
  getCashFlowSignal,
  getSignalSnapshot,
  evaluateOverdueInvoices,
  listSignals,
  reconstructTrace,
  pipelineCheck,
} from '../controllers/signal.controller.js';

const router = express.Router();

router.use(protect);

// Existing endpoints — unchanged
router.get('/cash-flow', getCashFlowSignal);
router.get('/snapshot',  getSignalSnapshot);

// Signal list
router.get('/', listSignals);

// Trace reconstruction (Phase 2B)
router.get('/trace/:traceId', reconstructTrace);

// Pipeline dry-run check (Phase 2A)
router.get('/:signalId/pipeline-check', authorize('admin', 'accountant'), pipelineCheck);

// Overdue invoice evaluation
router.post('/evaluate/overdue-invoices', authorize('admin', 'accountant'), evaluateOverdueInvoices);

export default router;
