import Decimal from 'decimal.js';
import JournalEntry from '../models/JournalEntry.js';
import LedgerEntry from '../models/LedgerEntry.js';
import AccountBalance from '../models/AccountBalance.js';
import ChartOfAccounts from '../models/ChartOfAccounts.js';
import AuditLog from '../models/AuditLog.js';
import logger from '../config/logger.js';
import mongoose from 'mongoose';
import cacheService from './cache.service.js';
import { withTransaction, areTransactionsAvailable } from '../config/database.js';

const JOURNAL_STATUS = {
  DRAFT: 'DRAFT',
  VALIDATED: 'VALIDATED',
  POSTED: 'POSTED',
  VOIDED: 'VOIDED',
};

const POSTED_STATUSES = ['POSTED', 'posted'];
const VOIDED_STATUSES = ['VOIDED', 'voided'];
const VALIDATED_STATUSES = ['VALIDATED', 'validated'];
const DRAFT_STATUSES = ['DRAFT', 'draft'];
const GST_RATE = new Decimal('0.18');
const ROUNDING_TOLERANCE = new Decimal('0.01');

class LedgerService {
  normalizeStatusFilter(status) {
    if (!status) return null;

    const normalized = String(status).toUpperCase();
    if (normalized === JOURNAL_STATUS.POSTED) return { $in: POSTED_STATUSES };
    if (normalized === JOURNAL_STATUS.DRAFT) return { $in: DRAFT_STATUSES };
    if (normalized === JOURNAL_STATUS.VALIDATED) return { $in: VALIDATED_STATUSES };
    if (normalized === JOURNAL_STATUS.VOIDED) return { $in: VOIDED_STATUSES };

    return status;
  }

  validateJournal(journalLines) {
    const totalDebit = journalLines.reduce(
      (sum, line) => sum.plus(new Decimal(line.debit || 0)),
      new Decimal(0)
    );
    const totalCredit = journalLines.reduce(
      (sum, line) => sum.plus(new Decimal(line.credit || 0)),
      new Decimal(0)
    );

    if (!totalDebit.equals(totalCredit)) {
      throw new Error('Journal not balanced');
    }

    return {
      balanced: true,
      totalDebit: totalDebit.toString(),
      totalCredit: totalCredit.toString(),
    };
  }

  /**
   * Validate double-entry: debits must equal credits
   */
  validateDoubleEntry(lines) {
    this.validateJournal(lines);
    return true;
  }

  /**
   * Validate that each line has only debit OR credit (not both)
   */
  validateLineIntegrity(lines) {
    lines.forEach((line, index) => {
      const debit = new Decimal(line.debit || 0);
      const credit = new Decimal(line.credit || 0);

      if (!debit.isZero() && !credit.isZero()) {
        throw new Error(`Line ${index + 1}: Cannot have both debit and credit`);
      }

      if (debit.isZero() && credit.isZero()) {
        throw new Error(`Line ${index + 1}: Must have either debit or credit`);
      }

      if (debit.isNegative() || credit.isNegative()) {
        throw new Error(`Line ${index + 1}: Amounts cannot be negative`);
      }
    });

    return true;
  }

  /**
   * Validate that all accounts exist and are active
   */
  async validateAccounts(lines) {
    const accountIds = lines.map(line => line.account);
    const accounts = await ChartOfAccounts.find({
      _id: { $in: accountIds },
      isActive: true,
    });

    if (accounts.length !== accountIds.length) {
      throw new Error('One or more accounts are invalid or inactive');
    }

    return accounts;
  }

  validateGST(total, cgst, sgst) {
    const totalDecimal = new Decimal(total || 0);
    const cgstDecimal = new Decimal(cgst || 0);
    const sgstDecimal = new Decimal(sgst || 0);

    const expectedTax = totalDecimal.times(GST_RATE);
    const actualTax = cgstDecimal.plus(sgstDecimal);

    if (actualTax.minus(expectedTax).abs().greaterThan(ROUNDING_TOLERANCE)) {
      throw new Error('Invalid GST split');
    }

    if (cgstDecimal.minus(sgstDecimal).abs().greaterThan(ROUNDING_TOLERANCE)) {
      throw new Error('Invalid GST split');
    }

    return true;
  }

