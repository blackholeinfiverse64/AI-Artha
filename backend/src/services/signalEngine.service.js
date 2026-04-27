import Decimal from 'decimal.js';
import ChartOfAccounts from '../models/ChartOfAccounts.js';
import LedgerEntry from '../models/LedgerEntry.js';

class SignalEngineService {
  async getAccountIdsByName(name) {
    const accounts = await ChartOfAccounts.find({
      name: { $regex: `^${name}$`, $options: 'i' },
      isActive: true,
    }).select('_id');

    return accounts.map((account) => String(account._id));
  }

  async sumLedgerForAccounts(accountIds, startDate = null, endDate = null) {
    if (!accountIds.length) {
      return new Decimal(0);
    }

    const query = {
      account_id: { $in: accountIds },
    };

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const entries = await LedgerEntry.find(query).select('type amount');

    return entries.reduce((sum, entry) => {
      const amount = new Decimal(entry.amount || 0);
      if (entry.type === 'DEBIT') {
        return sum.plus(amount);
      }
      return sum.minus(amount);
    }, new Decimal(0));
  }

  async calculateCashFlow(startDate = null, endDate = null) {
    const cashAccounts = await ChartOfAccounts.find({
      code: { $in: ['1000', '1010'] },
      isActive: true,
    }).select('_id');

    const cashAccountIds = cashAccounts.map((account) => String(account._id));
    const cashFlow = await this.sumLedgerForAccounts(cashAccountIds, startDate, endDate);

    return {
      source: 'ledger-only',
      accountCodes: ['1000', '1010'],
      startDate,
      endDate,
      cashFlow: cashFlow.toString(),
    };
  }

  async getSignalSnapshot(startDate = null, endDate = null) {
    const cash = await this.calculateCashFlow(startDate, endDate);
    const tdsPayableIds = await this.getAccountIdsByName('TDS Payable');
    const outputCGSTIds = await this.getAccountIdsByName('Output CGST');
    const outputSGSTIds = await this.getAccountIdsByName('Output SGST');

    const tdsPayable = await this.sumLedgerForAccounts(tdsPayableIds, startDate, endDate);
    const outputCGST = await this.sumLedgerForAccounts(outputCGSTIds, startDate, endDate);
    const outputSGST = await this.sumLedgerForAccounts(outputSGSTIds, startDate, endDate);

    return {
      source: 'ledger-only',
      period: {
        startDate,
        endDate,
      },
      cashFlow: cash.cashFlow,
      tdsPayable: tdsPayable.toString(),
      outputCGST: outputCGST.toString(),
      outputSGST: outputSGST.toString(),
    };
  }
}

export default new SignalEngineService();
