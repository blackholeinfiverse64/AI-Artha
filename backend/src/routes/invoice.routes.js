import express from 'express';
import { body } from 'express-validator';
import {
  createInvoice,
  getInvoices,
  getInvoice,
  updateInvoice,
  sendInvoice,
  recordPayment,
  cancelInvoice,
  getInvoiceStats,
} from '../controllers/invoice.controller.js';
import { protect, authorize } from '../middleware/auth.js';
import { validate, auditLogger } from '../middleware/security.js';
import { cacheMiddleware } from '../middleware/cache.js';

const router = express.Router();

// Validation rules with support for both items and lines
const invoiceValidation = [
  body('customerName').trim().notEmpty().withMessage('Customer name is required'),
  body('invoiceDate').isISO8601().withMessage('Valid invoice date required'),
  body('dueDate').isISO8601().withMessage('Valid due date required'),
  // Support both items and lines for backward compatibility
  body().custom((value, { req }) => {
    const hasItems = req.body.items && Array.isArray(req.body.items) && req.body.items.length > 0;
    const hasLines = req.body.lines && Array.isArray(req.body.lines) && req.body.lines.length > 0;
    
    if (!hasItems && !hasLines) {
      throw new Error('At least 1 line item required (use either items or lines field)');
    }
    return true;
  }),
  // Validate monetary fields as numeric strings
  body('subtotal').optional().isString().matches(/^\d+(\.\d{1,2})?$/).withMessage('Invalid subtotal format'),
  body('totalAmount').optional().isString().matches(/^\d+(\.\d{1,2})?$/).withMessage('Invalid total amount format'),
  body('taxAmount').optional().isString().matches(/^\d+(\.\d{1,2})?$/).withMessage('Invalid tax amount format'),
];

const paymentValidation = [
  body('amount').isNumeric().withMessage('Payment amount is required'),
  body('paymentMethod')
    .isIn(['cash', 'bank_transfer', 'check', 'card', 'upi', 'other'])
    .withMessage('Valid payment method required'),
];

// All routes require authentication
router.use(protect);

// Routes
router.route('/stats').get(cacheMiddleware(900), getInvoiceStats);

router
  .route('/')
  .get(cacheMiddleware(300), getInvoices)
  .post(
    authorize('accountant', 'admin'),
    invoiceValidation,
    validate,
    auditLogger('invoice.created', 'Invoice'),
    createInvoice
  );

router
  .route('/:id')
  .get(cacheMiddleware(600), getInvoice)
  .put(
    authorize('accountant', 'admin'),
    validate,
    auditLogger('invoice.updated', 'Invoice'),
    updateInvoice
  );

router
  .route('/:id/send')
  .post(
    authorize('accountant', 'admin'),
    auditLogger('invoice.sent', 'Invoice'),
    sendInvoice
  );

router
  .route('/:id/payment')
  .post(
    authorize('accountant', 'admin'),
    paymentValidation,
    validate,
    auditLogger('invoice.payment_recorded', 'Invoice'),
    recordPayment
  );

router
  .route('/:id/cancel')
  .post(
    authorize('accountant', 'admin'),
    auditLogger('invoice.cancelled', 'Invoice'),
    cancelInvoice
  );

export default router;