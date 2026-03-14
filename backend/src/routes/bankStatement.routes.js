import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { uploadFile, handleUploadError } from '../middleware/upload.js';
import {
  uploadBankStatement,
  getBankStatements,
  getBankStatement,
  processBankStatement,
  matchTransactions,
  createExpensesFromTransactions,
} from '../controllers/bankStatement.controller.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Upload statement (CSV format preferred)
router.post(
  '/upload',
  uploadFile.single('statement'),
  handleUploadError,
  uploadBankStatement
);

// Get all statements
router.get('/', getBankStatements);

// Get single statement
router.get('/:id', getBankStatement);

// Process statement manually
router.post('/:id/process', processBankStatement);

// Match transactions with expenses
router.post('/:id/match', matchTransactions);

// Create expenses from selected transactions
router.post('/:id/create-expenses', createExpensesFromTransactions);

export default router;
