import { parse } from 'csv-parse/sync';
import mongoose from 'mongoose';
import BankStatement from '../models/BankStatement.js';
import Expense from '../models/Expense.js';
import Invoice from '../models/Invoice.js';
import ChartOfAccounts from '../models/ChartOfAccounts.js';
import ledgerService from './ledger.service.js';
import cacheService from './cache.service.js';
import logger from '../config/logger.js';
import fs from 'fs/promises';

class BankStatementService {
  /**
   * Upload and parse bank statement — triggers full auto-processing pipeline
   */
  async uploadBankStatement(statementData, userId, file) {
    try {
      const statement = new BankStatement({
        ...statementData,
        file: {
          filename: file.filename,
          path: file.path,
          mimetype: file.mimetype,
          size: file.size,
        },
        uploadedBy: userId,
        status: 'processing',
      });

      await statement.save();
      logger.info(`Bank statement uploaded: ${statement.statementNumber}`);

      this.processStatementFile(statement._id, userId).catch(err => {
        logger.error('Background statement processing error:', err);
      });

      return statement;
    } catch (error) {
      logger.error('Upload bank statement error:', error);
      throw error;
    }
  }

  /**
   * Full processing pipeline: parse → match expenses → match invoices → create expenses → post ledger
   */
  async processStatementFile(statementId, userId) {
    try {
      const statement = await BankStatement.findById(statementId);

      if (!statement) {
        throw new Error('Bank statement not found');
      }

      statement.status = 'processing';
      await statement.save();

      let transactions = [];
      const fileExtension = statement.file.mimetype.split('/').pop().toLowerCase();

      if (fileExtension === 'csv' || statement.file.path.endsWith('.csv')) {
        transactions = await this.parseCSV(statement.file.path);
      } else if (
        fileExtension.includes('excel') ||
        fileExtension.includes('spreadsheet') ||
        statement.file.path.endsWith('.xlsx') ||
        statement.file.path.endsWith('.xls')
      ) {
        transactions = await this.parseExcel(statement.file.path);
      } else if (fileExtension === 'pdf' || statement.file.path.endsWith('.pdf')) {
        transactions = await this.parsePDF(statement.file.path);
      } else {
        throw new Error('Unsupported file format. Please upload CSV, Excel, or PDF.');
      }

      const totalDebits = transactions
        .filter(t => t.type === 'debit')
        .reduce((sum, t) => sum + parseFloat(t.debit), 0);

      const totalCredits = transactions
        .filter(t => t.type === 'credit')
        .reduce((sum, t) => sum + parseFloat(t.credit), 0);

      statement.transactions = transactions;
      statement.totalDebits = totalDebits.toFixed(2);
      statement.totalCredits = totalCredits.toFixed(2);
      statement.transactionCount = transactions.length;
      statement.status = 'completed';
      statement.processedAt = new Date();

      await statement.save();

      logger.info(`Bank statement parsed: ${statement.statementNumber} (${transactions.length} transactions)`);

      // --- AUTO-RECONCILIATION PIPELINE ---
      const reconciliation = await this.autoReconcile(statement._id, userId || statement.uploadedBy);

      logger.info(`Bank statement fully processed: ${statement.statementNumber}`, reconciliation);

      return await BankStatement.findById(statementId);
    } catch (error) {
      const statement = await BankStatement.findById(statementId);
      if (statement) {
        statement.status = 'failed';
        statement.processingError = error.message;
        await statement.save();
      }

      logger.error('Process statement error:', error);
      throw error;
    }
  }

