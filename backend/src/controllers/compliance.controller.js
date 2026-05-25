import gstStatutoryService from '../services/compliance/gstStatutory.service.js';
import tdsStatutoryService from '../services/compliance/tdsStatutory.service.js';
import validationService from '../services/compliance/validation.service.js';
import tdsLifecycleService from '../services/compliance/tdsLifecycle.service.js';
import complianceSignalService from '../services/compliance/signal.service.js';
import { parseMonthPeriod, parseQuarterPeriod } from '../services/compliance/period.util.js';
import signalEngineService from '../services/signalEngine.service.js';
import {
  flattenGSTR1Rows,
  flattenGSTR3BRows,
  flattenTdsRows,
  toCsv,
} from '../services/compliance/export.service.js';
import logger from '../config/logger.js';

const respondWithCsv = (res, filename, csv) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.send(csv);
};

export const generateGSTR1 = async (req, res) => {
  try {
    const { period, gstin, format = 'json' } = req.query;
    if (!period) {
      return res.status(400).json({ success: false, message: 'period is required (YYYY-MM)' });
    }

    const { filing, traceId, filingId } = await gstStatutoryService.generateGSTR1(period, gstin, req.user?._id);
    const validation = await validationService.validateGSTR1({
      filing,
      period: parseMonthPeriod(period),
      filingId,
      traceId,
    });

    // Emit canonical signal for filing result
    await signalEngineService.evaluateFilingResult({
      filingId, filingType: 'GSTR-1', period, traceId,
      filing_ready: validation.filing_ready,
      errors: validation.errors,
    });

    if (format === 'csv') {
      const rows = flattenGSTR1Rows(filing);
      const headers = ['section', 'invoice_number', 'invoice_date', 'gstin', 'place_of_supply', 'taxable_value', 'tax_rate', 'igst', 'cgst', 'sgst', 'reverse_charge_flag', 'invoice_type'];
      return respondWithCsv(res, `gstr-1-${period}.csv`, toCsv(rows, headers));
    }

    res.json({ success: true, data: filing, validation });
  } catch (error) {
    logger.error('Compliance GSTR1 error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const generateGSTR3B = async (req, res) => {
  try {
    const { period, gstin, format = 'json' } = req.query;
    if (!period) {
      return res.status(400).json({ success: false, message: 'period is required (YYYY-MM)' });
    }

    const { filing, traceId, filingId } = await gstStatutoryService.generateGSTR3B(period, gstin, req.user?._id);
    const validation = await validationService.validateGSTR3B({
      filing,
      period: parseMonthPeriod(period),
      filingId,
      traceId,
    });

    await signalEngineService.evaluateFilingResult({
      filingId, filingType: 'GSTR-3B', period, traceId,
      filing_ready: validation.filing_ready,
      errors: validation.errors,
    });

    if (format === 'csv') {
      const rows = flattenGSTR3BRows(filing);
      const headers = ['section', 'taxable_value', 'cgst', 'sgst', 'igst', 'tax', 'total', 'total_payable'];
      return respondWithCsv(res, `gstr-3b-${period}.csv`, toCsv(rows, headers));
    }

    res.json({ success: true, data: filing, validation });
  } catch (error) {
    logger.error('Compliance GSTR3B error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const generateForm26Q = async (req, res) => {
  try {
    const { quarter, financialYear, format = 'json' } = req.query;
    if (!quarter || !financialYear) {
      return res.status(400).json({ success: false, message: 'quarter and financialYear are required' });
    }

    const { filing, traceId, filingId } = await tdsStatutoryService.generateForm26Q(quarter, financialYear, req.user?._id);
    const validation = await validationService.validateForm26Q({
      filing,
      period: { ...parseQuarterPeriod(quarter, financialYear), quarter, financialYear },
      filingId,
      traceId,
    });

    await signalEngineService.evaluateFilingResult({
      filingId, filingType: 'FORM-26Q', period: `${quarter}-${financialYear}`, traceId,
      filing_ready: validation.filing_ready,
      errors: validation.errors,
    });

    if (format === 'csv') {
      const rows = flattenTdsRows(filing, 'FORM-26Q');
      const headers = ['pan', 'name', 'section', 'amount_paid', 'tds_deducted', 'entry_number', 'transaction_date', 'challan_number', 'challan_date', 'bank_bsr'];
      return respondWithCsv(res, `form-26q-${quarter}-${financialYear}.csv`, toCsv(rows, headers));
    }

    res.json({ success: true, data: filing, validation });
  } catch (error) {
    logger.error('Compliance Form26Q error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const generateForm24Q = async (req, res) => {
  try {
    const { quarter, financialYear, format = 'json' } = req.query;
    if (!quarter || !financialYear) {
      return res.status(400).json({ success: false, message: 'quarter and financialYear are required' });
    }

    const { filing, traceId, filingId } = await tdsStatutoryService.generateForm24Q(quarter, financialYear, req.user?._id);
    const validation = await validationService.validateForm24Q({
      filing,
      period: { ...parseQuarterPeriod(quarter, financialYear), quarter, financialYear },
      filingId,
      traceId,
    });

    await signalEngineService.evaluateFilingResult({
      filingId, filingType: 'FORM-24Q', period: `${quarter}-${financialYear}`, traceId,
      filing_ready: validation.filing_ready,
      errors: validation.errors,
    });

    if (format === 'csv') {
      const rows = flattenTdsRows(filing, 'FORM-24Q');
      const headers = ['employee_pan', 'employee_name', 'employee_id', 'salary_basic', 'salary_hra', 'perquisites', 'other_allowances', 'deductions', 'employer_deductions', 'taxable_salary', 'tds_deducted', 'transaction_date', 'challan_number', 'challan_date', 'bank_bsr'];
      return respondWithCsv(res, `form-24q-${quarter}-${financialYear}.csv`, toCsv(rows, headers));
    }

    res.json({ success: true, data: filing, validation });
  } catch (error) {
    logger.error('Compliance Form24Q error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createTDSChallan = async (req, res) => {
  try {
    const challan = await tdsLifecycleService.createChallan(req.body, req.user?._id);
    res.json({ success: true, data: challan });
  } catch (error) {
    logger.error('Create TDS challan error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const linkTDSChallan = async (req, res) => {
  try {
    const { entryIds } = req.body;
    const challan = await tdsLifecycleService.linkChallanToEntries(req.params.id, entryIds || []);
    res.json({ success: true, data: challan });
  } catch (error) {
    logger.error('Link TDS challan error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const groupTDSQuarter = async (req, res) => {
  try {
    const { quarter, financialYear } = req.query;
    if (!quarter || !financialYear) {
      return res.status(400).json({ success: false, message: 'quarter and financialYear are required' });
    }

    const group = await tdsLifecycleService.groupQuarter(quarter, financialYear);
    res.json({ success: true, data: group });
  } catch (error) {
    logger.error('Group TDS quarter error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const generateComplianceSignals = async (req, res) => {
  try {
    const { period, quarter, financialYear } = req.query;
    const signals = await complianceSignalService.generateSignals({ period, quarter, financialYear });
    res.json({ success: true, data: signals });
  } catch (error) {
    logger.error('Generate compliance signals error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
