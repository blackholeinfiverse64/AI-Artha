import Decimal from 'decimal.js';
import JournalEntry from '../models/JournalEntry.js';
import AccountBalance from '../models/AccountBalance.js';
import ChartOfAccounts from '../models/ChartOfAccounts.js';
import Invoice from '../models/Invoice.js';
import Expense from '../models/Expense.js';
import logger from '../config/logger.js';

class FinancialReportsService {
  /**
   * Generate Profit & Loss Statement
   */
  async generateProfitLoss(startDate, endDate) {
    try {
      // Get all posted journal entries in date range
      const entries = await JournalEntry.find({
        status: 'posted',
        date: { $gte: new Date(startDate), $lte: new Date(endDate) },
      }).populate('lines.account', 'code name type');

      // Get all accounts
      const accounts = await ChartOfAccounts.find({ isActive: true });
      const accountMap = {};
      accounts.forEach(acc => {
        accountMap[acc._id.toString()] = acc;
      });

      // Calculate totals by account
      const accountTotals = {};

      entries.forEach(entry => {
        entry.lines.forEach(line => {
          const accountId = line.account._id.toString();
          const account = accountMap[accountId];

          if (!account || (account.type !== 'Income' && account.type !== 'Expense')) {
            return;
          }

          if (!accountTotals[accountId]) {
            accountTotals[accountId] = {
              account: account,
              debit: new Decimal(0),
              credit: new Decimal(0),
              balance: new Decimal(0),
            };
          }

          accountTotals[accountId].debit = accountTotals[accountId].debit.plus(line.debit || 0);
          accountTotals[accountId].credit = accountTotals[accountId].credit.plus(line.credit || 0);
        });
      });

      // Calculate balances (Income: credit - debit, Expense: debit - credit)
      Object.values(accountTotals).forEach(item => {
        if (item.account.type === 'Income') {
          item.balance = item.credit.minus(item.debit);
        } else {
          item.balance = item.debit.minus(item.credit);
        }
      });

      // Separate income and expenses
      const incomeAccounts = [];
      const expenseAccounts = [];

      Object.values(accountTotals).forEach(item => {
        if (item.account.type === 'Income') {
          incomeAccounts.push({
            code: item.account.code,
            name: item.account.name,
            amount: item.balance.toString(),
          });
        } else if (item.account.type === 'Expense') {
          expenseAccounts.push({
            code: item.account.code,
            name: item.account.name,
            amount: item.balance.toString(),
          });
        }
      });

      // Sort by code
      incomeAccounts.sort((a, b) => a.code.localeCompare(b.code));
      expenseAccounts.sort((a, b) => a.code.localeCompare(b.code));

      // Calculate totals
      const totalIncome = incomeAccounts.reduce(
        (sum, item) => sum.plus(item.amount),
        new Decimal(0)
      );

      const totalExpenses = expenseAccounts.reduce(
        (sum, item) => sum.plus(item.amount),
        new Decimal(0)
      );

      const netIncome = totalIncome.minus(totalExpenses);

      return {
        period: {
          startDate,
          endDate,
        },
        income: {
          accounts: incomeAccounts,
          total: totalIncome.toString(),
        },
        expenses: {
          accounts: expenseAccounts,
          total: totalExpenses.toString(),
        },
        netIncome: netIncome.toString(),
      };
    } catch (error) {
      logger.error('Generate P&L error:', error);
      throw error;
    }
  }