  /**
   * Auto-reconciliation: match existing expenses, match invoices to credits,
   * auto-create expenses from unmatched debits, and post journal entries.
   */
  async autoReconcile(statementId, userId) {
    const statement = await BankStatement.findById(statementId);
    if (!statement || statement.status !== 'completed') {
      throw new Error('Statement must be completed before reconciliation');
    }

    let matchedExpenses = 0;
    let matchedInvoices = 0;
    let autoCreatedExpenses = 0;
    let journalEntriesCreated = 0;

    // 1. Match debit transactions to existing expenses
    for (const transaction of statement.transactions) {
      if (transaction.type === 'debit' && !transaction.matched) {
        const expense = await Expense.findOne({
          date: {
            $gte: new Date(new Date(transaction.date).setDate(new Date(transaction.date).getDate() - 3)),
            $lte: new Date(new Date(transaction.date).setDate(new Date(transaction.date).getDate() + 3)),
          },
          totalAmount: transaction.debit,
          status: { $in: ['approved', 'recorded', 'pending'] },
        });

        if (expense) {
          transaction.matched = true;
          transaction.matchedExpenseId = expense._id;
          matchedExpenses++;
        }
      }
    }

    // 2. Match credit transactions to outstanding invoices
    for (const transaction of statement.transactions) {
      if (transaction.type === 'credit' && !transaction.matched) {
        const invoice = await Invoice.findOne({
          status: { $in: ['sent', 'partial', 'overdue'] },
          $expr: {
            $lte: [
              { $abs: { $subtract: [{ $toDouble: '$totalAmount' }, { $toDouble: transaction.credit }] } },
              0.01,
            ],
          },
          invoiceDate: {
            $lte: new Date(new Date(transaction.date).setDate(new Date(transaction.date).getDate() + 30)),
          },
        });

        if (invoice) {
          transaction.matched = true;
          transaction.matchedInvoiceId = invoice._id;
          matchedInvoices++;

          try {
            await this._autoRecordInvoicePayment(invoice, transaction, userId);
            journalEntriesCreated++;
          } catch (err) {
            logger.warn(`Auto invoice payment failed for ${invoice.invoiceNumber}: ${err.message}`);
          }
        }
      }
    }

    // 3. Auto-create expenses from unmatched debit transactions
    for (const transaction of statement.transactions) {
      if (transaction.type === 'debit' && !transaction.matched) {
        try {
          const expense = new Expense({
            date: transaction.date,
            vendor: transaction.payee || transaction.description.split(/[,-]/)[0].trim(),
            description: transaction.description,
            category: this._mapCategoryToExpenseCategory(transaction.category, transaction.description),
            amount: transaction.debit,
            taxAmount: '0',
            totalAmount: transaction.debit,
            paymentMethod: 'bank_transfer',
            status: 'pending',
            submittedBy: userId,
            notes: `Auto-created from bank statement: ${statement.statementNumber}`,
          });

          await expense.save();

          transaction.matched = true;
          transaction.matchedExpenseId = expense._id;
          transaction.autoCreated = true;
          autoCreatedExpenses++;
        } catch (err) {
          logger.warn(`Auto expense creation failed for transaction: ${err.message}`);
        }
      }
    }

    // 4. Auto-create journal entries for bank-recorded transactions (fee, interest, etc.)
    for (const transaction of statement.transactions) {
      if (transaction.matched && !transaction.journalEntryId) {
        try {
          const journalEntry = await this._autoCreateJournalEntry(transaction, statement, userId);
          if (journalEntry) {
            transaction.journalEntryId = journalEntry._id;
            journalEntriesCreated++;
          }
        } catch (err) {
          logger.warn(`Auto journal entry failed: ${err.message}`);
        }
      }
    }

    statement.reconciliation = {
      matchedExpenses,
      matchedInvoices,
      autoCreatedExpenses,
      journalEntriesCreated,
      reconciledAt: new Date(),
    };

    await statement.save();

    try {
      await cacheService.invalidateExpenseCaches();
      await cacheService.invalidateInvoiceCaches();
      await cacheService.invalidateLedgerCaches();
    } catch (err) {
      logger.warn('Cache invalidation failed:', err.message);
    }

    return statement.reconciliation;
  }

