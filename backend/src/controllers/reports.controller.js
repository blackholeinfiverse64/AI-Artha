import financialReportsService from '../services/financialReports.service.js';
import logger from '../config/logger.js';

// @desc    Generate Profit & Loss
// @route   GET /api/v1/reports/profit-loss
// @access  Private
export const getProfitLoss = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required',
      });
    }

    const report = await financialReportsService.generateProfitLoss(startDate, endDate);

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    logger.error('Get profit loss error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Generate Balance Sheet
// @route   GET /api/v1/reports/balance-sheet
// @access  Private
export const getBalanceSheet = async (req, res) => {
  try {
    const { asOfDate } = req.query;

    if (!asOfDate) {
      return res.status(400).json({
        success: false,
        message: 'As of date is required',
      });
    }

    const report = await financialReportsService.generateBalanceSheet(asOfDate);

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    logger.error('Get balance sheet error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Generate Cash Flow
// @route   GET /api/v1/reports/cash-flow
// @access  Private
export const getCashFlow = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required',
      });
    }

    const report = await financialReportsService.generateCashFlow(startDate, endDate);

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    logger.error('Get cash flow error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Generate Trial Balance
// @route   GET /api/v1/reports/trial-balance
// @access  Private
export const getTrialBalance = async (req, res) => {
  try {
    const { asOfDate } = req.query;

    if (!asOfDate) {
      return res.status(400).json({
        success: false,
        message: 'As of date is required',
      });
    }

    const report = await financialReportsService.generateTrialBalance(asOfDate);

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    logger.error('Get trial balance error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Generate Aged Receivables
// @route   GET /api/v1/reports/aged-receivables
// @access  Private
export const getAgedReceivables = async (req, res) => {
  try {
    const { asOfDate } = req.query;

    if (!asOfDate) {
      return res.status(400).json({
        success: false,
        message: 'As of date is required',
      });
    }

    const report = await financialReportsService.generateAgedReceivables(asOfDate);

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    logger.error('Get aged receivables error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Generate Dashboard Summary
// @route   GET /api/v1/reports/dashboard
// @access  Private
export const getDashboardSummary = async (req, res) => {
  try {
    const summary = await financialReportsService.generateDashboardSummary();

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    logger.error('Get dashboard summary error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Generate KPIs
// @route   GET /api/v1/reports/kpis
// @access  Private
export const getKPIs = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required',
      });
    }

    const kpis = await financialReportsService.generateKPIs(startDate, endDate);

    res.json({
      success: true,
      data: kpis,
    });
  } catch (error) {
    logger.error('Get KPIs error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Export Profit & Loss as PDF
// @route   GET /api/v1/reports/profit-loss/export
// @access  Private
export const exportProfitLossPDF = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Start date and end date are required' });
    }
    const exportService = (await import('../services/export.service.js')).default;
    const pdfDoc = await exportService.exportProfitLossPDF(startDate, endDate);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=profit-loss-${startDate}-to-${endDate}.pdf`);
    pdfDoc.pipe(res);
  } catch (error) {
    logger.error('Export P&L error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Export Balance Sheet as PDF
// @route   GET /api/v1/reports/balance-sheet/export
// @access  Private
export const exportBalanceSheetPDF = async (req, res) => {
  try {
    const { asOfDate } = req.query;
    if (!asOfDate) {
      return res.status(400).json({ success: false, message: 'As of date is required' });
    }
    const exportService = (await import('../services/export.service.js')).default;
    const pdfDoc = await exportService.exportBalanceSheetPDF(asOfDate);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=balance-sheet-${asOfDate}.pdf`);
    pdfDoc.pipe(res);
  } catch (error) {
    logger.error('Export balance sheet error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Export Cash Flow as PDF
// @route   GET /api/v1/reports/cash-flow/export
// @access  Private
export const exportCashFlowPDF = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Start date and end date are required' });
    }
    const exportService = (await import('../services/export.service.js')).default;
    const pdfDoc = await exportService.exportCashFlowPDF(startDate, endDate);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=cash-flow-${startDate}-to-${endDate}.pdf`);
    pdfDoc.pipe(res);
  } catch (error) {
    logger.error('Export cash flow error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Export Trial Balance as PDF
// @route   GET /api/v1/reports/trial-balance/export
// @access  Private
export const exportTrialBalancePDF = async (req, res) => {
  try {
    const { asOfDate } = req.query;
    if (!asOfDate) {
      return res.status(400).json({ success: false, message: 'As of date is required' });
    }
    const exportService = (await import('../services/export.service.js')).default;
    const pdfDoc = await exportService.exportTrialBalancePDF(asOfDate);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=trial-balance-${asOfDate}.pdf`);
    pdfDoc.pipe(res);
  } catch (error) {
    logger.error('Export trial balance error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
