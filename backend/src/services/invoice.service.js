import Decimal from 'decimal.js';
import mongoose from 'mongoose';
import Invoice from '../models/Invoice.js';
import ledgerService from './ledger.service.js';
import ChartOfAccounts from '../models/ChartOfAccounts.js';
import logger from '../config/logger.js';
import cacheService from './cache.service.js';

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
        },
        userId
      );
      
      // Post the journal entry
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
      
      if (!arAccount || !revenueAccount) {
        throw new Error('Required accounts not found');
      }
      
      const journalEntry = await ledgerService.createJournalEntry(
        {
          date: invoice.invoiceDate,
          description: `Invoice ${invoice.invoiceNumber} to ${invoice.customerName}`,
          lines: [
            {
              account: arAccount._id,
              debit: invoice.totalAmount,
              credit: '0',
              description: 'Accounts Receivable',
            },
            {
              account: revenueAccount._id,
              debit: '0',
              credit: invoice.totalAmount,
              description: 'Sales Revenue',
            },
          ],
          reference: invoice.invoiceNumber,
          tags: ['invoice', invoice.invoiceNumber],
        },
        userId
      );
      
      // Post the journal entry
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