  /**
   * Auto-record a payment on an invoice from a bank credit transaction
   */
  async _autoRecordInvoicePayment(invoice, transaction, userId) {
    const cashAccount = await ChartOfAccounts.findOne({ code: '1010' });
    const arAccount = await ChartOfAccounts.findOne({ code: '1100' });

    if (!cashAccount || !arAccount) {
      throw new Error('Required accounts not found for invoice payment');
    }

    const paymentAmount = transaction.credit;

    const journalEntry = await ledgerService.createJournalEntry(
      {
        date: transaction.date,
        description: `Auto-payment received for invoice ${invoice.invoiceNumber} (bank statement)`,
        lines: [
          {
            account: cashAccount._id,
            debit: paymentAmount,
            credit: '0',
            description: `Bank deposit - ${transaction.description}`,
          },
          {
            account: arAccount._id,
            debit: '0',
            credit: paymentAmount,
            description: `Reduce AR for ${invoice.customerName}`,
          },
        ],
        reference: `${invoice.invoiceNumber}-AUTO`,
        tags: ['invoice-payment', 'auto-reconciled', invoice.invoiceNumber],
      },
      userId
    );

    await ledgerService.postJournalEntry(journalEntry._id, userId);

    invoice.payments.push({
      amount: paymentAmount,
      paymentDate: transaction.date,
      paymentMethod: 'bank_transfer',
      reference: transaction.reference || `Auto-matched from bank statement`,
      journalEntryId: journalEntry._id,
      notes: `Auto-reconciled from bank statement`,
    });

    const { default: Decimal } = await import('decimal.js');
    const currentPaid = new Decimal(invoice.amountPaid || 0);
    invoice.amountPaid = currentPaid.plus(new Decimal(paymentAmount)).toString();

    await invoice.save();
    return journalEntry;
  }

  /**
   * Auto-create a journal entry for a bank transaction (fees, interest, etc.)
   */
  async _autoCreateJournalEntry(transaction, statement, userId) {
    if (transaction.matchedExpenseId) {
      const expense = await Expense.findById(transaction.matchedExpenseId);
      if (expense && expense.status === 'recorded' && expense.journalEntryId) {
        return null;
      }
    }
    if (transaction.matchedInvoiceId) {
      return null;
    }

    const bankAccount = await ChartOfAccounts.findOne({ code: '1010' });
    if (!bankAccount) return null;

    let offsetAccount;
    const desc = transaction.description.toLowerCase();

    if (transaction.type === 'debit') {
      if (desc.includes('fee') || desc.includes('charge') || desc.includes('commission')) {
        offsetAccount = await ChartOfAccounts.findOne({ code: '6900' });
      } else if (desc.includes('interest')) {
        offsetAccount = await ChartOfAccounts.findOne({ code: '6200' });
      }
    } else if (transaction.type === 'credit') {
      if (desc.includes('interest')) {
        offsetAccount = await ChartOfAccounts.findOne({ code: '4000' });
      } else if (desc.includes('refund')) {
        offsetAccount = await ChartOfAccounts.findOne({ code: '4000' });
      }
    }

    if (!offsetAccount) return null;

    const amount = transaction.type === 'debit' ? transaction.debit : transaction.credit;

    const lines = transaction.type === 'debit'
      ? [
          { account: offsetAccount._id, debit: amount, credit: '0', description: transaction.description },
          { account: bankAccount._id, debit: '0', credit: amount, description: 'Bank payment' },
        ]
      : [
          { account: bankAccount._id, debit: amount, credit: '0', description: 'Bank receipt' },
          { account: offsetAccount._id, debit: '0', credit: amount, description: transaction.description },
        ];

    try {
      const journalEntry = await ledgerService.createJournalEntry(
        {
          date: transaction.date,
          description: `Auto: ${transaction.description} (${statement.statementNumber})`,
          lines,
          reference: transaction.reference || statement.statementNumber,
          tags: ['bank-statement', 'auto-reconciled'],
        },
        userId
      );

      await ledgerService.postJournalEntry(journalEntry._id, userId);
      return journalEntry;
    } catch (err) {
      logger.warn(`Journal entry creation skipped: ${err.message}`);
      return null;
    }
  }