  validateTDS(tds, expense) {
    const tdsDecimal = new Decimal(tds || 0);
    const expenseDecimal = new Decimal(expense || 0);

    if (tdsDecimal.greaterThan(expenseDecimal)) {
      throw new Error('Invalid TDS');
    }

    return true;
  }

  validateComplianceRules(entry, accountsById) {
    let outputCGST = new Decimal(0);
    let outputSGST = new Decimal(0);
    let inputCGST = new Decimal(0);
    let inputSGST = new Decimal(0);
    let taxableRevenue = new Decimal(0);
    let taxableExpense = new Decimal(0);
    let tdsPayable = new Decimal(0);
    let tdsExpense = new Decimal(0);
    let hasGST = false;
    let hasTDS = false;

    entry.lines.forEach((line) => {
      const account = accountsById.get(String(line.account));
      const accountName = (account?.name || '').toLowerCase();
      const accountType = (account?.type || '').toLowerCase();
      const debit = new Decimal(line.debit || 0);
      const credit = new Decimal(line.credit || 0);

      if (accountName.includes('output cgst')) {
        hasGST = true;
        outputCGST = outputCGST.plus(credit);
      }

      if (accountName.includes('output sgst')) {
        hasGST = true;
        outputSGST = outputSGST.plus(credit);
      }

      if (accountName.includes('input cgst')) {
        hasGST = true;
        inputCGST = inputCGST.plus(debit);
      }

      if (accountName.includes('input sgst')) {
        hasGST = true;
        inputSGST = inputSGST.plus(debit);
      }

      if (accountType === 'income') {
        taxableRevenue = taxableRevenue.plus(credit);
      }

      if (accountType === 'expense') {
        taxableExpense = taxableExpense.plus(debit);
      }

      if (accountName.includes('tds payable')) {
        hasTDS = true;
        tdsPayable = tdsPayable.plus(credit);
      }

      if (accountType === 'expense') {
        tdsExpense = tdsExpense.plus(debit);
      }
    });

    if (hasGST && (!outputCGST.isZero() || !outputSGST.isZero())) {
      this.validateGST(taxableRevenue, outputCGST, outputSGST);
    }

    if (hasGST && (!inputCGST.isZero() || !inputSGST.isZero())) {
      this.validateGST(taxableExpense, inputCGST, inputSGST);
    }

    if (hasTDS) {
      this.validateTDS(tdsPayable, tdsExpense);
    }

    return {
      gst_valid: true,
      tds_valid: true,
      hasGST,
      hasTDS,
    };
  }

  async ensureComplianceAccounts(session = null) {
    const requiredAccounts = [
      {
        code: '2301',
        name: 'Input CGST',
        type: 'Asset',
        subtype: 'Current Asset',
        normalBalance: 'debit',
      },
      {
        code: '2302',
        name: 'Input SGST',
        type: 'Asset',
        subtype: 'Current Asset',
        normalBalance: 'debit',
      },
      {
        code: '2311',
        name: 'Output CGST',
        type: 'Liability',
        subtype: 'Current Liability',
        normalBalance: 'credit',
      },
      {
        code: '2312',
        name: 'Output SGST',
        type: 'Liability',
        subtype: 'Current Liability',
        normalBalance: 'credit',
      },
      {
        code: '2400',
        name: 'TDS Payable',
        type: 'Liability',
        subtype: 'Current Liability',
        normalBalance: 'credit',
      },
    ];

    for (const accountData of requiredAccounts) {
      const existingQuery = ChartOfAccounts.findOne({ code: accountData.code });
      const existingAccount = session ? await existingQuery.session(session) : await existingQuery;

      if (!existingAccount) {
        const account = new ChartOfAccounts(accountData);
        await account.save(session ? { session } : {});
      }
    }
  }

