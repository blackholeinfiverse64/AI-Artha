import express from 'express';
import { protect } from '../middleware/auth.js';
import { getCashFlowSignal, getSignalSnapshot } from '../controllers/signal.controller.js';

const router = express.Router();

router.use(protect);
router.get('/cash-flow', getCashFlowSignal);
router.get('/snapshot', getSignalSnapshot);

export default router;