  /**
   * Map bank transaction category to expense category
   */
  _mapCategoryToExpenseCategory(bankCategory, description) {
    const desc = (description || '').toLowerCase();

    if (desc.includes('rent') || desc.includes('lease')) return 'rent';
    if (desc.includes('electric') || desc.includes('water') || desc.includes('gas') || desc.includes('utility')) return 'utilities';
    if (desc.includes('insurance')) return 'insurance';
    if (desc.includes('travel') || desc.includes('flight') || desc.includes('hotel') || desc.includes('cab') || desc.includes('uber') || desc.includes('ola')) return 'travel';
    if (desc.includes('food') || desc.includes('restaurant') || desc.includes('meal') || desc.includes('swiggy') || desc.includes('zomato')) return 'meals';
    if (desc.includes('software') || desc.includes('subscription') || desc.includes('aws') || desc.includes('azure') || desc.includes('google cloud')) return 'software';
    if (desc.includes('marketing') || desc.includes('advertising') || desc.includes('ad ') || desc.includes('google ads') || desc.includes('facebook')) return 'marketing';
    if (desc.includes('office') || desc.includes('stationery') || desc.includes('supplies')) return 'supplies';
    if (desc.includes('salary') || desc.includes('payroll')) return 'professional_services';
    if (desc.includes('equipment') || desc.includes('furniture') || desc.includes('hardware')) return 'equipment';

    const categoryMap = {
      fee: 'other',
      payment: 'other',
      withdrawal: 'other',
      transfer: 'other',
    };
    return categoryMap[bankCategory] || 'other';
  }

  // ===== FILE PARSING =====

