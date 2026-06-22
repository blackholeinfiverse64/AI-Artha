import express from 'express';
import tallyController from '../controllers/tally.controller.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.post('/export/vouchers', tallyController.exportVouchers);
router.post('/export/masters', tallyController.exportMasters);
router.post('/export/opening-balances', tallyController.exportOpeningBalances);
router.post('/export/gst-data', tallyController.exportGSTData);
router.post('/import/vouchers', tallyController.importVouchers);
router.post('/import/masters', tallyController.importMasters);
router.post('/validate-migration', tallyController.validateMigrationReadiness);

export default router;