  /**
   * Generate Balance Sheet
   */
  async generateBalanceSheet(asOfDate) {
    try {
      // Get account balances as of date
      const entries = await JournalEntry.find({
        status: 'posted',
        date: { $lte: new Date(asOfDate) },
      }).populate('lines.account', 'code name type normalBalance');

      // Get all accounts
      const accounts = await ChartOfAccounts.find({ isActive: true });
      const accountMap = {};
      accounts.forEach(acc => {
        accountMap[acc._id.toString()] = acc;
      });

      // Calculate balances
      const accountBalances = {};

      entries.forEach(entry => {
        entry.lines.forEach(line => {
          const accountId = line.account._id.toString();
          const account = accountMap[accountId];

          if (!account) return;

          if (!accountBalances[accountId]) {
            accountBalances[accountId] = {
              account: account,
              debit: new Decimal(0),
              credit: new Decimal(0),
              balance: new Decimal(0),
            };
          }

          accountBalances[accountId].debit = accountBalances[accountId].debit.plus(
            line.debit || 0
          );
          accountBalances[accountId].credit = accountBalances[accountId].credit.plus(
            line.credit || 0
          );
        });
      });

      // Calculate net balances based on account type
      // Assets & Expenses: Debit balance (debit - credit)
      // Liabilities, Equity & Income: Credit balance (credit - debit)
      Object.values(accountBalances).forEach(item => {
        if (item.account.type === 'Asset' || item.account.type === 'Expense') {
          // Debit balance accounts
          item.balance = item.debit.minus(item.credit);
        } else {
          // Credit balance accounts (Liability, Equity, Income)
          item.balance = item.credit.minus(item.debit);
        }
      });

      // Calculate net income from Income and Expense accounts
      let netIncome = new Decimal(0);
      Object.values(accountBalances).forEach(item => {
        if (item.account.type === 'Income') {
          netIncome = netIncome.plus(item.balance);
        } else if (item.account.type === 'Expense') {
          netIncome = netIncome.minus(item.balance);
        }
      });

      // Categorize accounts
      const assets = [];
      const liabilities = [];
      const equity = [];

      Object.values(accountBalances).forEach(item => {
        const balanceAmount = item.balance;

        // Skip zero balances and Income/Expense accounts (they're in net income)
        if (balanceAmount.isZero() || item.account.type === 'Income' || item.account.type === 'Expense') return;

        const accountInfo = {
          code: item.account.code,
          name: item.account.name,
          amount: balanceAmount.toString(),
        };

        if (item.account.type === 'Asset') {
          assets.push(accountInfo);
        } else if (item.account.type === 'Liability') {
          liabilities.push(accountInfo);
        } else if (item.account.type === 'Equity') {
          equity.push(accountInfo);
        }
      });

      // Add Retained Earnings (Net Income) to Equity
      if (!netIncome.isZero()) {
        equity.push({
          code: '3900',
          name: 'Retained Earnings (Net Income)',
          amount: netIncome.toString(),
        });
      }

      // Sort by code
      assets.sort((a, b) => a.code.localeCompare(b.code));
      liabilities.sort((a, b) => a.code.localeCompare(b.code));
      equity.sort((a, b) => a.code.localeCompare(b.code));

      // Calculate totals
      const totalAssets = assets.reduce(
        (sum, item) => sum.plus(item.amount),
        new Decimal(0)
      );

      const totalLiabilities = liabilities.reduce(
        (sum, item) => sum.plus(item.amount),
        new Decimal(0)
      );

      const totalEquity = equity.reduce(
        (sum, item) => sum.plus(item.amount),
        new Decimal(0)
      );

      // Accounting equation check: Assets = Liabilities + Equity
      const liabilitiesAndEquity = totalLiabilities.plus(totalEquity);
      const difference = totalAssets.minus(liabilitiesAndEquity);
      const isBalanced = difference.abs().lessThan(0.01); // Allow 1 cent rounding difference

      return {
        asOfDate,
        assets: {
          accounts: assets,
          total: totalAssets.toString(),
        },
        liabilities: {
          accounts: liabilities,
          total: totalLiabilities.toString(),
        },
        equity: {
          accounts: equity,
          total: totalEquity.toString(),
        },
        totals: {
          assets: totalAssets.toString(),
          liabilitiesAndEquity: liabilitiesAndEquity.toString(),
          isBalanced,
          difference: difference.toString(),
        },
      };
    } catch (error) {
      logger.error('Generate balance sheet error:', error);
      throw error;
    }
  }