  async validateJournalEntry(entryId, userId) {
    return await withTransaction(async (session) => {
      await this.ensureComplianceAccounts(session);

      const entry = await JournalEntry.findById(entryId).session(session);

      if (!entry) {
        throw new Error('Entry not found');
      }

      if (POSTED_STATUSES.includes(entry.status)) {
        throw new Error('Journal entry is already posted');
      }

      if (VOIDED_STATUSES.includes(entry.status)) {
        throw new Error('Cannot validate a voided entry');
      }

      if (!entry.description || !entry.lines || entry.lines.length < 2) {
        entry.status = JOURNAL_STATUS.DRAFT;
        await entry.save({ session });
        throw new Error('incomplete_data');
      }

      this.validateLineIntegrity(entry.lines);
      const journalValidation = this.validateJournal(entry.lines);
      const accounts = await this.validateAccounts(entry.lines);
      const accountsById = new Map(accounts.map((account) => [String(account._id), account]));
      const complianceValidation = this.validateComplianceRules(entry, accountsById);

      if (!entry.trace_id || !entry.source) {
        throw new Error('Audit trace metadata is required');
      }

      if (!entry.auditTrace || !Array.isArray(entry.auditTrace.steps)) {
        throw new Error('Audit trace steps are required');
      }

      entry.status = JOURNAL_STATUS.VALIDATED;
      entry.auditTrace.trace_id = entry.trace_id;
      entry.auditTrace.source = entry.source;
      entry.auditTrace.timestamp = new Date();
      if (!entry.auditTrace.steps.includes('validated')) {
        entry.auditTrace.steps.push('validated');
      }

      if (!entry.auditTrail) entry.auditTrail = [];
      entry.auditTrail.push({
        action: 'VALIDATED',
        performedBy: userId,
        timestamp: new Date(),
        details: {
          ...journalValidation,
          ...complianceValidation,
        },
      });

      await entry.save({ session });
      return entry;
    });
  }

  /**
   * Get the previous hash for chain continuity
   */
  async getPreviousHash() {
    const lastEntry = await JournalEntry.findOne({ status: { $in: POSTED_STATUSES } })
      .sort({ createdAt: -1 })
      .select('immutable_hash');

    return lastEntry ? lastEntry.immutable_hash : '0';
  }

  /**
   * Create a new journal entry with hash-chain enforcement
   */
  async createJournalEntry(entryData, userId) {
    return await withTransaction(async (session) => {
      await this.ensureComplianceAccounts(session);

      const {
        date,
        description,
        lines,
        reference,
        tags,
        source,
        trace_id,
        auditTrace,
      } = entryData;

      if (!lines || !Array.isArray(lines) || lines.length < 2) {
        throw new Error('Journal entry must contain at least 2 lines');
      }

      // Get the latest entry to find prevHash and chainPosition
      const lastEntry = await JournalEntry.findOne({ status: { $in: POSTED_STATUSES } })
        .sort({ chainPosition: -1 })
        .session(session);

      const prevHash = lastEntry?.hash || lastEntry?.immutable_hash || '0';
      const chainPosition = (lastEntry?.chainPosition ?? -1) + 1;

      // Compute hash for new entry
      const tempEntry = {
        entryNumber: 'TEMP',
        date: date || new Date(),
        description,
        lines,
        reference,
        status: JOURNAL_STATUS.DRAFT,
      };
      const hash = JournalEntry.computeHash(tempEntry, prevHash);

      // Create journal entry with hash-chain
      const journalEntry = new JournalEntry({
        date: date || new Date(),
        description,
        lines,
        reference,
        tags,
        status: JOURNAL_STATUS.DRAFT,
        source: source || 'MANUAL',
        trace_id,
        created_at: new Date(),
        auditTrace: {
          trace_id: trace_id || undefined,
          source: source || 'MANUAL',
          steps: Array.isArray(auditTrace?.steps)
            ? auditTrace.steps
            : ['entry created', 'draft saved'],
          timestamp: new Date(),
        },
        prevHash,
        hash,
        chainPosition,
        prev_hash: prevHash, // Legacy field
        immutable_hash: hash, // Legacy field
      });

      await journalEntry.save(session ? { session } : {});
      
      logger.info(`Journal entry created: ${journalEntry.entryNumber}`, {
        hash: journalEntry.hash,
        chainPosition: journalEntry.chainPosition,
        status: journalEntry.status,
        transactionMode: session ? 'with-transaction' : 'without-transaction',
      });

      return journalEntry;
    });
  }

