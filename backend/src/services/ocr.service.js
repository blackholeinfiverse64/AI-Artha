import logger from '../config/logger.js';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

class OCRService {
  /**
   * Extract text from any file — pdf-parse v2 for PDFs, Tesseract for images.
   * @param {string} filePath
   * @param {object} opts - { password?: string }
   */
  async extractText(filePath, opts = {}) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase();
    logger.info(`OCR extractText: ${filePath} (ext=${ext})`);

    if (ext === '.pdf') {
      return await this._extractFromPdf(filePath, opts.password);
    }
    return await this._extractFromImage(filePath);
  }

  /**
   * Extract text from PDF using pdf-parse v2 (PDFParse class API).
   * Handles password-protected PDFs.
   */
  async _extractFromPdf(filePath, password) {
    const buffer = await fsPromises.readFile(filePath);
    const pdfModule = await import('pdf-parse');
    const { PDFParse, PasswordException } = pdfModule;

    const parseOpts = { data: new Uint8Array(buffer) };
    if (password) parseOpts.password = password;

    let parser;
    try {
      parser = new PDFParse(parseOpts);
      const textResult = await parser.getText();

      let info = {};
      try {
        const infoResult = await parser.getInfo();
        info = {
          title: infoResult.info?.Title || null,
          author: infoResult.info?.Author || null,
          creator: infoResult.info?.Creator || null,
          creationDate: infoResult.info?.CreationDate || null,
        };
      } catch { /* info is optional */ }

      const text = textResult.text || '';
      const totalPages = textResult.total || 0;

      logger.info(`PDF extracted: ${totalPages} pages, ${text.length} chars`);

      return { text, pages: totalPages, info };
    } catch (err) {
      if (parser) { try { await parser.destroy(); } catch {} }

      const isPasswordError = (PasswordException && err instanceof PasswordException)
        || err.name === 'PasswordException'
        || /password/i.test(err.message);

      if (isPasswordError) {
        logger.warn(`PDF is password-protected: ${filePath}`);
        return {
          text: '',
          pages: 0,
          info: {},
          error: 'password_required',
          errorMessage: 'This PDF is password-protected. Please provide the password to extract data.',
        };
      }

      logger.error(`PDF extraction error: ${err.name} - ${err.message}`);
      return {
        text: '',
        pages: 0,
        info: {},
        error: 'extraction_failed',
        errorMessage: `PDF extraction failed: ${err.message}`,
      };
    } finally {
      if (parser) { try { await parser.destroy(); } catch {} }
    }
  }

  /**
   * Extract text from image using Tesseract.js
   */
  async _extractFromImage(filePath) {
    try {
      const Tesseract = await import('tesseract.js');
      const { data: { text, confidence } } = await Tesseract.recognize(filePath, 'eng');
      logger.info(`Tesseract OCR done: ${text.length} chars, confidence=${confidence}`);
      return { text, pages: 1, info: {}, ocrConfidence: confidence };
    } catch (err) {
      logger.warn(`Tesseract unavailable (${err.message}), no text extracted from image`);
      return { text: '', pages: 1, info: {}, ocrConfidence: 0 };
    }
  }

  /**
   * Parse raw text into structured fields
   */
  parseText(rawText) {
    const vendor = this._extractVendor(rawText);
    const date = this._extractDate(rawText);
    const amount = this._extractAmount(rawText);
    const taxAmount = this._extractTax(rawText);
    const invoiceNumber = this._extractInvoiceNumber(rawText);
    const items = this._extractLineItems(rawText);

    return {
      vendor,
      date,
      amount,
      taxAmount,
      invoiceNumber,
      items,
      description: rawText.trim().substring(0, 300),
      confidence: this._calcConfidence(rawText, { vendor, amount, date, invoiceNumber, taxAmount }),
    };
  }

  /**
   * Full pipeline: extract → parse
   * @param {string} filePath
   * @param {object} opts - { password?: string }
   */
  async processReceiptFile(filePath, opts = {}) {
    try {
      logger.info(`Processing receipt: ${filePath}`);
      const extraction = await this.extractText(filePath, opts);

      if (extraction.error === 'password_required') {
        return {
          success: true,
          data: {
            vendor: 'Unknown',
            date: new Date().toISOString().split('T')[0],
            amount: '0.00',
            taxAmount: '0.00',
            invoiceNumber: '',
            items: [],
            description: extraction.errorMessage,
            rawText: '',
            confidence: 0,
            pages: 0,
            pdfInfo: {},
            pdfError: 'password_required',
            pdfErrorMessage: extraction.errorMessage,
            processedAt: new Date().toISOString(),
          },
        };
      }

      if (extraction.error) {
        return {
          success: true,
          data: {
            vendor: 'Unknown',
            date: new Date().toISOString().split('T')[0],
            amount: '0.00',
            taxAmount: '0.00',
            invoiceNumber: '',
            items: [],
            description: extraction.errorMessage || 'Failed to read document',
            rawText: '',
            confidence: 0,
            pages: 0,
            pdfInfo: {},
            pdfError: extraction.error,
            pdfErrorMessage: extraction.errorMessage,
            processedAt: new Date().toISOString(),
          },
        };
      }

      const rawText = extraction.text;

      if (!rawText || rawText.trim().length < 5) {
        logger.warn(`Extracted text is empty or too short (${rawText.length} chars)`);
        return {
          success: true,
          data: {
            vendor: 'Unknown',
            date: new Date().toISOString().split('T')[0],
            amount: '0.00',
            taxAmount: '0.00',
            invoiceNumber: '',
            items: [],
            description: '(No readable text in document — may be a scanned image PDF)',
            rawText: '',
            confidence: 0,
            pages: extraction.pages,
            pdfInfo: extraction.info,
            processedAt: new Date().toISOString(),
          },
        };
      }

      const parsed = this.parseText(rawText);

      return {
        success: true,
        data: {
          ...parsed,
          rawText,
          pages: extraction.pages,
          pdfInfo: extraction.info,
          ocrConfidence: extraction.ocrConfidence || null,
          processedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error('processReceiptFile error:', error);
      return { success: false, error: error.message, data: null };
    }
  }

  /* ── Field extraction helpers ──────────────────────── */

  _extractVendor(text) {
    const patterns = [
      /(?:from|vendor|merchant|seller|billed by|company|issued by|shop|store)[\s:]+([^\n,;]+)/i,
      /(?:M\/s\.?|Messrs\.?)[\s:]+([^\n,;]+)/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m?.[1]) {
        const v = m[1].trim();
        if (v.length >= 2 && v.length <= 100 && !/^\d+$/.test(v)) return v;
      }
    }
    const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l.length >= 3);
    for (const line of lines.slice(0, 5)) {
      if (line.length >= 3 && line.length <= 80 && /[A-Za-z]/.test(line) && !/^\d/.test(line)) {
        return line;
      }
    }
    return 'Unknown Vendor';
  }

  _extractDate(text) {
    const patterns = [
      /(?:date|invoice date|bill date|dated|dt)[\s.:]*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
      /(?:date|invoice date|bill date|dated|dt)[\s.:]*(\d{4}[\/-]\d{1,2}[\/-]\d{1,2})/i,
      /(?:date|invoice date|bill date|dated|dt)[\s.:]*(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,]*\d{2,4})/i,
      /(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/,
      /(\d{4}[\/-]\d{1,2}[\/-]\d{1,2})/,
      /(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,]*\d{2,4})/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m?.[1]) {
        try {
          const d = new Date(m[1]);
          if (!isNaN(d) && d.getFullYear() > 2000 && d.getFullYear() < 2100) {
            return d.toISOString().split('T')[0];
          }
        } catch { /* skip */ }
      }
    }
    return new Date().toISOString().split('T')[0];
  }

  _extractAmount(text) {
    const totalPatterns = [
      /(?:grand\s*total|net\s*total|total\s*amount|total\s*due|total\s*payable|amount\s*due|balance\s*due)[\s:]*(?:rs\.?|₹|inr)?\s*([0-9,]+\.?\d{0,2})/i,
      /(?:total)[\s:]*(?:rs\.?|₹|inr)?\s*([0-9,]+\.?\d{0,2})/i,
      /(?:amount|bill\s*amount|invoice\s*amount)[\s:]*(?:rs\.?|₹|inr)?\s*([0-9,]+\.?\d{0,2})/i,
    ];
    for (const p of totalPatterns) {
      const m = text.match(p);
      if (m?.[1]) {
        const val = parseFloat(m[1].replace(/,/g, ''));
        if (!isNaN(val) && val > 0) return val.toFixed(2);
      }
    }
    const currencyPatterns = [
      /(?:rs\.?|₹|inr)\s*([0-9,]+\.?\d{0,2})/gi,
    ];
    const amounts = [];
    for (const p of currencyPatterns) {
      for (const m of text.matchAll(p)) {
        const val = parseFloat(m[1].replace(/,/g, ''));
        if (!isNaN(val) && val > 0) amounts.push(val);
      }
    }
    if (amounts.length) return Math.max(...amounts).toFixed(2);
    return '0.00';
  }

  _extractTax(text) {
    const lines = text.split('\n');
    let total = 0;

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (/cgst|sgst|igst|gst|tax|vat/.test(lower)) {
        const amountMatch = line.match(/(?:rs\.?|₹|inr)\s*([0-9,]+\.\d{2})/i)
          || line.match(/([0-9,]+\.\d{2})\s*$/);
        if (amountMatch?.[1]) {
          const val = parseFloat(amountMatch[1].replace(/,/g, ''));
          if (!isNaN(val) && val > 0) total += val;
        }
      }
    }

    if (total === 0) {
      const m = text.match(/(?:tax\s*amount|gst\s*amount|total\s*tax)[\s:]*(?:rs\.?|₹|inr)?\s*([0-9,]+\.?\d{0,2})/i);
      if (m?.[1]) {
        const val = parseFloat(m[1].replace(/,/g, ''));
        if (!isNaN(val) && val > 0) total = val;
      }
    }

    return total.toFixed(2);
  }

  _extractInvoiceNumber(text) {
    const patterns = [
      /(?:invoice\s*(?:no|number|#|num)\.?)[\s:]*([A-Z0-9][\w\-\/]{2,30})/i,
      /(?:bill\s*(?:no|number|#)\.?)[\s:]*([A-Z0-9][\w\-\/]{2,30})/i,
      /(?:receipt\s*(?:no|number|#)\.?)[\s:]*([A-Z0-9][\w\-\/]{2,30})/i,
      /(?:reference\s*(?:no|number|#)\.?)[\s:]*([A-Z0-9][\w\-\/]{2,30})/i,
      /(?:inv|INV)[\s\-:#]*([A-Z0-9][\w\-\/]{2,30})/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m?.[1]) return m[1].trim();
    }
    return '';
  }

  _extractLineItems(text) {
    const items = [];
    const lines = text.split('\n');
    const itemPattern = /^(.+?)\s+[₹$]?\s?([0-9,]+\.?\d{0,2})\s*$/;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < 5) continue;
      const m = trimmed.match(itemPattern);
      if (m) {
        const desc = m[1].trim();
        const amt = parseFloat(m[2].replace(/,/g, ''));
        if (desc.length >= 2 && !isNaN(amt) && amt > 0) {
          const lower = desc.toLowerCase();
          if (!lower.includes('total') && !lower.includes('balance') && !lower.includes('subtotal')) {
            items.push({ description: desc, amount: amt.toFixed(2) });
          }
        }
      }
    }
    return items.slice(0, 50);
  }

  _calcConfidence(rawText, fields) {
    let score = 30;
    if (rawText.length > 50) score += 10;
    if (rawText.length > 200) score += 10;
    if (fields.vendor !== 'Unknown Vendor') score += 15;
    if (fields.amount !== '0.00') score += 15;
    if (fields.date !== new Date().toISOString().split('T')[0]) score += 10;
    if (fields.invoiceNumber) score += 10;
    if (fields.taxAmount !== '0.00') score += 5;
    return Math.min(Math.max(score, 0), 100);
  }
}

export default new OCRService();