  async parseCSV(filePath) {
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      const transactions = records.map(record => {
        const date = this.parseDate(
          record.Date ||
            record['Transaction Date'] ||
            record['Txn Date'] ||
            record['Value Date']
        );

        const description =
          record.Description ||
          record['Particulars'] ||
          record['Narration'] ||
          record['Details'] ||
          '';

        const debit = parseFloat(
          record.Debit ||
            record.Withdrawal ||
            record.Out ||
            record.Amount ||
            0
        );

        const credit = parseFloat(
          record.Credit ||
            record.Deposit ||
            record.In ||
            0
        );

        const reference =
          record.Reference ||
          record['Ref No'] ||
          record['Cheque No'] ||
          record['Txn Id'] ||
          '';

        const balance = parseFloat(record.Balance || record['Running Balance'] || 0);

        const type = debit > 0 ? 'debit' : 'credit';
        const category = this.categorizeTransaction(description, type);

        return {
          date,
          description,
          reference,
          debit: debit > 0 ? debit.toFixed(2) : '0',
          credit: credit > 0 ? credit.toFixed(2) : '0',
          balance: balance > 0 ? balance.toFixed(2) : undefined,
          type,
          category,
          payee: this.extractPayee(description),
        };
      });

      return transactions.filter(t => t.date && (t.debit > 0 || t.credit > 0));
    } catch (error) {
      logger.error('Parse CSV error:', error);
      throw new Error('Failed to parse CSV file');
    }
  }

  async parseExcel(filePath) {
    try {
      const XLSX = await import('xlsx');
      const fileBuffer = await fs.readFile(filePath);
      const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const records = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (!records || records.length === 0) {
        throw new Error('No data found in Excel file');
      }

      const transactions = records.map(record => {
        const date = this.parseDate(
          record.Date ||
            record['Transaction Date'] ||
            record['Txn Date'] ||
            record['Value Date']
        );

        const description = String(
          record.Description ||
            record['Particulars'] ||
            record['Narration'] ||
            record['Details'] ||
            ''
        );

        const debit = parseFloat(
          record.Debit || record.Withdrawal || record.Out || record.Amount || 0
        );
        const credit = parseFloat(
          record.Credit || record.Deposit || record.In || 0
        );
        const reference = String(
          record.Reference || record['Ref No'] || record['Cheque No'] || record['Txn Id'] || ''
        );
        const balance = parseFloat(record.Balance || record['Running Balance'] || 0);

        const type = debit > 0 ? 'debit' : 'credit';
        const category = this.categorizeTransaction(description, type);

        return {
          date,
          description,
          reference,
          debit: debit > 0 ? debit.toFixed(2) : '0',
          credit: credit > 0 ? credit.toFixed(2) : '0',
          balance: balance > 0 ? balance.toFixed(2) : undefined,
          type,
          category,
          payee: this.extractPayee(description),
        };
      });

      const valid = transactions.filter(t => t.date && (t.debit > 0 || t.credit > 0));
      logger.info(`Parsed ${valid.length} transactions from Excel file`);
      return valid;
    } catch (error) {
      logger.error('Parse Excel error:', error);
      throw new Error(`Failed to parse Excel file: ${error.message}`);
    }
  }

  async parsePDF(filePath) {
    try {
      const pdfParse = (await import('pdf-parse')).default;
      const fileBuffer = await fs.readFile(filePath);
      const pdfData = await pdfParse(fileBuffer);
      const text = pdfData.text;

      const lines = text.split('\n').filter(line => line.trim().length > 0);
      const transactions = [];

      const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/;
      const amountPattern = /[\d,]+\.\d{2}/g;

      for (const line of lines) {
        const dateMatch = line.match(datePattern);
        if (!dateMatch) continue;

        const date = this.parseDate(dateMatch[1]);
        if (!date) continue;

        const amounts = line.match(amountPattern);
        if (!amounts || amounts.length === 0) continue;

        const parsedAmounts = amounts.map(a => parseFloat(a.replace(/,/g, '')));

        let debit = 0;
        let credit = 0;
        let balance = 0;

        if (parsedAmounts.length >= 3) {
          debit = parsedAmounts[0];
          credit = parsedAmounts[1];
          balance = parsedAmounts[2];
        } else if (parsedAmounts.length === 2) {
          const descLower = line.toLowerCase();
          if (descLower.includes('cr') || descLower.includes('credit') || descLower.includes('deposit')) {
            credit = parsedAmounts[0];
            balance = parsedAmounts[1];
          } else {
            debit = parsedAmounts[0];
            balance = parsedAmounts[1];
          }
        } else if (parsedAmounts.length === 1) {
          debit = parsedAmounts[0];
        }

        const description = line
          .replace(dateMatch[0], '')
          .replace(amountPattern, '')
          .replace(/\s+/g, ' ')
          .trim();

        if (!description || (debit === 0 && credit === 0)) continue;

        const type = debit > 0 ? 'debit' : 'credit';

        transactions.push({
          date,
          description,
          reference: '',
          debit: debit > 0 ? debit.toFixed(2) : '0',
          credit: credit > 0 ? credit.toFixed(2) : '0',
          balance: balance > 0 ? balance.toFixed(2) : undefined,
          type,
          category: this.categorizeTransaction(description, type),
          payee: this.extractPayee(description),
        });
      }

      logger.info(`Parsed ${transactions.length} transactions from PDF file`);

      if (transactions.length === 0) {
        throw new Error('Could not extract transactions from PDF. Try CSV or Excel format for better results.');
      }

      return transactions;
    } catch (error) {
      logger.error('Parse PDF error:', error);
      if (error.message.includes('Could not extract')) throw error;
      throw new Error(`Failed to parse PDF file: ${error.message}`);
    }
  }

  // ===== UTILITY METHODS =====

  parseDate(dateStr) {
    if (!dateStr) return null;

    if (dateStr instanceof Date && !isNaN(dateStr.getTime())) {
      return dateStr;
    }

    dateStr = String(dateStr).trim();

    const formats = [
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
      /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
      /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
      /^(\d{1,2}) (\w{3}) (\d{4})$/,
    ];

    for (const format of formats) {
      const match = dateStr.match(format);
      if (match) {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  }

  categorizeTransaction(description, type) {
    const desc = description.toLowerCase();

    if (type === 'credit') {
      if (desc.includes('salary') || desc.includes('payment')) return 'deposit';
      if (desc.includes('interest')) return 'interest';
      if (desc.includes('refund')) return 'refund';
      if (desc.includes('transfer')) return 'transfer';
      return 'other';
    }

    if (type === 'debit') {
      if (desc.includes('transfer')) return 'transfer';
      if (desc.includes('fee') || desc.includes('charge')) return 'fee';
      if (desc.includes('withdrawal') || desc.includes('cash')) return 'withdrawal';
      if (desc.includes('payment')) return 'payment';
      return 'other';
    }

    return 'other';
  }

  extractPayee(description) {
    return description.split(/[,-]/)[0].trim();
  }

  // ===== QUERY METHODS =====

  async getBankStatements(filters = {}, pagination = {}) {
    const { status, accountNumber, dateFrom, dateTo } = filters;
    const { page = 1, limit = 20, sortBy = 'endDate', sortOrder = 'desc' } = pagination;

    const query = {};

    if (status) query.status = status;
    if (accountNumber) query.accountNumber = accountNumber;

    if (dateFrom || dateTo) {
      query.endDate = {};
      if (dateFrom) query.endDate.$gte = new Date(dateFrom);
      if (dateTo) query.endDate.$lte = new Date(dateTo);
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [statements, total] = await Promise.all([
      BankStatement.find(query)
        .populate('uploadedBy', 'name email')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      BankStatement.countDocuments(query),
    ]);

    return {
      statements,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getBankStatementById(statementId) {
    const statement = await BankStatement.findById(statementId)
      .populate('uploadedBy', 'name email')
      .populate('transactions.matchedExpenseId')
      .populate('transactions.matchedInvoiceId');

    if (!statement) {
      throw new Error('Bank statement not found');
    }

    return statement;
  }

  /**
   * Manual match trigger (re-runs matching on already-processed statement)
   */
  async matchTransactions(statementId) {
    const statement = await BankStatement.findById(statementId);
    if (!statement) throw new Error('Bank statement not found');

    let matchCount = 0;

    for (const transaction of statement.transactions) {
      if (transaction.type === 'debit' && !transaction.matched) {
        const expense = await Expense.findOne({
          date: {
            $gte: new Date(new Date(transaction.date).setDate(new Date(transaction.date).getDate() - 3)),
            $lte: new Date(new Date(transaction.date).setDate(new Date(transaction.date).getDate() + 3)),
          },
          totalAmount: transaction.debit,
          status: { $in: ['approved', 'recorded', 'pending'] },
        });

        if (expense) {
          transaction.matched = true;
          transaction.matchedExpenseId = expense._id;
          matchCount++;
        }
      }

      if (transaction.type === 'credit' && !transaction.matched) {
        const invoice = await Invoice.findOne({
          status: { $in: ['sent', 'partial', 'overdue'] },
          $expr: {
            $lte: [
              { $abs: { $subtract: [{ $toDouble: '$totalAmount' }, { $toDouble: transaction.credit }] } },
              0.01,
            ],
          },
        });

        if (invoice) {
          transaction.matched = true;
          transaction.matchedInvoiceId = invoice._id;
          matchCount++;
        }
      }
    }

    await statement.save();

    logger.info(`Matched ${matchCount} transactions for statement: ${statement.statementNumber}`);
    return { matched: matchCount, total: statement.transactions.length };
  }

  /**
   * Create expenses from selected unmatched transactions
   */
  async createExpensesFromTransactions(statementId, userId, transactionIds = []) {
    const statement = await BankStatement.findById(statementId);
    if (!statement) throw new Error('Bank statement not found');

    const createdExpenses = [];

    for (const txnId of transactionIds) {
      const transaction = statement.transactions.id(txnId);

      if (!transaction || transaction.matched) {
        continue;
      }

      const expense = new Expense({
        date: transaction.date,
        vendor: transaction.payee || transaction.description,
        description: transaction.description,
        category: this._mapCategoryToExpenseCategory(transaction.category, transaction.description),
        amount: transaction.debit,
        taxAmount: '0',
        totalAmount: transaction.debit,
        paymentMethod: 'bank_transfer',
        status: 'pending',
        submittedBy: userId,
        notes: `From bank statement: ${statement.statementNumber}`,
      });

      await expense.save();

      transaction.matched = true;
      transaction.matchedExpenseId = expense._id;
      transaction.autoCreated = true;

      createdExpenses.push(expense);
    }

    await statement.save();

    logger.info(`Created ${createdExpenses.length} expenses from statement: ${statement.statementNumber}`);
    return createdExpenses;
  }
}

export default new BankStatementService();
