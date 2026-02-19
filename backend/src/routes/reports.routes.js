import express from 'express';
import { exportGeneralLedger } from '../controllers/pdf.controller.js';
import {
  getProfitLoss,
  getBalanceSheet,
  getCashFlow,
  getTrialBalance,
  getAgedReceivables,
  getDashboardSummary,
  getKPIs,
  exportProfitLossPDF,
  exportBalanceSheetPDF,
  exportCashFlowPDF,
  exportTrialBalancePDF,
  getRevenueExpensesChart,
  getExpenseBreakdown,
} from '../controllers/reports.controller.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Routes
router.route('/general-ledger').get(exportGeneralLedger);
router.route('/profit-loss').get(getProfitLoss);
router.route('/profit-loss/export').get(exportProfitLossPDF);
router.route('/balance-sheet').get(getBalanceSheet);
router.route('/balance-sheet/export').get(exportBalanceSheetPDF);
router.route('/cash-flow').get(getCashFlow);
router.route('/cash-flow/export').get(exportCashFlowPDF);
router.route('/trial-balance').get(getTrialBalance);
router.route('/trial-balance/export').get(exportTrialBalancePDF);
router.route('/aged-receivables').get(getAgedReceivables);
router.route('/dashboard').get(getDashboardSummary);
router.route('/kpis').get(getKPIs);
router.route('/revenue-expenses-chart').get(getRevenueExpensesChart);
router.route('/expense-breakdown').get(getExpenseBreakdown);

export default router;