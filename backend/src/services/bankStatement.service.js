import { parse } from 'csv-parse/sync';
import BankStatement from '../models/BankStatement.js';
import Expense from '../models/Expense.js';
import logger from '../config/logger.js';
import fs from 'fs/promises';

class BankStatementService {
  /**
   * Upload and parse bank statement
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

      // Process statement asynchronously
      this.processStatementFile(statement._id).catch(err => {
        logger.error('Background statement processing error:', err);
      });

      return statement;
    } catch (error) {
      logger.error('Upload bank statement error:', error);
      throw error;
    }
  }

  /**
   * Process statement file (CSV, Excel, PDF)
   */
  async processStatementFile(statementId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const statement = await BankStatement.findById(statementId).session(session);

      if (!statement) {
        throw new Error('Bank statement not found');
      }

      // Update status to processing
      statement.status = 'processing';
      await statement.save({ session });

      // Parse file based on type
      let transactions = [];
      const fileExtension = statement.file.mimetype.split('/').pop().toLowerCase();

      if (fileExtension === 'csv' || statement.file.path.endsWith('.csv')) {
        transactions = await this.parseCSV(statement.file.path);
      } else if (
        fileExtension.includes('excel') ||
        statement.file.path.endsWith('.xlsx') ||
        statement.file.path.endsWith('.xls')
      ) {
        transactions = await this.parseExcel(statement.file.path);
      } else if (fileExtension === 'pdf' || statement.file.path.endsWith('.pdf')) {
        transactions = await this.parsePDF(statement.file.path);
      } else {
        throw new Error('Unsupported file format. Please upload CSV, Excel, or PDF.');
      }

      // Calculate totals
      const totalDebits = transactions
        .filter(t => t.type === 'debit')
        .reduce((sum, t) => sum + parseFloat(t.debit), 0);

      const totalCredits = transactions
        .filter(t => t.type === 'credit')
        .reduce((sum, t) => sum + parseFloat(t.credit), 0);

      // Update statement
      statement.transactions = transactions;
      statement.totalDebits = totalDebits.toFixed(2);
      statement.totalCredits = totalCredits.toFixed(2);
      statement.transactionCount = transactions.length;
      statement.status = 'completed';
      statement.processedAt = new Date();

      await statement.save({ session });
      await session.commitTransaction();

      logger.info(`Bank statement processed: ${statement.statementNumber} (${transactions.length} transactions)`);

      return statement;
    } catch (error) {
      await session.abortTransaction();

      const statement = await BankStatement.findById(statementId);
      if (statement) {
        statement.status = 'failed';
        statement.processingError = error.message;
        await statement.save();
      }

      logger.error('Process statement error:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Parse CSV file
   */
  async parseCSV(filePath) {
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      const transactions = records.map(record => {
        // Normalize column names (handle different bank formats)
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

  /**
   * Parse Excel file
   */
  async parseExcel(filePath) {
    try {
      // This would require xlsx package for Excel parsing
      // For now, we'll throw an error suggesting CSV conversion
      throw new Error(
        'Excel parsing requires additional setup. Please convert to CSV or contact support.'
      );
    } catch (error) {
      logger.error('Parse Excel error:', error);
      throw error;
    }
  }

  /**
   * Parse PDF file
   */
  async parsePDF(filePath) {
    try {
      // PDF parsing is complex and would require pdf-parse package
      // For now, we'll throw an error suggesting CSV conversion
      throw new Error(
        'PDF parsing requires additional setup. Please convert to CSV or contact support.'
      );
    } catch (error) {
      logger.error('Parse PDF error:', error);
      throw error;
    }
  }

  /**
   * Parse date from various formats
   */
  parseDate(dateStr) {
    if (!dateStr) return null;

    // Try common date formats
    const formats = [
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // MM/DD/YYYY
      /^(\d{1,2})-(\d{1,2})-(\d{4})$/, // MM-DD-YYYY
      /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, // YYYY/MM/DD
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/, // YYYY-MM-DD
      /^(\d{1,2}) (\w{3}) (\d{4})$/, // DD Mon YYYY
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

    // Fallback to direct parsing
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  }

  /**
   * Categorize transaction based on description
   */
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

  /**
   * Extract payee from description
   */
  extractPayee(description) {
    // Simple extraction - can be enhanced with NLP
    return description.split(/[,-]/)[0].trim();
  }

  /**
   * Get bank statements with filters
   */
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

  /**
   * Get single bank statement
   */
  async getBankStatementById(statementId) {
    const statement = await BankStatement.findById(statementId)
      .populate('uploadedBy', 'name email')
      .populate('transactions.matchedExpenseId');

    if (!statement) {
      throw new Error('Bank statement not found');
    }

    return statement;
  }

  /**
   * Match transactions with expenses
   */
  async matchTransactions(statementId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const statement = await BankStatement.findById(statementId).session(session);

      if (!statement) {
        throw new Error('Bank statement not found');
      }

      let matchCount = 0;

      for (const transaction of statement.transactions) {
        if (transaction.type === 'debit' && !transaction.matched) {
          // Try to find matching expense
          const expense = await Expense.findOne({
            date: {
              $gte: new Date(new Date(transaction.date).setDate(new Date(transaction.date).getDate() - 3)),
              $lte: new Date(new Date(transaction.date).setDate(new Date(transaction.date).getDate() + 3)),
            },
            totalAmount: transaction.debit,
            status: { $in: ['approved', 'recorded'] },
          }).session(session);

          if (expense) {
            transaction.matched = true;
            transaction.matchedExpenseId = expense._id;
            matchCount++;
          }
        }
      }

      await statement.save({ session });
      await session.commitTransaction();

      logger.info(`Matched ${matchCount} transactions for statement: ${statement.statementNumber}`);

      return { matched: matchCount, total: statement.transactions.length };
    } catch (error) {
      await session.abortTransaction();
      logger.error('Match transactions error:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Create expenses from unmatched transactions
   */
  async createExpensesFromTransactions(statementId, userId, transactionIds = []) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const statement = await BankStatement.findById(statementId).session(session);

      if (!statement) {
        throw new Error('Bank statement not found');
      }

      const createdExpenses = [];

      for (const txnId of transactionIds) {
        const transaction = statement.transactions.id(txnId);

        if (!transaction || transaction.matched) {
          continue;
        }

        // Create expense
        const expense = new Expense({
          date: transaction.date,
          vendor: transaction.payee || transaction.description,
          description: transaction.description,
          category: 'other',
          amount: transaction.debit,
          taxAmount: '0',
          totalAmount: transaction.debit,
          paymentMethod: 'bank_transfer',
          status: 'pending',
          submittedBy: userId,
          notes: `From bank statement: ${statement.statementNumber}`,
        });

        await expense.save({ session });

        // Mark transaction as matched
        transaction.matched = true;
        transaction.matchedExpenseId = expense._id;

        createdExpenses.push(expense);
      }

      await statement.save({ session });
      await session.commitTransaction();

      logger.info(`Created ${createdExpenses.length} expenses from statement: ${statement.statementNumber}`);

      return createdExpenses;
    } catch (error) {
      await session.abortTransaction();
      logger.error('Create expenses from transactions error:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }
}

export default new BankStatementService();
