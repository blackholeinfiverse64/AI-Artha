import express from 'express';
import { body } from 'express-validator';
import {
  createEntry,
  postEntry,
  getEntries,
  getEntry,
  voidEntry,
  getBalances,
  getSummary,
  verifyChain,
  verifyChainFromEntry,
  getChainStats,
  verifyLedgerChain,
  getChainSegment,
  verifySingleEntry,
  createJournalEntry,
  postJournalEntry,
} from '../controllers/ledger.controller.js';
import { protect, authorize } from '../middleware/auth.js';
import { validate, auditLogger } from '../middleware/security.js';
import { cacheMiddleware } from '../middleware/cache.js';

const router = express.Router();

// Validation rules
const createEntryValidation = [
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('lines').isArray({ min: 2 }).withMessage('At least 2 lines required'),
  body('lines.*.account').isMongoId().withMessage('Valid account ID required'),
  body('lines.*.debit').optional().isNumeric().withMessage('Debit must be a number'),
  body('lines.*.credit').optional().isNumeric().withMessage('Credit must be a number'),
];

const voidEntryValidation = [
  body('reason').trim().notEmpty().withMessage('Reason for voiding is required'),
];

// All routes require authentication
router.use(protect);

// Routes
router
  .route('/entries')
  .get(cacheMiddleware(300), getEntries)
  .post(
    authorize('accountant', 'admin'),
    createEntryValidation,
    validate,
    auditLogger('journal_entry.created', 'JournalEntry'),
    createEntry
  );

router
  .route('/entries/:id')
  .get(getEntry);

router
  .route('/entries/:id/post')
  .post(
    authorize('accountant', 'admin'),
    auditLogger('journal_entry.posted', 'JournalEntry'),
    postEntry
  );

router
  .route('/entries/:id/void')
  .post(
    authorize('accountant', 'admin'),
    voidEntryValidation,
    validate,
    auditLogger('journal_entry.voided', 'JournalEntry'),
    voidEntry
  );

router.route('/balances').get(cacheMiddleware(600), getBalances);

router.route('/summary').get(cacheMiddleware(300), getSummary);

router.route('/verify').get(authorize('admin'), verifyChain);

// Enhanced hash-chain endpoints
router.route('/entries/:id/verify-chain').get(authorize('admin'), verifyChainFromEntry);
router.route('/chain-stats').get(authorize('admin'), cacheMiddleware(300), getChainStats);
router.route('/verify-chain').get(authorize('admin'), verifyLedgerChain);
router.route('/chain-segment').get(authorize('admin'), getChainSegment);
router.route('/entries/:id/verify').get(verifySingleEntry);

// Legacy routes for backward compatibility
router.get('/journal-entries', getEntries);
router.post('/journal-entries', authorize('accountant', 'admin'), createEntryValidation, validate, auditLogger('journal_entry.created', 'JournalEntry'), createEntry);
router.get('/journal-entries/:id', getEntry);
router.post('/journal-entries/:id/post', authorize('accountant', 'admin'), auditLogger('journal_entry.posted', 'JournalEntry'), postEntry);
router.post('/journal-entries/:id/void', authorize('accountant', 'admin'), voidEntryValidation, validate, auditLogger('journal_entry.voided', 'JournalEntry'), voidEntry);
router.get('/verify-chain', authorize('admin'), verifyChain);

export default router;