  /**
   * Post a journal entry (move to posted state with chain finalization)
   */
  async postJournalEntry(entryId, userId) {
    return await withTransaction(async (session) => {
      const entry = await JournalEntry.findById(entryId).session(session);

      if (!entry) {
        throw new Error('Entry not found');
      }

      if (POSTED_STATUSES.includes(entry.status)) {
        throw new Error('Journal entry is already posted');
      }

      if (VOIDED_STATUSES.includes(entry.status)) {
        throw new Error('Cannot post a voided entry');
      }

      if (!VALIDATED_STATUSES.includes(entry.status)) {
        throw new Error('Cannot post unvalidated entry');
      }

      // Verify hash before posting (tamper detection)
      if (entry.verifyHash && !entry.verifyHash()) {
        throw new Error('Entry hash verification failed - possible tampering');
      }

      const ledgerEntries = await this.writeLedgerEntries(entry, session);

      // Update entry status
      entry.status = JOURNAL_STATUS.POSTED;
      entry.postedBy = userId;
      entry.postedAt = new Date();

      // Add audit trail
      if (!entry.auditTrail) entry.auditTrail = [];
      entry.auditTrail.push({
        action: 'POSTED',
        performedBy: userId,
        timestamp: new Date(),
        details: { 
          prevHash: entry.prevHash || entry.prev_hash, 
          hash: entry.hash || entry.immutable_hash,
          ledgerEntriesCreated: ledgerEntries.length,
        },
      });
      
      // Hash will be recalculated in pre-save hook
      await entry.save({ session });

      // Update account balances
      await this.updateAccountBalances(entry.lines, session);
      
      // Invalidate related caches
      await cacheService.invalidateLedgerCaches();
      
      logger.info(`Journal entry posted: ${entry.entryNumber}`, {
        hash: entry.hash,
        chainPosition: entry.chainPosition,
        postedBy: userId,
        ledgerEntries: ledgerEntries.length,
        transactionMode: session ? 'with-transaction' : 'without-transaction',
      });

      return entry;
    });
  }

  /**
   * Update account balances based on journal entry lines
   */
  async updateAccountBalances(lines, session = null) {
    for (const line of lines) {
      const debit = new Decimal(line.debit || 0);
      const credit = new Decimal(line.credit || 0);

      // Find or create account balance with optional session
      const query = AccountBalance.findOne({ account: line.account });
      let accountBalance = session ? await query.session(session) : await query;

      if (!accountBalance) {
        accountBalance = new AccountBalance({
          account: line.account,
          balance: '0',
          debitTotal: '0',
          creditTotal: '0',
        });
      }

      // Update totals
      const currentDebitTotal = new Decimal(accountBalance.debitTotal);
      const currentCreditTotal = new Decimal(accountBalance.creditTotal);

      accountBalance.debitTotal = currentDebitTotal.plus(debit).toString();
      accountBalance.creditTotal = currentCreditTotal.plus(credit).toString();

      // Calculate net balance (debit - credit)
      const netBalance = new Decimal(accountBalance.debitTotal).minus(
        new Decimal(accountBalance.creditTotal)
      );
      accountBalance.balance = netBalance.toString();
      accountBalance.lastUpdated = new Date();

      // Save with optional session
      await accountBalance.save(session ? { session } : {});
    }
  }

  async writeLedgerEntries(entry, session = null) {
    const query = LedgerEntry.findOne({}).sort({ timestamp: -1, _id: -1 }).select('hash');
    const lastLedgerEntry = session ? await query.session(session) : await query;

    let prevHash = lastLedgerEntry ? lastLedgerEntry.hash : '0';
    const ledgerDocs = [];

    for (const line of entry.lines) {
      const accountId = String(line.account);
      const debit = new Decimal(line.debit || 0);
      const credit = new Decimal(line.credit || 0);

      if (debit.greaterThan(0)) {
        const amount = debit.toString();
        const hash = LedgerEntry.computeHash({
          journalId: String(entry._id),
          accountId,
          amount,
          prevHash,
        });

        ledgerDocs.push({
          journal_id: String(entry._id),
          account_id: accountId,
          type: 'DEBIT',
          amount,
          prev_hash: prevHash,
          hash,
          timestamp: new Date(),
        });

        prevHash = hash;
      }

      if (credit.greaterThan(0)) {
        const amount = credit.toString();
        const hash = LedgerEntry.computeHash({
          journalId: String(entry._id),
          accountId,
          amount,
          prevHash,
        });

        ledgerDocs.push({
          journal_id: String(entry._id),
          account_id: accountId,
          type: 'CREDIT',
          amount,
          prev_hash: prevHash,
          hash,
          timestamp: new Date(),
        });

        prevHash = hash;
      }
    }

    if (!ledgerDocs.length) {
      throw new Error('No ledger lines generated from journal entry');
    }

    await LedgerEntry.insertMany(ledgerDocs, session ? { session } : {});
    return ledgerDocs;
  }

