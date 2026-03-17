import ocrService from './ocr.service.js';
import bankStatementService from './bankStatement.service.js';
import expenseService from './expense.service.js';
import logger from '../config/logger.js';
import fs from 'fs/promises';
import path from 'path';

class SmartUploadService {
  /**
   * Detect document type from file metadata and content heuristics
   * Returns: 'bank_statement' | 'bill' | 'receipt' | 'invoice'
   */
  detectDocumentType(file) {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = file.originalname.toLowerCase();
    const mime = file.mimetype;

    if (ext === '.csv' || ext === '.xls' || ext === '.xlsx') {
      return 'bank_statement';
    }

    if (name.includes('statement') || name.includes('passbook') || name.includes('txn')) {
      return 'bank_statement';
    }

    if (name.includes('invoice') || name.includes('inv-') || name.includes('inv_')) {
      return 'bill';
    }

    if (name.includes('bill') || name.includes('receipt') || name.includes('expense')) {
      return 'receipt';
    }

    if (mime.startsWith('image/')) {
      return 'receipt';
    }

    if (mime === 'application/pdf') {
      return 'auto_detect_pdf';
    }

    return 'receipt';
  }

  /**
   * For PDFs, try to determine if it's a bank statement or a bill/receipt
   * by checking for statement-like patterns in extracted text
   */
  async refinePdfType(filePath) {
    try {
      const pdfParse = (await import('pdf-parse')).default;
      const fileBuffer = await fs.readFile(filePath);
      const pdfData = await pdfParse(fileBuffer);
      const text = pdfData.text.toLowerCase();

      const statementKeywords = [
        'account statement', 'bank statement', 'transaction history',
        'opening balance', 'closing balance', 'passbook',
        'account number', 'account no', 'statement of account',
        'debit', 'credit', 'running balance',
      ];

      const statementScore = statementKeywords.reduce((score, kw) => {
        return score + (text.includes(kw) ? 1 : 0);
      }, 0);

      return statementScore >= 3 ? 'bank_statement' : 'bill';
    } catch (err) {
      logger.warn(`PDF type detection failed: ${err.message}`);
      return 'bill';
    }
  }

  /**
   * Main pipeline: detect type → route to correct processor → return results
   */
  async processUpload(file, userId, metadata = {}) {
    let docType = metadata.documentType || this.detectDocumentType(file);

    if (docType === 'auto_detect_pdf') {
      docType = await this.refinePdfType(file.path);
    }

    logger.info(`Smart upload: detected type = ${docType}, file = ${file.originalname}`);

    const result = {
      documentType: docType,
      fileName: file.originalname,
      fileSize: file.size,
      actions: [],
      summary: {},
    };

    switch (docType) {
      case 'bank_statement':
        return await this._processBankStatement(file, userId, metadata, result);
      case 'bill':
      case 'receipt':
        return await this._processReceipt(file, userId, metadata, result);
      default:
        return await this._processReceipt(file, userId, metadata, result);
    }
  }

  /**
   * Process bank statement: parse → auto-reconcile
   */
  async _processBankStatement(file, userId, metadata, result) {
    try {
      const statementData = {
        accountNumber: metadata.accountNumber || 'Auto-detected',
        bankName: metadata.bankName || 'Auto-detected',
        accountHolderName: metadata.accountHolderName || 'Auto-detected',
        startDate: metadata.startDate ? new Date(metadata.startDate) : new Date(),
        endDate: metadata.endDate ? new Date(metadata.endDate) : new Date(),
        openingBalance: metadata.openingBalance || '0',
        closingBalance: metadata.closingBalance || '0',
      };

      const statement = await bankStatementService.uploadBankStatement(
        statementData, userId, file
      );

      result.actions.push({
        type: 'bank_statement_created',
        message: `Bank statement ${statement.statementNumber} created & processing started`,
        id: statement._id,
        statementNumber: statement.statementNumber,
      });

      result.summary = {
        statementId: statement._id,
        statementNumber: statement.statementNumber,
        status: 'processing',
        message: 'Statement uploaded. Auto-parsing, expense creation, invoice matching, and ledger posting running in background.',
      };

      return result;
    } catch (err) {
      logger.error('Smart upload bank statement error:', err);
      result.actions.push({
        type: 'error',
        message: `Bank statement processing failed: ${err.message}`,
      });
      result.summary = { status: 'failed', message: err.message };
      return result;
    }
  }