  /**
   * Generate Cash Flow Statement
   */
  async generateCashFlow(startDate, endDate) {
    try {
      // Get all posted journal entries in date range
      const entries = await JournalEntry.find({
        status: 'posted',
        date: { $gte: new Date(startDate), $lte: new Date(endDate) },
      }).populate('lines.account', 'code name type');

      // Find cash accounts (code 1000 or 1010)
      const cashAccounts = await ChartOfAccounts.find({
        code: { $in: ['1000', '1010'] },
        isActive: true,
      });

      const cashAccountIds = cashAccounts.map(acc => acc._id.toString());

      // Categorize cash flows
      const operatingActivities = [];
      const investingActivities = [];
      const financingActivities = [];

      let operatingCashFlow = new Decimal(0);
      let investingCashFlow = new Decimal(0);
      let financingCashFlow = new Decimal(0);

      entries.forEach(entry => {
        let cashInflow = new Decimal(0);
        let cashOutflow = new Decimal(0);
        let otherAccount = null;

        entry.lines.forEach(line => {
          const accountId = line.account._id.toString();

          if (cashAccountIds.includes(accountId)) {
            // This is a cash account line
            cashInflow = cashInflow.plus(line.debit || 0);
            cashOutflow = cashOutflow.plus(line.credit || 0);
          } else {
            // This is the other account
            otherAccount = line.account;
          }
        });

        const netCashChange = cashInflow.minus(cashOutflow);

        if (netCashChange.isZero() || !otherAccount) return;

        const activity = {
          date: entry.date,
          description: entry.description,
          account: otherAccount.name,
          amount: netCashChange.toString(),
        };

        // Categorize based on account type
        if (
          otherAccount.type === 'Income' ||
          otherAccount.type === 'Expense' ||
          otherAccount.code === '1100' || // Accounts Receivable
          otherAccount.code === '2000' // Accounts Payable
        ) {
          operatingActivities.push(activity);
          operatingCashFlow = operatingCashFlow.plus(netCashChange);
        } else if (
          otherAccount.type === 'Asset' &&
          otherAccount.code >= '1800' // Fixed assets
        ) {
          investingActivities.push(activity);
          investingCashFlow = investingCashFlow.plus(netCashChange);
        } else if (otherAccount.type === 'Liability' || otherAccount.type === 'Equity') {
          financingActivities.push(activity);
          financingCashFlow = financingCashFlow.plus(netCashChange);
        }
      });

      const netCashChange = operatingCashFlow
        .plus(investingCashFlow)
        .plus(financingCashFlow);

      return {
        period: {
          startDate,
          endDate,
        },
        operating: {
          activities: operatingActivities,
          netCashFlow: operatingCashFlow.toString(),
        },
        investing: {
          activities: investingActivities,
          netCashFlow: investingCashFlow.toString(),
        },
        financing: {
          activities: financingActivities,
          netCashFlow: financingCashFlow.toString(),
        },
        netCashChange: netCashChange.toString(),
      };
    } catch (error) {
      logger.error('Generate cash flow error:', error);
      throw error;
    }
  }

