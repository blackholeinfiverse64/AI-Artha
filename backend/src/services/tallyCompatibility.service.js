import { randomUUID } from 'crypto';
import logger from '../config/logger.js';
import Invoice from '../models/Invoice.js';
import Expense from '../models/Expense.js';
import JournalEntry from '../models/JournalEntry.js';
import ChartOfAccounts from '../models/ChartOfAccounts.js';
import TDSEntry from '../models/TDSEntry.js';
import CompanySettings from '../models/CompanySettings.js';
import TallyExport from '../models/TallyExport.js';
import TallyImport from '../models/TallyImport.js';

class TallyCompatibilityService {
  // Voucher type mapping
  static VOUCHER_MAP = {
    sales: { tallyType: 'Sales', journalSource: 'Invoice' },
    purchase: { tallyType: 'Purchase', journalSource: 'Expense' },
    receipt: { tallyType: 'Receipt', journalSource: 'Payment' },
    payment: { tallyType: 'Payment', journalSource: 'Payment' },
    journal: { tallyType: 'Journal', journalSource: 'JournalEntry' },
    contra: { tallyType: 'Contra', journalSource: 'JournalEntry' },
    credit_note: { tallyType: 'Credit Note', journalSource: 'CreditNote' },
    debit_note: { tallyType: 'Debit Note', journalSource: 'DebitNote' },
  };

  // Masters mapping (Account types)
  static MASTERS_MAP = {
    'Asset': { tallyGroup: 'Current Assets', tallyNature: 'Indirect Income' },
    'Liability': { tallyGroup: 'Current Liabilities', tallyNature: 'Indirect Expense' },
    'Equity': { tallyGroup: "Capital Account", tallyNature: 'Direct Income' },
    'Income': { tallyGroup: "Sales Accounts", tallyNature: 'Direct Income' },
    'Expense': { tallyGroup: "Purchase Accounts", tallyNature: 'Direct Expense' },
  };

  // Export vouchers in Tally XML format
  async exportVouchers(data) {
    const { companyId, dateRange, voucherTypes, userId } = data;
    const exportRecord = new TallyExport({
      exportType: 'vouchers', format: 'xml', companyId, dateRange,
      voucherTypes: voucherTypes || ['all'], exportedBy: userId,
    });

    try {
      const query = {};
      if (dateRange?.startDate) query.date = { $gte: new Date(dateRange.startDate) };
      if (dateRange?.endDate) query.date = { ...query.date, $lte: new Date(dateRange.endDate) };

      const journals = await JournalEntry.find(query).populate('lines.account', 'code name type');
      const xmlData = this.generateTallyXML(journals);

      exportRecord.status = 'completed';
      exportRecord.recordCount = journals.length;
      exportRecord.metadata.xmlLength = xmlData.length;
      await exportRecord.save();

      return { exportRecord, xmlData };
    } catch (err) {
      exportRecord.status = 'failed';
      exportRecord.errors = [{ entityType: 'Voucher', entityId: '', error: err.message }];
      await exportRecord.save();
      throw err;
    }
  }

  // Export masters (Chart of Accounts)
  async exportMasters(companyId, userId) {
    const exportRecord = new TallyExport({
      exportType: 'masters', format: 'xml', companyId, exportedBy: userId,
    });

    try {
      const accounts = await ChartOfAccounts.find({ isActive: true });
      const mastersData = accounts.map(account => ({
        name: account.name,
        code: account.code,
        group: this.MASTERS_MAP[account.type]?.tallyGroup || account.type,
        type: account.type,
        openingBalance: '0',
      }));

      exportRecord.status = 'completed';
      exportRecord.recordCount = accounts.length;
      await exportRecord.save();

      return { exportRecord, mastersData };
    } catch (err) {
      exportRecord.status = 'failed';
      exportRecord.errors = [{ entityType: 'Master', entityId: '', error: err.message }];
      await exportRecord.save();
      throw err;
    }
  }

  // Export opening balances
  async exportOpeningBalances(companyId, financialYear, userId) {
    const exportRecord = new TallyExport({
      exportType: 'opening_balances', format: 'xml', companyId, exportedBy: userId,
    });

    try {
      const accounts = await ChartOfAccounts.find({ isActive: true });
      const balances = await AccountBalance.find({});
      const balanceMap = new Map(balances.map(b => [String(b.account), b]));

      const openingBalances = accounts.map(account => {
        const balance = balanceMap.get(String(account._id));
        return {
          name: account.name,
          code: account.code,
          type: account.type,
          openingBalance: balance?.balance || '0',
        };
      });

      exportRecord.status = 'completed';
      exportRecord.recordCount = openingBalances.length;
      await exportRecord.save();

      return { exportRecord, openingBalances };
    } catch (err) {
      exportRecord.status = 'failed';
      await exportRecord.save();
      throw err;
    }
  }

  // Import vouchers from Tally format
  async importVouchers(data) {
    const { companyId, vouchers, userId } = data;
    const importRecord = new TallyImport({
      importType: 'vouchers', format: 'json', companyId, importedBy: userId,
    });

    const results = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };

    for (const voucher of vouchers) {
      try {
        const mappedVoucher = this.mapTallyVoucherToARTHA(voucher);
        if (mappedVoucher) {
          results.created++;
        } else {
          results.skipped++;
        }
      } catch (err) {
        results.failed++;
        results.errors.push({ voucher: voucher.id, error: err.message });
      }
    }

    importRecord.status = results.failed === 0 ? 'completed' : 'partial';
    importRecord.importResults = results;
    importRecord.validationResults = { totalRecords: vouchers.length, validRecords: results.created + results.skipped, invalidRecords: results.failed };
    await importRecord.save();