  /**
   * Get journal entries with pagination and filters
   */
  async getJournalEntries(filters = {}, pagination = {}) {
    const {
      status,
      dateFrom,
      dateTo,
      account,
      search,
    } = filters;

    const {
      page = 1,
      limit = 20,
      sortBy = 'date',
      sortOrder = 'desc',
    } = pagination;

    const query = {};

    if (status) {
      query.status = this.normalizeStatusFilter(status);
    }

    if (dateFrom || dateTo) {
      query.date = {};
      if (dateFrom) query.date.$gte = new Date(dateFrom);
      if (dateTo) query.date.$lte = new Date(dateTo);
    }

    if (account) {
      query['lines.account'] = account;
    }

    if (search) {
      query.$or = [
        { entryNumber: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { reference: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [entries, total] = await Promise.all([
      JournalEntry.find(query)
        .populate('lines.account', 'code name type')
        .populate('postedBy', 'name email')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      JournalEntry.countDocuments(query),
    ]);

    return {
      entries,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single journal entry by ID
   */
  async getJournalEntryById(entryId) {
    const entry = await JournalEntry.findById(entryId)
      .populate('lines.account', 'code name type normalBalance')
      .populate('postedBy', 'name email');

    if (!entry) {
      throw new Error('Journal entry not found');
    }

    return entry;
  }

  /**
   * Verify entire ledger chain (Enhanced with detailed reporting)
   */
  async verifyLedgerChain() {
    try {
      const entries = await LedgerEntry.find({})
        .sort({ timestamp: 1, _id: 1 })
        .exec();

      if (entries.length === 0) {
        return {
          isValid: true,
          totalEntries: 0,
          errors: [],
          message: 'No entries to verify',
        };
      }

      const errors = [];
      let expectedPrevHash = '0'; // Genesis hash

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const entryPrevHash = entry.prev_hash;
        const entryHash = entry.hash;
        const computedHash = LedgerEntry.computeHash({
          journalId: entry.journal_id,
          accountId: entry.account_id,
          amount: entry.amount,
          prevHash: entryPrevHash,
        });

        // Check prevHash linkage
        if (entryPrevHash !== expectedPrevHash) {
          errors.push({
            position: i,
            journalId: entry.journal_id,
            issue: 'Chain linkage broken',
            expectedPrevHash,
            actualPrevHash: entryPrevHash,
          });
        }

        // Verify entry hash
        if (computedHash !== entryHash) {
          errors.push({
            position: i,
            journalId: entry.journal_id,
            issue: 'Hash mismatch (possible tampering)',
            expectedHash: computedHash,
            actualHash: entryHash,
          });
        }

        // Update expected prevHash for next iteration
        expectedPrevHash = entryHash;
      }

      const isValid = errors.length === 0;

      logger.info(`Ledger chain verification: ${isValid ? 'VALID' : 'INVALID'}`, {
        totalEntries: entries.length,
        errorCount: errors.length,
      });

      return {
        isValid,
        totalEntries: entries.length,
        errors,
        lastHash: entries[entries.length - 1]?.hash,
        chainLength: entries.length,
        message: isValid
          ? 'Ledger chain is valid and tamper-proof'
          : `Ledger integrity issues detected at ${errors.length} point(s)`,
      };
    } catch (error) {
      logger.error('Verify ledger chain error:', error);
      throw error;
    }
  }

  /**
   * Verify chain from specific entry (Enhanced)
   */
  async verifyChainFromEntry(entryId) {
    const entries = await LedgerEntry.find({ journal_id: String(entryId) })
      .sort({ timestamp: 1, _id: 1 })
      .exec();

    if (!entries.length) {
      throw new Error('Ledger entries not found for journal entry');
    }

    const errors = [];
    let expectedPrevHash = entries[0].prev_hash;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const computedHash = LedgerEntry.computeHash({
        journalId: entry.journal_id,
        accountId: entry.account_id,
        amount: entry.amount,
        prevHash: entry.prev_hash,
      });

      if (entry.prev_hash !== expectedPrevHash) {
        errors.push({
          position: i,
          issue: 'Chain linkage broken',
          expectedPrevHash,
          actualPrevHash: entry.prev_hash,
        });
      }

      if (computedHash !== entry.hash) {
        errors.push({
          position: i,
          issue: 'Hash mismatch (possible tampering)',
          expectedHash: computedHash,
          actualHash: entry.hash,
        });
      }

      expectedPrevHash = entry.hash;
    }

    return {
      isValid: errors.length === 0,
      totalEntriesVerified: entries.length,
      errors,
    };
  }

  /**
   * Get chain statistics
   */
  async getChainStatistics() {
    const stats = await LedgerEntry.aggregate([
      {
        $match: {}
      },
      {
        $group: {
          _id: null,
          totalEntries: { $sum: 1 },
          oldestEntry: { $min: '$timestamp' },
          newestEntry: { $max: '$timestamp' },
        }
      }
    ]);

    const result = stats[0] || {
      totalEntries: 0,
    };

    return {
      totalPostedEntries: result.totalEntries,
      chainLength: result.totalEntries,
      oldestEntry: result.oldestEntry,
      newestEntry: result.newestEntry,
      hasGaps: false,
    };
  }

  /**
   * Get account balances with optional filters
   */
  async getAccountBalances(filters = {}) {
    const { accountType, minBalance, maxBalance, search } = filters;

    const pipeline = [
      {
        $lookup: {
          from: 'chartofaccounts',
          localField: 'account',
          foreignField: '_id',
          as: 'accountDetails',
        },
      },
      {
        $unwind: '$accountDetails',
      },
    ];

    // Add filters
    const matchStage = { 'accountDetails.isActive': true };

    if (accountType) {
      matchStage['accountDetails.type'] = accountType;
    }

    if (search) {
      matchStage.$or = [
        { 'accountDetails.name': { $regex: search, $options: 'i' } },
        { 'accountDetails.code': { $regex: search, $options: 'i' } },
      ];
    }

    pipeline.push({ $match: matchStage });

    // Filter by balance range (convert to number for comparison)
    if (minBalance !== undefined || maxBalance !== undefined) {
      pipeline.push({
        $addFields: {
          balanceNum: { $toDouble: '$balance' },
        },
      });

      const balanceFilter = {};
      if (minBalance !== undefined) balanceFilter.$gte = parseFloat(minBalance);
      if (maxBalance !== undefined) balanceFilter.$lte = parseFloat(maxBalance);

      pipeline.push({
        $match: { balanceNum: balanceFilter },
      });
    }

    // Project final shape
    pipeline.push({
      $project: {
        account: '$accountDetails._id',
        accountCode: '$accountDetails.code',
        accountName: '$accountDetails.name',
        accountType: '$accountDetails.type',
        normalBalance: '$accountDetails.normalBalance',
        balance: 1,
        debitTotal: 1,
        creditTotal: 1,
        lastUpdated: 1,
      },
    });

    // Sort by account code
    pipeline.push({ $sort: { accountCode: 1 } });

    const balances = await AccountBalance.aggregate(pipeline);

    return balances;
  }

  /**
   * Get ledger summary (total assets, liabilities, equity, income, expenses)
   */
  async getLedgerSummary() {
    // Try to get from cache first
    const cached = await cacheService.getCachedLedgerSummary();
    if (cached) {
      return cached;
    }

    const balances = await this.getAccountBalances();

    const summary = {
      assets: new Decimal(0),
      liabilities: new Decimal(0),
      equity: new Decimal(0),
      income: new Decimal(0),
      expenses: new Decimal(0),
    };

    balances.forEach((balance) => {
      const amount = new Decimal(balance.balance);
      const type = balance.accountType.toLowerCase();

      switch (type) {
        case 'asset':
          summary.assets = summary.assets.plus(amount);
          break;
        case 'liability':
          summary.liabilities = summary.liabilities.plus(amount);
          break;
        case 'equity':
          summary.equity = summary.equity.plus(amount);
          break;
        case 'income':
          summary.income = summary.income.plus(amount);
          break;
        case 'expense':
          summary.expenses = summary.expenses.plus(amount);
          break;
      }
    });

    // Calculate net income
    const netIncome = summary.income.minus(summary.expenses);

    // Accounting equation check: Assets = Liabilities + Equity + Net Income
    const leftSide = summary.assets;
    const rightSide = summary.liabilities.plus(summary.equity).plus(netIncome);
    const isBalanced = leftSide.equals(rightSide);

    const result = {
      assets: summary.assets.toString(),
      liabilities: summary.liabilities.toString(),
      equity: summary.equity.toString(),
      income: summary.income.toString(),
      expenses: summary.expenses.toString(),
      netIncome: netIncome.toString(),
      isBalanced,
      balanceDifference: leftSide.minus(rightSide).toString(),
    };

    // Cache the result
    await cacheService.cacheLedgerSummary(result);
    
    return result;
  }

  /**
   * Void a journal entry (mark as voided in chain)
   */
  async voidJournalEntry(entryId, userId, reason) {
    return await withTransaction(async (session) => {
      const entry = await JournalEntry.findById(entryId).session(session);

      if (!entry) {
        throw new Error('Entry not found');
      }

      if (VOIDED_STATUSES.includes(entry.status)) {
        throw new Error('Entry is already voided');
      }

      if (!POSTED_STATUSES.includes(entry.status)) {
        throw new Error('Only posted entries can be voided');
      }

      // Create void audit trail but keep chain intact
      entry.status = JOURNAL_STATUS.VOIDED;
      entry.voidedBy = userId;
      entry.voidReason = reason;

      // Add audit trail
      if (!entry.auditTrail) entry.auditTrail = [];
      entry.auditTrail.push({
        action: 'VOIDED',
        performedBy: userId,
        timestamp: new Date(),
        details: { reason, originalHash: entry.hash || entry.immutable_hash },
      });

      await entry.save({ session });

      // Create reversing entry
      const reversingLines = entry.lines.map((line) => ({
        account: line.account,
        debit: line.credit, // Swap debit and credit
        credit: line.debit,
        description: `VOID: ${line.description || ''}`,
      }));

      const reversingEntry = new JournalEntry({
        date: new Date(),
        description: `VOID: ${entry.description} (Reason: ${reason})`,
        lines: reversingLines,
        reference: `VOID-${entry.entryNumber}`,
        status: JOURNAL_STATUS.VALIDATED,
        source: 'SYSTEM',
        trace_id: entry.trace_id,
        postedBy: userId,
        postedAt: new Date(),
        prev_hash: await this.getPreviousHash(),
        immutable_hash: '', // Will be calculated in pre-save hook
      });

      await reversingEntry.save({ session });

      const ledgerLines = await this.writeLedgerEntries(reversingEntry, session);

      reversingEntry.status = JOURNAL_STATUS.POSTED;
      await reversingEntry.save({ session });

      // Update account balances with reversing entry
      await this.updateAccountBalances(reversingLines, session);

      logger.info(`Journal entry voided: ${entry.entryNumber}`, {
        reason,
        hash: entry.hash,
        reversingLedgerLines: ledgerLines.length,
        voidedBy: userId,
        transactionMode: session ? 'with-transaction' : 'without-transaction',
      });

      return { voidedEntry: entry, reversingEntry };
    });
  }

  /**
   * Reverse account balances (for voiding)
   */
  async reverseAccountBalances(entry) {
    return await withTransaction(async (session) => {
      const reversingLines = entry.lines.map(line => ({
        account: line.account,
        debit: line.credit,
        credit: line.debit,
      }));

      await this.updateAccountBalances(reversingLines, session);
    });
  }

  /**
   * Get entry chain segment (for audit)
   */
  async getChainSegment(startPosition, endPosition) {
    try {
      const size = Math.max(endPosition - startPosition + 1, 0);
      const entries = await LedgerEntry.find({})
        .sort({ timestamp: 1, _id: 1 })
        .skip(startPosition)
        .limit(size)
        .select('journal_id account_id type amount hash prev_hash timestamp')
        .exec();

      return entries;
    } catch (error) {
      logger.error('Get chain segment error:', error);
      throw error;
    }
  }
}

export default new LedgerService();