  /**
   * Generate Trial Balance
   */
  async generateTrialBalance(asOfDate) {
    try {
      const entries = await JournalEntry.find({
        status: 'posted',
        date: { $lte: new Date(asOfDate) },
      }).populate('lines.account', 'code name type normalBalance');

      const accounts = await ChartOfAccounts.find({ isActive: true });
      const accountMap = {};
      accounts.forEach(acc => {
        accountMap[acc._id.toString()] = acc;
      });

      const accountBalances = {};

      entries.forEach(entry => {
        entry.lines.forEach(line => {
          const accountId = line.account._id.toString();
          const account = accountMap[accountId];

          if (!account) return;

          if (!accountBalances[accountId]) {
            accountBalances[accountId] = {
              account: account,
              debit: new Decimal(0),
              credit: new Decimal(0),
            };
          }

          accountBalances[accountId].debit = accountBalances[accountId].debit.plus(
            line.debit || 0
          );
          accountBalances[accountId].credit = accountBalances[accountId].credit.plus(
            line.credit || 0
          );
        });
      });

      const trialBalanceAccounts = [];
      let totalDebits = new Decimal(0);
      let totalCredits = new Decimal(0);

      // Summary by account type
      const typeSummary = {
        Asset: { debit: new Decimal(0), credit: new Decimal(0) },
        Liability: { debit: new Decimal(0), credit: new Decimal(0) },
        Equity: { debit: new Decimal(0), credit: new Decimal(0) },
        Income: { debit: new Decimal(0), credit: new Decimal(0) },
        Expense: { debit: new Decimal(0), credit: new Decimal(0) },
      };

      Object.values(accountBalances).forEach(item => {
        const debit = item.debit;
        const credit = item.credit;

        // Skip if both are zero
        if (debit.isZero() && credit.isZero()) return;

        trialBalanceAccounts.push({
          code: item.account.code,
          name: item.account.name,
          type: item.account.type,
          debit: debit.toString(),
          credit: credit.toString(),
        });

        totalDebits = totalDebits.plus(debit);
        totalCredits = totalCredits.plus(credit);

        // Add to type summary
        if (typeSummary[item.account.type]) {
          typeSummary[item.account.type].debit = typeSummary[item.account.type].debit.plus(debit);
          typeSummary[item.account.type].credit = typeSummary[item.account.type].credit.plus(credit);
        }
      });

      trialBalanceAccounts.sort((a, b) => a.code.localeCompare(b.code));

      const difference = totalDebits.minus(totalCredits);
      const isBalanced = difference.abs().lessThan(0.01); // Allow 1 cent rounding

      return {
        asOfDate,
        accounts: trialBalanceAccounts,
        totals: {
          debit: totalDebits.toString(),
          credit: totalCredits.toString(),
          isBalanced,
          difference: difference.toString(),
        },
        summary: {
          Asset: {
            debit: typeSummary.Asset.debit.toString(),
            credit: typeSummary.Asset.credit.toString(),
          },
          Liability: {
            debit: typeSummary.Liability.debit.toString(),
            credit: typeSummary.Liability.credit.toString(),
          },
          Equity: {
            debit: typeSummary.Equity.debit.toString(),
            credit: typeSummary.Equity.credit.toString(),
          },
          Income: {
            debit: typeSummary.Income.debit.toString(),
            credit: typeSummary.Income.credit.toString(),
          },
          Expense: {
            debit: typeSummary.Expense.debit.toString(),
            credit: typeSummary.Expense.credit.toString(),
          },
        },
      };
    } catch (error) {
      logger.error('Generate trial balance error:', error);
      throw error;
    }
  }

