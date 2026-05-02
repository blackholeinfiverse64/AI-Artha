import Decimal from 'decimal.js';
import mongoose from 'mongoose';
import { randomUUID } from 'crypto';
import Invoice from '../models/Invoice.js';
import CompanySettings from '../models/CompanySettings.js';
import ledgerService from './ledger.service.js';
import ChartOfAccounts from '../models/ChartOfAccounts.js';
import logger from '../config/logger.js';
import cacheService from './cache.service.js';
import { calculateGSTBreakdown, buildGSTValidationError } from './gstEngine.service.js';

class InvoiceService {
  /**
   * Create a new invoice
   */
  async createInvoice(invoiceData, userId) {
    try {
      const invoice = new Invoice({
        ...invoiceData,
        createdBy: userId,
      });
      
      await invoice.save();
      logger.info(`Invoice created: ${invoice.invoiceNumber}`);
      
      return invoice;
    } catch (error) {
      logger.error('Create invoice error:', error);
      throw error;
    }
  }
  
  /**
   * Get invoices with filters and pagination
   */
  async getInvoices(filters = {}, pagination = {}) {
    const {
      status,
      dateFrom,
      dateTo,
      customerName,
      search,
    } = filters;
    
    const {
      page = 1,
      limit = 20,
      sortBy = 'invoiceDate',
      sortOrder = 'desc',
    } = pagination;
    
    const query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (dateFrom || dateTo) {
      query.invoiceDate = {};
      if (dateFrom) query.invoiceDate.$gte = new Date(dateFrom);
      if (dateTo) query.invoiceDate.$lte = new Date(dateTo);
    }
    
    if (customerName) {
      query.customerName = { $regex: customerName, $options: 'i' };
    }
    
    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { customerEmail: { $regex: search, $options: 'i' } },
      ];
    }
    
    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    
    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .populate('createdBy', 'name email')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Invoice.countDocuments(query),
    ]);
    
    return {
      invoices,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }
  
  /**
   * Get a single invoice by ID
   */
  async getInvoiceById(invoiceId) {
    const invoice = await Invoice.findById(invoiceId)
      .populate('createdBy', 'name email')
      .populate('payments.journalEntryId');
    
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    
    return invoice;
  }
  
  /**
   * Update invoice
   */
  async updateInvoice(invoiceId, updateData) {
    const invoice = await Invoice.findById(invoiceId);
    
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    
    if (invoice.status === 'paid') {
      throw new Error('Cannot update a paid invoice');
    }
    
    if (invoice.status === 'cancelled') {
      throw new Error('Cannot update a cancelled invoice');
    }
    
    Object.assign(invoice, updateData);
    await invoice.save();
    
    logger.info(`Invoice updated: ${invoice.invoiceNumber}`);
    
    return invoice;
  }
  
  /**
   * Record payment for invoice
   */
  async recordPayment(invoiceId, paymentData, userId) {
    const { withTransaction } = await import('../config/database.js');
    
    return await withTransaction(async (session) => {
      const invoice = session ? await Invoice.findById(invoiceId).session(session) : await Invoice.findById(invoiceId);
      
      if (!invoice) {
        throw new Error('Invoice not found');
      }
      
      if (invoice.status === 'cancelled') {
        throw new Error('Cannot record payment for cancelled invoice');
      }
      
      const paymentAmount = new Decimal(paymentData.amount);
      const amountDue = new Decimal(invoice.amountDue);
      
      if (paymentAmount.greaterThan(amountDue)) {
        throw new Error('Payment amount exceeds amount due');
      }
      
      // Get accounts
      const cashAccount = await ChartOfAccounts.findOne({ code: '1010' }).session(session);
      const arAccount = await ChartOfAccounts.findOne({ code: '1100' }).session(session);
      
      if (!cashAccount || !arAccount) {
        throw new Error('Required accounts not found');
      }
      
      // Create journal entry for payment
      const traceId = randomUUID();
      const journalEntry = await ledgerService.createJournalEntry(
        {
          date: paymentData.paymentDate || new Date(),
          description: `Payment received for invoice ${invoice.invoiceNumber}`,
          lines: [
            {
              account: cashAccount._id,
              debit: paymentAmount.toString(),
              credit: '0',
              description: `Payment via ${paymentData.paymentMethod}`,
            },
            {
              account: arAccount._id,
              debit: '0',
              credit: paymentAmount.toString(),
              description: `Reduce AR for ${invoice.customerName}`,
            },
          ],
          reference: invoice.invoiceNumber,
          tags: ['invoice-payment', invoice.invoiceNumber],
          source: 'SYSTEM',
          trace_id: traceId,
          auditAction: 'INVOICE_PAYMENT_RECORDED',
        },
        userId
      );
      
      // Validate before posting to enforce draft -> validate -> post workflow
      await ledgerService.validateJournalEntry(journalEntry._id, userId);
      await ledgerService.postJournalEntry(journalEntry._id, userId);
      
      // Add payment to invoice
      invoice.payments.push({
        amount: paymentAmount.toString(),
        paymentDate: paymentData.paymentDate || new Date(),
        paymentMethod: paymentData.paymentMethod,
        reference: paymentData.reference,
        journalEntryId: journalEntry._id,
        notes: paymentData.notes,
      });
      
      // Update amount paid
      const currentPaid = new Decimal(invoice.amountPaid);
      invoice.amountPaid = currentPaid.plus(paymentAmount).toString();
      
      await invoice.save({ session });
      
      // Invalidate related caches
      await cacheService.invalidateInvoiceCaches();
      await cacheService.invalidateLedgerCaches();
      
      logger.info(`Payment recorded for invoice: ${invoice.invoiceNumber}`);
      
      return invoice;
    });
  }
  
  /**
   * Send invoice (change status to sent)
   */
  async sendInvoice(invoiceId, userId) {
    const { withTransaction } = await import('../config/database.js');
    
    return await withTransaction(async (session) => {
      const invoice = session ? await Invoice.findById(invoiceId).session(session) : await Invoice.findById(invoiceId);
      
      if (!invoice) {
        throw new Error('Invoice not found');
      }
      
      if (invoice.status !== 'draft') {
        throw new Error('Only draft invoices can be sent');
      }
      
      // Create journal entry to record AR
      const arAccount = await ChartOfAccounts.findOne({ code: '1100' }).session(session);
      const revenueAccount = await ChartOfAccounts.findOne({ code: '4000' }).session(session);
      let outputCGST = await ChartOfAccounts.findOne({ code: '2311' }).session(session);
      let outputSGST = await ChartOfAccounts.findOne({ code: '2312' }).session(session);
      let outputIGST = await ChartOfAccounts.findOne({ code: '2313' }).session(session);

      const settings = await CompanySettings.findById('company_settings').session(session);
      const companyState = settings?.address?.state || (settings?.gstin ? settings.gstin.substring(0, 2) : null);

      if (!companyState) {
        throw buildGSTValidationError('Company state is required for GST', {
          invoiceId: String(invoice._id),
        });
      }

      const customerState = invoice.customerGSTIN
        ? invoice.customerGSTIN.substring(0, 2)
        : (invoice.customerState || invoice.customerAddress?.state);

      const invoiceLines = (invoice.lines && invoice.lines.length)
        ? invoice.lines
        : (invoice.items || []);

      if (!invoiceLines.length) {
        throw new Error('Invoice lines are required');
      }

      if (!customerState) {
        throw buildGSTValidationError('Customer state is required for GST', {
          invoiceId: String(invoice._id),
        });
      }

      if (!outputCGST) {
        outputCGST = await ChartOfAccounts.create([
          {
            code: '2311',
            name: 'Output CGST',
            type: 'Liability',
            subtype: 'Current Liability',
            normalBalance: 'credit',
          },
        ], { session });
        outputCGST = outputCGST[0];
      }

      if (!outputSGST) {
        outputSGST = await ChartOfAccounts.create([
          {
            code: '2312',
            name: 'Output SGST',
            type: 'Liability',
            subtype: 'Current Liability',
            normalBalance: 'credit',
          },
        ], { session });
        outputSGST = outputSGST[0];
      }

      if (!outputIGST) {
        outputIGST = await ChartOfAccounts.create([
          {
            code: '2313',
            name: 'Output IGST',
            type: 'Liability',
            subtype: 'Current Liability',
            normalBalance: 'credit',
          },
        ], { session });
        outputIGST = outputIGST[0];
      }
      
      if (!arAccount || !revenueAccount || !outputCGST || !outputSGST || !outputIGST) {
        throw new Error('Required accounts not found');
      }

      const traceId = randomUUID();
      let totalTaxable = new Decimal(0);
      let totalCGST = new Decimal(0);
      let totalSGST = new Decimal(0);
      let totalIGST = new Decimal(0);
      let taxType = null;
      const gstDetails = [];

      invoiceLines.forEach((line, index) => {
        const quantity = new Decimal(line.quantity || 0);
        const unitPrice = new Decimal(line.unitPrice || 0);
        const lineAmount = (line.amount !== undefined && line.amount !== null)
          ? new Decimal(line.amount)
          : quantity.times(unitPrice);
        const lineRate = (line.taxRate !== undefined && line.taxRate !== null)
          ? line.taxRate
          : invoice.taxRate;

        if (lineRate === undefined || lineRate === null) {
          throw buildGSTValidationError('GST rate is required for invoice line', {
            invoiceId: String(invoice._id),
            line: index + 1,
          });
        }

        const detail = calculateGSTBreakdown({
          transaction_type: 'sale',
          amount: lineAmount.toDecimalPlaces(2).toString(),
          gst_rate: lineRate,
          supplier_state: customerState,
          company_state: companyState,
        });

        if (taxType === null) {
          taxType = detail.is_interstate ? 'interstate' : 'intrastate';
        }

        if ((detail.is_interstate && taxType !== 'interstate') ||
            (!detail.is_interstate && taxType !== 'intrastate')) {
          throw buildGSTValidationError('Mixed GST tax types are not allowed', {
            invoiceId: String(invoice._id),
          });
        }

        gstDetails.push({
          ...detail,
          amount: lineAmount.toDecimalPlaces(2).toString(),
        });

        totalTaxable = totalTaxable.plus(detail.taxable_value || 0);
        totalCGST = totalCGST.plus(detail.cgst || 0);
        totalSGST = totalSGST.plus(detail.sgst || 0);
        totalIGST = totalIGST.plus(detail.igst || 0);
      });

      const totalTax = totalCGST.plus(totalSGST).plus(totalIGST);
      const totalAmount = totalTaxable.plus(totalTax);
      const tolerance = new Decimal('0.01');

      if (invoice.subtotal && totalTaxable.minus(invoice.subtotal).abs().greaterThan(tolerance)) {
        throw buildGSTValidationError('Invoice subtotal does not match GST calculation', {
          invoiceId: String(invoice._id),
          expected: totalTaxable.toString(),
          actual: invoice.subtotal,
        });
      }

      if (invoice.taxAmount && totalTax.minus(invoice.taxAmount).abs().greaterThan(tolerance)) {
        throw buildGSTValidationError('Invoice tax amount does not match GST calculation', {
          invoiceId: String(invoice._id),
          expected: totalTax.toString(),
          actual: invoice.taxAmount,
        });
      }

      if (invoice.totalAmount && totalAmount.minus(invoice.totalAmount).abs().greaterThan(tolerance)) {
        throw buildGSTValidationError('Invoice total amount does not match GST calculation', {
          invoiceId: String(invoice._id),
          expected: totalAmount.toString(),
          actual: invoice.totalAmount,
        });
      }

      invoice.subtotal = totalTaxable.toString();
      invoice.taxAmount = totalTax.toString();
      invoice.totalAmount = totalAmount.toString();
      invoice.gstBreakdown = {
        cgst: totalCGST.toString(),
        sgst: totalSGST.toString(),
        igst: totalIGST.toString(),
        cess: '0',
      };
      
      const lines = [
        {
          account: arAccount._id,
          debit: totalAmount.toString(),
          credit: '0',
          description: 'Accounts Receivable',
        },
        {
          account: revenueAccount._id,
          debit: '0',
          credit: totalTaxable.toString(),
          description: 'Sales Revenue',
        },
      ];

      if (totalCGST.greaterThan(0)) {
        lines.push({
          account: outputCGST._id,
          debit: '0',
          credit: totalCGST.toString(),
          description: 'Output CGST',
        });
      }

      if (totalSGST.greaterThan(0)) {
        lines.push({
          account: outputSGST._id,
          debit: '0',
          credit: totalSGST.toString(),
          description: 'Output SGST',
        });
      }

      if (totalIGST.greaterThan(0)) {
        lines.push({
          account: outputIGST._id,
          debit: '0',
          credit: totalIGST.toString(),
          description: 'Output IGST',
        });
      }

      const journalEntry = await ledgerService.createJournalEntry(
        {
          date: invoice.invoiceDate,
          description: `Invoice ${invoice.invoiceNumber} to ${invoice.customerName}`,
          lines,
          reference: invoice.invoiceNumber,
          tags: ['invoice', invoice.invoiceNumber],
          source: 'SYSTEM',
          trace_id: traceId,
          gstDetails,
          auditAction: 'INVOICE_SENT',
        },
        userId
      );
      
      // Validate before posting to enforce draft -> validate -> post workflow
      await ledgerService.validateJournalEntry(journalEntry._id, userId);
      await ledgerService.postJournalEntry(journalEntry._id, userId);
      
      // Update invoice status
      invoice.status = 'sent';
      await invoice.save({ session });
      
      logger.info(`Invoice sent: ${invoice.invoiceNumber}`);
      
      return invoice;
    });
  }
  
  /**
   * Cancel invoice
   */
  async cancelInvoice(invoiceId, reason, userId) {
    const invoice = await Invoice.findById(invoiceId);
    
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    
    if (invoice.status === 'paid' || invoice.status === 'partial') {
      throw new Error('Cannot cancel an invoice with payments');
    }
    
    invoice.status = 'cancelled';
    invoice.notes = (invoice.notes || '') + `\nCancelled: ${reason}`;
    await invoice.save();
    
    logger.info(`Invoice cancelled: ${invoice.invoiceNumber}`);
    
    return invoice;
  }
  
  /**
   * Get invoice statistics
   */
  async getInvoiceStats(dateFrom, dateTo) {
    // Try to get from cache first
    const cached = await cacheService.getCachedInvoiceStats(dateFrom, dateTo);
    if (cached) {
      return cached;
    }

    const match = {};
    
    if (dateFrom || dateTo) {
      match.invoiceDate = {};
      if (dateFrom) match.invoiceDate.$gte = new Date(dateFrom);
      if (dateTo) match.invoiceDate.$lte = new Date(dateTo);
    }
    
    const [stats, totalStats] = await Promise.all([
      Invoice.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalAmount: { $sum: { $toDouble: '$totalAmount' } },
            totalDue: {
              $sum: {
                $subtract: [
                  { $toDouble: '$totalAmount' },
                  { $toDouble: '$amountPaid' }
                ]
              }
            },
          },
        },
      ]),
      Invoice.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalCount: { $sum: 1 },
            totalAmount: { $sum: { $toDouble: '$totalAmount' } },
            totalPaid: { $sum: { $toDouble: '$amountPaid' } },
            totalDue: {
              $sum: {
                $subtract: [
                  { $toDouble: '$totalAmount' },
                  { $toDouble: '$amountPaid' }
                ]
              }
            },
          },
        },
      ]),
    ]);
    
    const summary = {
      draft: { count: 0, amount: '0.00', due: '0.00' },
      sent: { count: 0, amount: '0.00', due: '0.00' },
      partial: { count: 0, amount: '0.00', due: '0.00' },
      paid: { count: 0, amount: '0.00', due: '0.00' },
      overdue: { count: 0, amount: '0.00', due: '0.00' },
      cancelled: { count: 0, amount: '0.00', due: '0.00' },
    };
    
    stats.forEach(stat => {
      summary[stat._id] = {
        count: stat.count,
        amount: stat.totalAmount.toFixed(2),
        due: stat.totalDue.toFixed(2),
      };
    });
    
    const totals = totalStats[0] || {
      totalCount: 0,
      totalAmount: 0,
      totalPaid: 0,
      totalDue: 0,
    };
    
    summary.total = {
      count: totals.totalCount,
      amount: totals.totalAmount.toFixed(2),
      paid: totals.totalPaid.toFixed(2),
      due: totals.totalDue.toFixed(2),
    };
    
    // Cache the result
    await cacheService.cacheInvoiceStats(dateFrom, dateTo, summary);
    
    return summary;
  }
}

export default new InvoiceService();