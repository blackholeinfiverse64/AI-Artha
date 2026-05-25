import Decimal from 'decimal.js';
import { randomUUID } from 'crypto';
import ChartOfAccounts from '../models/ChartOfAccounts.js';
import LedgerEntry from '../models/LedgerEntry.js';
import ComplianceSignal from '../models/ComplianceSignal.js';
import Invoice from '../models/Invoice.js';
import logger from '../config/logger.js';

// ─── Trace ID ────────────────────────────────────────────────────────────────

function buildTraceId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `TRC-${date}-${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

// ─── Recommendation map ───────────────────────────────────────────────────────

const RECOMMENDATIONS = {
  SIG_GST_MISMATCH:              { code: 'REVIEW_GST_COMPUTATION',     message: 'Invoice tax amount does not match GST engine calculation. Review line-level tax rates.' },
  SIG_GST_EXPENSE_MISMATCH:      { code: 'REVIEW_GST_COMPUTATION',     message: 'Expense tax amount does not match GST engine calculation.' },
  SIG_GST_INVALID_RATE:          { code: 'REVIEW_GST_COMPUTATION',     message: 'GST rate is not in the allowed set [0, 5, 12, 18, 28].' },
  SIG_GST_MIXED_TAX_TYPE:        { code: 'CORRECT_TAX_CLASSIFICATION', message: 'IGST cannot be mixed with CGST/SGST in the same entry.' },
  SIG_GST_COMPANY_STATE_MISSING: { code: 'REVIEW_GST_COMPUTATION',     message: 'Company state is required for GST calculation. Update company settings.' },
  SIG_GST_CUSTOMER_STATE_MISSING:{ code: 'ADD_CUSTOMER_GSTIN',         message: 'Customer state is required for GST. Add customer GSTIN or state.' },
  SIG_GST_MISSING_GSTIN:         { code: 'ADD_CUSTOMER_GSTIN',         message: 'B2B supply requires customer GSTIN. Update invoice.' },
  SIG_GST_PERIOD_MISMATCH:       { code: 'VERIFY_INVOICE_PERIOD',      message: 'Invoice date falls outside the filing period.' },
  SIG_GST_DUPLICATE_REFERENCE:   { code: 'RESOLVE_FILING_ERRORS',      message: 'Duplicate invoice reference detected in filing.' },
  SIG_GST_NEGATIVE_LIABILITY:    { code: 'REVIEW_ITC_CLAIMS',          message: 'Net GST liability is negative. Review ITC claims.' },
  SIG_TDS_MISSING_PAN:           { code: 'UPDATE_DEDUCTEE_PAN',        message: 'Deductee PAN is missing. Required for TDS filing.' },
  SIG_TDS_INVALID_SECTION:       { code: 'REVIEW_TDS_RATE',            message: 'TDS section code is invalid.' },
  SIG_TDS_MISSING_CHALLAN:       { code: 'LINK_CHALLAN',               message: 'Challan linkage missing for TDS entry. Deposit and link challan.' },
  SIG_TDS_EXCESS_DEDUCTION:      { code: 'REVIEW_TDS_RATE',            message: 'TDS amount exceeds payment amount. Review TDS rate.' },
  SIG_TDS_MISSING_EMPLOYEE_PAN:  { code: 'UPDATE_DEDUCTEE_PAN',        message: 'Employee PAN missing for Form 24Q.' },
  SIG_LEDGER_IMBALANCE:          { code: 'INVESTIGATE_LEDGER',         message: 'Journal entry debits do not equal credits. Investigate immediately.' },
  SIG_LEDGER_HASH_TAMPER:        { code: 'INVESTIGATE_LEDGER',         message: 'Ledger entry hash mismatch detected. Possible data tampering.' },
  SIG_LEDGER_CHAIN_BREAK:        { code: 'INVESTIGATE_LEDGER',         message: 'Ledger chain linkage broken. Chain integrity compromised.' },
  SIG_LEDGER_INVALID_ACCOUNT:    { code: 'INVESTIGATE_LEDGER',         message: 'One or more accounts are invalid or inactive.' },
  SIG_LEDGER_LINE_INTEGRITY:     { code: 'INVESTIGATE_LEDGER',         message: 'Journal line has both debit and credit set.' },
  SIG_CASHFLOW_NEGATIVE:         { code: 'PRIORITIZE_COLLECTIONS',     message: 'Net cash flow is negative. Prioritize collections and defer discretionary spend.' },
  SIG_INVOICE_OVERDUE:           { code: 'PRIORITIZE_COLLECTIONS',     message: 'Invoice is past due date with outstanding balance.' },
  SIG_INVOICE_OVERPAYMENT:       { code: 'INVESTIGATE_LEDGER',         message: 'Payment amount exceeds invoice amount due.' },
  SIG_EXPENSE_RECORD_FAILED:     { code: 'RESOLVE_FILING_ERRORS',      message: 'Expense auto-record after approval failed. Manual recording required.' },
  SIG_FILING_NOT_READY:          { code: 'RESOLVE_FILING_ERRORS',      message: 'Compliance filing has validation errors and is not ready for submission.' },
  SIG_FILING_GENERATED:          { code: 'REVIEW_BEFORE_FILING',       message: 'Filing packet generated. Review before submission.' },
};

// ─── Core signal builder ──────────────────────────────────────────────────────

function buildSignalPayload({ signalId, traceId, module: mod, entityType, entityId, severity, context }) {
  const rec = RECOMMENDATIONS[signalId] || { code: 'REVIEW_REQUIRED', message: 'Review this signal.' };
  return {
    signal_id: signalId,
    trace_id: traceId || buildTraceId(),
    source: {
      system: 'ARTHA',
      module: mod,
      entity_type: entityType,
      entity_id: entityId,
    },
    severity,
    timestamp: new Date().toISOString(),
    context,
    recommendation: rec,
  };
}

// ─── Persist signal to DB ─────────────────────────────────────────────────────

async function persistSignal(payload) {
  try {
    await ComplianceSignal.create({
      trace_id: payload.trace_id,
      source: payload.source.system,
      type: payload.signal_id,
      severity: payload.severity,
      context: { ...payload.context, source: payload.source },
      recommendation: `[${payload.recommendation.code}] ${payload.recommendation.message}`,
    });
  } catch (err) {
    // Never let signal persistence break the calling flow
    logger.warn(`Signal persist failed for ${payload.signal_id}: ${err.message}`);
  }
}

// ─── SETU dispatch — runs full pipeline before sending ──────────────────────

async function dispatchToSetu(payload) {
  if (process.env.SETU_ENABLED !== 'true') return;

  const baseUrl = process.env.SETU_BASE_URL;
  const apiKey  = process.env.SETU_API_KEY;
  if (!baseUrl || !apiKey) {
    logger.warn('SETU_BASE_URL or SETU_API_KEY not configured — skipping dispatch');
    return;
  }

  // Run the full Normalize → Validate → Map → Serialize pipeline
  const { runPipeline } = await import('./setu.pipeline.js');
  const result = runPipeline(payload);

  if (!result.ok) {
    logger.warn(`SETU pipeline failed at stage ${result.stage} for ${payload.signal_id}: ${result.error}`);
    return;
  }

  if (result.warnings?.length) {
    logger.warn(`SETU pipeline warnings for ${payload.signal_id}: ${result.warnings.join('; ')}`);
  }

  try {
    const { default: axios } = await import('axios');
    await axios.post(`${baseUrl}/api/v1/signals/ingest`, result.body, {
      headers: {
        ...result.headers,
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: parseInt(process.env.SETU_TIMEOUT_MS || '5000', 10),
    });
    logger.info(`Signal dispatched to SETU: ${payload.signal_id} trace=${payload.trace_id}`);
  } catch (err) {
    logger.warn(`SETU dispatch failed for ${payload.signal_id}: ${err.message}`);
  }
}

// ─── Public emit function ─────────────────────────────────────────────────────

export async function emitSignal(opts) {
  const payload = buildSignalPayload(opts);
  await persistSignal(payload);
  await dispatchToSetu(payload);
  return payload;
}

// ─── SignalEngineService class (extends existing snapshot logic) ───────────────

class SignalEngineService {
  async getAccountIdsByName(name) {
    const accounts = await ChartOfAccounts.find({
      name: { $regex: `^${name}$`, $options: 'i' },
      isActive: true,
    }).select('_id');
    return accounts.map((a) => String(a._id));
  }

  async sumLedgerForAccounts(accountIds, startDate = null, endDate = null) {
    if (!accountIds.length) return new Decimal(0);

    const query = { account_id: { $in: accountIds } };
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate)   query.timestamp.$lte = new Date(endDate);
    }

    const entries = await LedgerEntry.find(query).select('type amount');
    return entries.reduce((sum, entry) => {
      const amount = new Decimal(entry.amount || 0);
      return entry.type === 'DEBIT' ? sum.plus(amount) : sum.minus(amount);
    }, new Decimal(0));
  }

  async calculateCashFlow(startDate = null, endDate = null) {
    const cashAccounts = await ChartOfAccounts.find({
      code: { $in: ['1000', '1010'] },
      isActive: true,
    }).select('_id');

    const cashAccountIds = cashAccounts.map((a) => String(a._id));
    const cashFlow = await this.sumLedgerForAccounts(cashAccountIds, startDate, endDate);

    return {
      source: 'ledger-only',
      accountCodes: ['1000', '1010'],
      startDate,
      endDate,
      cashFlow: cashFlow.toString(),
    };
  }

  /**
   * Snapshot — backward-compatible with existing /signals/snapshot endpoint.
   * Now also evaluates signals and persists them.
   */
  async getSignalSnapshot(startDate = null, endDate = null) {
    const cash        = await this.calculateCashFlow(startDate, endDate);
    const tdsIds      = await this.getAccountIdsByName('TDS Payable');
    const cgstIds     = await this.getAccountIdsByName('Output CGST');
    const sgstIds     = await this.getAccountIdsByName('Output SGST');

    const tdsPayable  = await this.sumLedgerForAccounts(tdsIds,  startDate, endDate);
    const outputCGST  = await this.sumLedgerForAccounts(cgstIds, startDate, endDate);
    const outputSGST  = await this.sumLedgerForAccounts(sgstIds, startDate, endDate);

    const cashFlowNum = new Decimal(cash.cashFlow);

    // Emit cash flow signal if negative
    if (cashFlowNum.isNegative()) {
      await emitSignal({
        signalId:   'SIG_CASHFLOW_NEGATIVE',
        traceId:    buildTraceId(),
        module:     'LEDGER',
        entityType: 'JOURNAL_ENTRY',
        entityId:   'LEDGER_SNAPSHOT',
        severity:   'HIGH',
        context: {
          cash_flow:    cash.cashFlow,
          account_codes: ['1000', '1010'],
          period_start: startDate,
          period_end:   endDate,
        },
      });
    }

    return {
      source: 'ledger-only',
      period: { startDate, endDate },
      cashFlow:   cash.cashFlow,
      tdsPayable: tdsPayable.toString(),
      outputCGST: outputCGST.toString(),
      outputSGST: outputSGST.toString(),
    };
  }

  /**
   * Evaluate overdue invoices and emit signals.
   * Called on-demand; does not break any existing endpoint.
   */
  async evaluateOverdueInvoices() {
    const today = new Date();
    const overdue = await Invoice.find({
      status: { $in: ['sent', 'partial', 'overdue'] },
      dueDate: { $lt: today },
    }).select('invoiceNumber customerName dueDate totalAmount amountPaid');

    const signals = [];
    for (const inv of overdue) {
      const amountDue = new Decimal(inv.totalAmount || 0).minus(inv.amountPaid || 0);
      if (amountDue.isZero() || amountDue.isNegative()) continue;

      const daysOverdue = Math.floor((today - new Date(inv.dueDate)) / 86400000);
      const severity = daysOverdue > 60 ? 'HIGH' : daysOverdue > 30 ? 'MEDIUM' : 'LOW';

      const sig = await emitSignal({
        signalId:   'SIG_INVOICE_OVERDUE',
        traceId:    buildTraceId(),
        module:     'INVOICE',
        entityType: 'INVOICE',
        entityId:   inv.invoiceNumber,
        severity,
        context: {
          invoice_number: inv.invoiceNumber,
          customer_name:  inv.customerName,
          due_date:       inv.dueDate?.toISOString().split('T')[0],
          days_overdue:   daysOverdue,
          amount_due:     amountDue.toFixed(2),
        },
      });
      signals.push(sig);
    }
    return signals;
  }

  /**
   * Evaluate a compliance filing result and emit SIG_FILING_NOT_READY if needed.
   * Called by compliance controller after validation.
   */
  async evaluateFilingResult({ filingId, filingType, period, traceId, filing_ready, errors }) {
    if (filing_ready) {
      return await emitSignal({
        signalId:   'SIG_FILING_GENERATED',
        traceId:    traceId || buildTraceId(),
        module:     'COMPLIANCE_FILING',
        entityType: 'COMPLIANCE_FILING',
        entityId:   filingId,
        severity:   'LOW',
        context:    { filing_id: filingId, filing_type: filingType, period },
      });
    }

    return await emitSignal({
      signalId:   'SIG_FILING_NOT_READY',
      traceId:    traceId || buildTraceId(),
      module:     'COMPLIANCE_FILING',
      entityType: 'COMPLIANCE_FILING',
      entityId:   filingId,
      severity:   'HIGH',
      context: {
        filing_id:   filingId,
        filing_type: filingType,
        period,
        error_count: errors.length,
        errors:      errors.slice(0, 10), // cap to avoid oversized payloads
      },
    });
  }
}

export { buildTraceId };
export default new SignalEngineService();