  /**
   * Generate Aged Receivables Report
   */
  async generateAgedReceivables(asOfDate) {
    try {
      const invoices = await Invoice.find({
        status: { $in: ['sent', 'partial', 'overdue'] },
        invoiceDate: { $lte: new Date(asOfDate) },
      }).sort({ dueDate: 1 });

      const asOf = new Date(asOfDate);

      const aging = {
        current: [],
        '1-30': [],
        '31-60': [],
        '61-90': [],
        '90+': [],
      };

      const totals = {
        current: new Decimal(0),
        '1-30': new Decimal(0),
        '31-60': new Decimal(0),
        '61-90': new Decimal(0),
        '90+': new Decimal(0),
      };

      // Group by customer
      const customerMap = {};

      invoices.forEach(invoice => {
        // Calculate amount due
        const totalAmount = new Decimal(invoice.totalAmount || 0);
        const amountPaid = new Decimal(invoice.amountPaid || 0);
        const amountDue = totalAmount.minus(amountPaid);

        if (amountDue.isZero() || amountDue.isNegative()) return;

        const dueDate = new Date(invoice.dueDate);
        const daysOverdue = Math.floor((asOf - dueDate) / (1000 * 60 * 60 * 24));

        const invoiceInfo = {
          invoiceNumber: invoice.invoiceNumber,
          customerName: invoice.customerName,
          invoiceDate: invoice.invoiceDate,
          dueDate: invoice.dueDate,
          totalAmount: totalAmount.toString(),
          amountPaid: amountPaid.toString(),
          amountDue: amountDue.toString(),
          daysOverdue,
        };

        // Determine aging bucket
        let bucket;
        if (daysOverdue <= 0) {
          bucket = 'current';
        } else if (daysOverdue <= 30) {
          bucket = '1-30';
        } else if (daysOverdue <= 60) {
          bucket = '31-60';
        } else if (daysOverdue <= 90) {
          bucket = '61-90';
        } else {
          bucket = '90+';
        }

        aging[bucket].push(invoiceInfo);
        totals[bucket] = totals[bucket].plus(amountDue);

        // Group by customer
        if (!customerMap[invoice.customerName]) {
          customerMap[invoice.customerName] = {
            customerName: invoice.customerName,
            customerEmail: invoice.customerEmail,
            totalDue: new Decimal(0),
            invoices: [],
            aging: {
              current: new Decimal(0),
              '1-30': new Decimal(0),
              '31-60': new Decimal(0),
              '61-90': new Decimal(0),
              '90+': new Decimal(0),
            },
          };
        }

        customerMap[invoice.customerName].totalDue = customerMap[invoice.customerName].totalDue.plus(amountDue);
        customerMap[invoice.customerName].invoices.push(invoiceInfo);
        customerMap[invoice.customerName].aging[bucket] = customerMap[invoice.customerName].aging[bucket].plus(amountDue);
      });

      // Convert customer map to array and format
      const customers = Object.values(customerMap).map(customer => ({
        customerName: customer.customerName,
        customerEmail: customer.customerEmail,
        totalDue: customer.totalDue.toString(),
        invoiceCount: customer.invoices.length,
        aging: {
          current: customer.aging.current.toString(),
          '1-30': customer.aging['1-30'].toString(),
          '31-60': customer.aging['31-60'].toString(),
          '61-90': customer.aging['61-90'].toString(),
          '90+': customer.aging['90+'].toString(),
        },
        invoices: customer.invoices,
      })).sort((a, b) => new Decimal(b.totalDue).minus(new Decimal(a.totalDue)).toNumber());

      const totalReceivables = Object.values(totals).reduce(
        (sum, amt) => sum.plus(amt),
        new Decimal(0)
      );

      return {
        asOfDate,
        aging,
        totals: {
          current: totals.current.toString(),
          '1-30': totals['1-30'].toString(),
          '31-60': totals['31-60'].toString(),
          '61-90': totals['61-90'].toString(),
          '90+': totals['90+'].toString(),
          total: totalReceivables.toString(),
        },
        customers,
        summary: {
          totalCustomers: customers.length,
          totalInvoices: invoices.length,
          totalReceivables: totalReceivables.toString(),
        },
      };
    } catch (error) {
      logger.error('Generate aged receivables error:', error);
      throw error;
    }
  }

  /**
   * Generate Revenue vs Expenses Chart Data
   */
  async generateRevenueExpensesChart(year) {
    try {
      const targetYear = year || new Date().getFullYear();
      const monthlyData = [];

      for (let month = 0; month < 12; month++) {
        const startDate = new Date(targetYear, month, 1);
        const endDate = new Date(targetYear, month + 1, 0);

        const pl = await this.generateProfitLoss(startDate, endDate).catch(() => ({
          income: { total: '0' },
          expenses: { total: '0' },
        }));

        monthlyData.push({
          month: new Date(targetYear, month).toLocaleString('default', { month: 'short' }),
          revenue: parseFloat(pl.income.total),
          expenses: parseFloat(pl.expenses.total),
        });
      }

      return monthlyData;
    } catch (error) {
      logger.error('Generate revenue expenses chart error:', error);
      throw error;
    }
  }

