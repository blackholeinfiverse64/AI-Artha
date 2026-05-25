import signalEngineService from '../services/signalEngine.service.js';
import ComplianceSignal from '../models/ComplianceSignal.js';
import ComplianceFiling from '../models/ComplianceFiling.js';
import ComplianceValidationLog from '../models/ComplianceValidationLog.js';
import JournalEntry from '../models/JournalEntry.js';
import LedgerEntry from '../models/LedgerEntry.js';
import { runPipeline } from '../services/setu.pipeline.js';
import logger from '../config/logger.js';

// @desc    Get cash flow signal from ledger only
// @route   GET /api/v1/signals/cash-flow
// @access  Private
export const getCashFlowSignal = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const signal = await signalEngineService.calculateCashFlow(startDate, endDate);
    res.json({ success: true, data: signal });
  } catch (error) {
    logger.error('Get cash flow signal error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get signal snapshot from ledger only (backward-compatible)
// @route   GET /api/v1/signals/snapshot
// @access  Private
export const getSignalSnapshot = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const snapshot = await signalEngineService.getSignalSnapshot(startDate, endDate);
    res.json({ success: true, data: snapshot });
  } catch (error) {
    logger.error('Get signal snapshot error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Evaluate overdue invoices and emit signals
// @route   POST /api/v1/signals/evaluate/overdue-invoices
// @access  Private (admin, accountant)
export const evaluateOverdueInvoices = async (req, res) => {
  try {
    const signals = await signalEngineService.evaluateOverdueInvoices();
    res.json({ success: true, data: { count: signals.length, signals } });
  } catch (error) {
    logger.error('Evaluate overdue invoices error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    List persisted compliance signals
// @route   GET /api/v1/signals
// @access  Private
export const listSignals = async (req, res) => {
  try {
    const { severity, type, limit = 50, page = 1 } = req.query;
    const query = {};
    if (severity) query.severity = severity;
    if (type)     query.type = type;

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const [signals, total] = await Promise.all([
      ComplianceSignal.find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10)),
      ComplianceSignal.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: signals,
      pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10), total },
    });
  } catch (error) {
    logger.error('List signals error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Reconstruct full trace chain from a trace_id
// @route   GET /api/v1/signals/trace/:traceId
// @access  Private
export const reconstructTrace = async (req, res) => {
  try {
    const { traceId } = req.params;

    // Step 1: Find the signal
    const signal = await ComplianceSignal.findOne({ trace_id: traceId }).lean();

    // Step 2: Find compliance validation log
    const validationLog = await ComplianceValidationLog.findOne({ traceId }).lean();

    // Step 3: Find compliance filing
    const filing = await ComplianceFiling.findOne({ traceId }).lean();

    // Step 4: Resolve journal entries from filing source transactions
    let journalEntries = [];
    let ledgerEntries  = [];
    if (filing?.sourceTransactions?.length) {
      const jeIds = filing.sourceTransactions
        .filter(t => t.sourceType === 'JournalEntry')
        .map(t => t.sourceId);

      if (jeIds.length) {
        journalEntries = await JournalEntry.find({ _id: { $in: jeIds } })
          .select('entryNumber date description status hash chainPosition reference gstDetails lines trace_id')
          .lean();

        // Step 5: Resolve ledger entries for those journals
        ledgerEntries = await LedgerEntry.find({ journal_id: { $in: jeIds } })
          .select('journal_id account_id type amount hash prev_hash timestamp')
          .lean();
      }
    }

    const chain = {
      trace_id: traceId,
      steps: [
        {
          step: 1,
          label: 'Signal',
          found: !!signal,
          data: signal
            ? { signal_id: signal.signal_id, type: signal.type, severity: signal.severity, created_at: signal.created_at }
            : null,
        },
        {
          step: 2,
          label: 'Compliance Validation',
          found: !!validationLog,
          data: validationLog
            ? { filingId: validationLog.filingId, filingType: validationLog.filingType, filing_ready: validationLog.filing_ready, error_count: validationLog.errors?.length ?? 0 }
            : null,
        },
        {
          step: 3,
          label: 'Compliance Filing',
          found: !!filing,
          data: filing
            ? { filingId: filing.filingId, filingType: filing.filingType, sourceTransactionCount: filing.sourceTransactions?.length ?? 0 }
            : null,
        },
        {
          step: 4,
          label: 'Journal Entries',
          found: journalEntries.length > 0,
          data: journalEntries.map(je => ({
            entryNumber: je.entryNumber,
            date:        je.date,
            status:      je.status,
            hash:        je.hash,
            chainPosition: je.chainPosition,
            lineCount:   je.lines?.length ?? 0,
          })),
        },
        {
          step: 5,
          label: 'Ledger Entries',
          found: ledgerEntries.length > 0,
          data: ledgerEntries.map(le => ({
            journal_id:  le.journal_id,
            account_id:  le.account_id,
            type:        le.type,
            amount:      le.amount,
            hash:        le.hash,
            timestamp:   le.timestamp,
          })),
        },
      ],
      reconstructed_at: new Date().toISOString(),
    };

    res.json({ success: true, data: chain });
  } catch (error) {
    logger.error('Reconstruct trace error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Dry-run the SETU pipeline for a persisted signal (no dispatch)
// @route   GET /api/v1/signals/:signalId/pipeline-check
// @access  Private (admin, accountant)
export const pipelineCheck = async (req, res) => {
  try {
    const signal = await ComplianceSignal.findOne({ signal_id: req.params.signalId }).lean();
    if (!signal) {
      return res.status(404).json({ success: false, message: 'Signal not found' });
    }

    const result = runPipeline(signal);
    // Never include the serialized body in the response — it's for wire use only
    const { body: _body, ...safeResult } = result;

    res.json({ success: true, data: safeResult });
  } catch (error) {
    logger.error('Pipeline check error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