  /**
   * Process receipt/bill: OCR → auto-create expense
   */
  async _processReceipt(file, userId, metadata, result) {
    try {
      let ocrData = null;

      if (file.mimetype.startsWith('image/')) {
        const ocrResult = await ocrService.processReceiptFile(file.path);
        if (ocrResult.success) {
          ocrData = ocrResult.data;
          result.actions.push({
            type: 'ocr_completed',
            message: `OCR extracted: vendor=${ocrData.vendor}, amount=${ocrData.amount}, date=${ocrData.date}`,
            confidence: ocrData.confidence,
          });
        }
      }

      if (file.mimetype === 'application/pdf') {
        try {
          const pdfOcr = await ocrService.processReceiptFile(file.path);
          if (pdfOcr.success) {
            ocrData = pdfOcr.data;
            result.actions.push({
              type: 'ocr_completed',
              message: `PDF data extracted: vendor=${ocrData.vendor}, amount=${ocrData.amount}`,
              confidence: ocrData.confidence,
            });
          }
        } catch (err) {
          logger.warn('PDF OCR failed, creating expense with metadata only');
        }
      }

      const expenseData = {
        vendor: ocrData?.vendor || metadata.vendor || 'Unknown Vendor',
        description: ocrData?.description?.substring(0, 200) || metadata.description || `Auto-uploaded: ${file.originalname}`,
        category: metadata.category || 'other',
        date: ocrData?.date || metadata.date || new Date().toISOString().split('T')[0],
        amount: ocrData?.amount || metadata.amount || '0',
        taxAmount: ocrData?.taxAmount || metadata.taxAmount || '0',
        totalAmount: ocrData?.amount || metadata.amount || '0',
        paymentMethod: metadata.paymentMethod || 'other',
        notes: `Auto-created via Smart Upload from: ${file.originalname}`,
      };

      const expense = await expenseService.createExpense(
        expenseData,
        userId,
        [file]
      );

      result.actions.push({
        type: 'expense_created',
        message: `Expense ${expense.expenseNumber} created: ₹${expenseData.totalAmount} - ${expenseData.vendor}`,
        id: expense._id,
        expenseNumber: expense.expenseNumber,
      });

      result.summary = {
        expenseId: expense._id,
        expenseNumber: expense.expenseNumber,
        vendor: expenseData.vendor,
        description: expenseData.description,
        category: expenseData.category,
        amount: expenseData.totalAmount,
        date: expenseData.date,
        taxAmount: expenseData.taxAmount,
        paymentMethod: expenseData.paymentMethod,
        status: 'created',
        ocrConfidence: ocrData?.confidence || null,
        ocrItems: ocrData?.items || [],
        ocrRawText: ocrData?.rawText?.substring(0, 300) || null,
        message: 'Expense auto-created from uploaded document. Pending approval.',
      };

      return result;
    } catch (err) {
      logger.error('Smart upload receipt error:', err);
      result.actions.push({
        type: 'error',
        message: `Receipt processing failed: ${err.message}`,
      });
      result.summary = { status: 'failed', message: err.message };
      return result;
    }
  }

  /**
   * Process multiple files in batch
   */
  async processBatchUpload(files, userId, metadata = {}) {
    const results = [];

    for (const file of files) {
      try {
        const result = await this.processUpload(file, userId, metadata);
        results.push(result);
      } catch (err) {
        results.push({
          documentType: 'unknown',
          fileName: file.originalname,
          fileSize: file.size,
          actions: [{ type: 'error', message: err.message }],
          summary: { status: 'failed', message: err.message },
        });
      }
    }

    return {
      totalFiles: files.length,
      processed: results.filter(r => r.summary?.status !== 'failed').length,
      failed: results.filter(r => r.summary?.status === 'failed').length,
      results,
    };
  }
}

export default new SmartUploadService();