  /**
   * Generate Expense Breakdown Chart Data
   */
  async generateExpenseBreakdown(startDate, endDate) {
    try {
      const expenses = await Expense.aggregate([
        {
          $match: {
            status: { $in: ['approved', 'recorded'] },
            date: { $gte: new Date(startDate), $lte: new Date(endDate) },
          },
        },
        {
          $group: {
            _id: '$category',
            total: { $sum: { $toDouble: '$totalAmount' } },
          },
        },
        { $sort: { total: -1 } },
      ]);

      const totalExpenses = expenses.reduce((sum, exp) => sum + exp.total, 0);

      return expenses.map(exp => ({
        category: exp._id || 'Uncategorized',
        amount: exp.total,
        percentage: totalExpenses > 0 ? ((exp.total / totalExpenses) * 100).toFixed(1) : 0,
      }));
    } catch (error) {
      logger.error('Generate expense breakdown error:', error);
      throw error;
    }
  }

  /**
   * Generate Dashboard Summary
   */
  async generateDashboardSummary() {
    try {
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const firstDayOfYear = new Date(today.getFullYear(), 0, 1);

      // Get current month and year P&L
      const [plMonth, plYear] = await Promise.all([
        this.generateProfitLoss(firstDayOfMonth, lastDayOfMonth).catch(() => ({
          income: { total: '0' },
          expenses: { total: '0' },
          netIncome: '0',
        })),
        this.generateProfitLoss(firstDayOfYear, today).catch(() => ({
          income: { total: '0' },
          expenses: { total: '0' },
          netIncome: '0',
        })),
      ]);

      // Get current balance sheet
      const bs = await this.generateBalanceSheet(today).catch(() => ({
        totals: { assets: '0' },
        liabilities: { total: '0' },
        equity: { total: '0' },
        totals: { isBalanced: true },
      }));

      // Get invoice stats (all time)
      const invoiceStats = await Invoice.aggregate([
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
      ]);

      const invoiceSummary = {
        draft: { count: 0, totalAmount: '0.00', totalDue: '0.00' },
        sent: { count: 0, totalAmount: '0.00', totalDue: '0.00' },
        partial: { count: 0, totalAmount: '0.00', totalDue: '0.00' },
        paid: { count: 0, totalAmount: '0.00', totalDue: '0.00' },
        overdue: { count: 0, totalAmount: '0.00', totalDue: '0.00' },
        cancelled: { count: 0, totalAmount: '0.00', totalDue: '0.00' },
      };
      
      invoiceStats.forEach(stat => {
        invoiceSummary[stat._id] = {
          count: stat.count,
          totalAmount: stat.totalAmount.toFixed(2),
          totalDue: stat.totalDue.toFixed(2),
        };
      });

      // Get expense stats (current month)
      const expenseStats = await Expense.aggregate([
        {
          $match: {
            date: { $gte: firstDayOfMonth, $lte: lastDayOfMonth },
          },
        },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            totalAmount: { $sum: { $toDouble: '$totalAmount' } },
          },
        },
        { $sort: { totalAmount: -1 } },
      ]);