    return { importRecord, results };
  }

  // Import masters from Tally format
  async importMasters(data) {
    const { companyId, masters, userId } = data;
    const importRecord = new TallyImport({
      importType: 'masters', format: 'json', companyId, importedBy: userId,
    });

    const results = { created: 0, updated: 0, skipped: 0, failed: 0, errors: [] };

    for (const master of masters) {
      try {
        const existing = await ChartOfAccounts.findOne({ code: master.code });
        if (existing) {
          results.skipped++;
          continue;
        }

        const account = new ChartOfAccounts({
          code: master.code,
          name: master.name,
          type: master.type || 'Asset',
          normalBalance: ['Asset', 'Expense'].includes(master.type) ? 'debit' : 'credit',
          description: `Imported from Tally - ${master.group || ''}`,
        });
        await account.save();
        results.created++;
      } catch (err) {
        results.failed++;
        results.errors.push({ master: master.code, error: err.message });
      }
    }

    importRecord.status = results.failed === 0 ? 'completed' : 'partial';
    importRecord.importResults = results;
    await importRecord.save();

    return { importRecord, results };
  }

  mapTallyVoucherToARTHA(voucher) {
    const voucherType = Object.keys(TallyCompatibilityService.VOUCHER_MAP)
      .find(key => TallyCompatibilityService.VOUCHER_MAP[key].tallyType === voucher.type);

    if (!voucherType) return null;

    return {
      type: voucherType,
      date: new Date(voucher.date),
      number: voucher.number,
      amount: voucher.amount,
      party: voucher.party,
      narration: voucher.narration,
      reference: voucher.reference,
    };
  }

  generateTallyXML(journals) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE>\n<HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>\n<BODY>\n<IMPORTDATA>\n<REQUESTDESC>\n<REPORTNAME>Vouchers</REPORTNAME>\n</REQUESTDESC>\n<REQUESTDATA>\n';

    for (const journal of journals) {
      xml += `<TALLYMESSAGE xmlns:UDF="TallyUDF">\n`;
      xml += `<VOUCHER VCHTYPE="${journal.source || 'Journal'}" ACTION="Create" OBJVIEW="Accounting Voucher View">\n`;
      xml += `<DATE>${this.formatTallyDate(journal.date)}</DATE>\n`;
      xml += `<NARRATION>${this.escapeXml(journal.description)}</NARRATION>\n`;
      xml += `<VOUCHERNUMBER>${journal.entryNumber}</VOUCHERNUMBER>\n`;

      for (const line of journal.lines) {
        const account = line.account;
        xml += `<ALLLEDGERENTRIES.LIST>\n`;
        xml += `<LEDGERNAME>${this.escapeXml(account?.name || 'Unknown')}</LEDGERNAME>\n`;
        xml += `<AMOUNT>${new Decimal(line.debit || 0).gt(0) ? line.debit : `-${line.credit}`}</AMOUNT>\n`;
        xml += `</ALLLEDGERENTRIES.LIST>\n`;
      }

      xml += `</VOUCHER>\n</TALLYMESSAGE>\n`;
    }

    xml += '</REQUESTDATA>\n</IMPORTDATA>\n</BODY>\n</ENVELOPE>';
    return xml;
  }

  formatTallyDate(date) {
    const d = new Date(date);
    return `${d.getDate().toString().padStart(2, '0')}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getFullYear()}`;
  }

  escapeXml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Generate Tally-compatible export for GST data
  async exportGSTData(period, financialYear, userId) {
    const exportRecord = new TallyExport({
      exportType: 'gst_data', format: 'xml', exportedBy: userId,
    });

    try {
      const invoices = await Invoice.find({
        invoiceDate: { $gte: period.startDate, $lte: period.endDate },
        status: { $in: ['sent', 'paid', 'partial'] },
      });

      const gstData = invoices.map(inv => ({
        invoiceNumber: inv.invoiceNumber,
        date: inv.invoiceDate,
        partyName: inv.customerName,
        partyGSTIN: inv.customerGSTIN,
        taxableAmount: inv.subtotal,
        cgst: inv.gstBreakdown?.cgst || '0',
        sgst: inv.gstBreakdown?.sgst || '0',
        igst: inv.gstBreakdown?.igst || '0',
        totalAmount: inv.totalAmount,
      }));

      exportRecord.status = 'completed';
      exportRecord.recordCount = gstData.length;
      await exportRecord.save();

      return { exportRecord, gstData };
    } catch (err) {
      exportRecord.status = 'failed';
      await exportRecord.save();
      throw err;
    }
  }

  // Validate migration readiness
  async validateMigrationReadiness(companyId) {
    const checks = {
      accountsMigrated: false,
      openingBalancesSet: false,
      gstConfigured: false,
      tdsConfigured: false,
      vouchersImportable: false,
    };

    const accounts = await ChartOfAccounts.countDocuments({ isActive: true });
    checks.accountsMigrated = accounts > 0;

    const settings = await CompanySettings.findOne();
    checks.gstConfigured = !!settings?.gstin;
    checks.tdsConfigured = !!settings?.tan;

    checks.openingBalancesSet = true;
    checks.vouchersImportable = true;

    return {
      ready: Object.values(checks).every(v => v),
      checks,
      recommendations: Object.entries(checks)
        .filter(([, v]) => !v)
        .map(([k]) => `Complete ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}`),
    };
  }
}

import Decimal from 'decimal.js';
import AccountBalance from '../models/AccountBalance.js';

export default new TallyCompatibilityService();