      // Get expense stats by status (all time)
      const expenseStatusStats = await Expense.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalAmount: { $sum: { $toDouble: '$totalAmount' } },
          },
        },
      ]);

      const expenseSummary = {};
      expenseStatusStats.forEach(stat => {
        expenseSummary[stat._id] = {
          count: stat.count,
          totalAmount: stat.totalAmount.toFixed(2),
        };
      });

      // Get recent journal entries
      const recentEntries = await JournalEntry.find({ status: 'posted' })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('postedBy', 'name');

      // Calculate totals
      const totalRevenue = new Decimal(plYear.income.total);
      const totalExpenses = new Decimal(plYear.expenses.total);
      const totalOutstanding = new Decimal(invoiceSummary.sent.totalDue || 0)
        .plus(invoiceSummary.partial.totalDue || 0)
        .plus(invoiceSummary.overdue.totalDue || 0);

      return {
        profitLoss: {
          income: plMonth.income.total,
          expenses: plMonth.expenses.total,
          netIncome: plMonth.netIncome,
        },
        yearToDate: {
          income: plYear.income.total,
          expenses: plYear.expenses.total,
          netIncome: plYear.netIncome,
        },
        balanceSheet: {
          assets: bs.totals?.assets || '0',
          liabilities: bs.liabilities?.total || '0',
          equity: bs.equity?.total || '0',
          isBalanced: bs.totals?.isBalanced || true,
        },
        invoices: invoiceSummary,
        expenses: expenseStats,
        expensesByStatus: expenseSummary,
        recentEntries: recentEntries.map(entry => ({
          entryNumber: entry.entryNumber,
          date: entry.date,
          description: entry.description,
          postedBy: entry.postedBy?.name,
        })),
        summary: {
          totalRevenue: totalRevenue.toString(),
          totalExpenses: totalExpenses.toString(),
          netIncome: totalRevenue.minus(totalExpenses).toString(),
          totalOutstanding: totalOutstanding.toString(),
          revenueChange: 0, // Would need previous period data
          expenseChange: 0, // Would need previous period data
        },
      };
    } catch (error) {
      logger.error('Generate dashboard summary error:', error);
      throw error;
    }
  }

  /**
   * Generate Key Performance Indicators
   */
  async generateKPIs(startDate, endDate) {
    try {
      // Get P&L for the period
      const pl = await this.generateProfitLoss(startDate, endDate);

      // Get balance sheet
      const bs = await this.generateBalanceSheet(endDate);

      // Calculate KPIs
      const totalRevenue = new Decimal(pl.income.total);
      const totalExpenses = new Decimal(pl.expenses.total);
      const netIncome = new Decimal(pl.netIncome);
      const totalAssets = new Decimal(bs.totals.assets);
      const totalEquity = new Decimal(bs.equity.total);

      // Profit margin
      const profitMargin = totalRevenue.isZero()
        ? '0'
        : netIncome.dividedBy(totalRevenue).times(100).toFixed(2);

      // ROA (Return on Assets)
      const roa = totalAssets.isZero()
        ? '0'
        : netIncome.dividedBy(totalAssets).times(100).toFixed(2);

      // ROE (Return on Equity)
      const roe = totalEquity.isZero()
        ? '0'
        : netIncome.dividedBy(totalEquity).times(100).toFixed(2);

      // Expense ratio
      const expenseRatio = totalRevenue.isZero()
        ? '0'
        : totalExpenses.dividedBy(totalRevenue).times(100).toFixed(2);

      // Get AR and AP
      const arAccount = await AccountBalance.findOne({
        account: await ChartOfAccounts.findOne({ code: '1100' }).then(a => a?._id),
      });

      const apAccount = await AccountBalance.findOne({
        account: await ChartOfAccounts.findOne({ code: '2000' }).then(a => a?._id),
      });

      return {
        period: { startDate, endDate },
        profitability: {
          profitMargin: `${profitMargin}%`,
          roa: `${roa}%`,
          roe: `${roe}%`,
          expenseRatio: `${expenseRatio}%`,
        },
        revenue: {
          total: totalRevenue.toString(),
          growth: '0%', // Would need previous period data
        },
        expenses: {
          total: totalExpenses.toString(),
          ratio: `${expenseRatio}%`,
        },
        workingCapital: {
          accountsReceivable: arAccount?.balance || '0',
          accountsPayable: apAccount?.balance || '0',
        },
      };
    } catch (error) {
      logger.error('Generate KPIs error:', error);
      throw error;
    }
  }
}

export default new FinancialReportsService();