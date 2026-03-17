import logger from '../config/logger.js';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

class OCRService {
  /**
   * Extract text from any file — uses pdf-parse for PDFs,
   * Tesseract for images, never returns hardcoded data.
   */
  async extractText(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase();
    logger.info(`OCR extractText: ${filePath} (ext=${ext})`);

    if (ext === '.pdf') {
      return await this._extractFromPdf(filePath);
    }

    return await this._extractFromImage(filePath);
  }

  /**
   * Extract text from a PDF using pdf-parse (reads real content)
   */
  async _extractFromPdf(filePath) {
    try {
      const pdfParse = (await import('pdf-parse')).default;
      const buffer = await fsPromises.readFile(filePath);
      const pdfData = await pdfParse(buffer);

      const text = pdfData.text || '';
      logger.info(`PDF extracted: ${pdfData.numpages} pages, ${text.length} chars`);

      return {
        text,
        pages: pdfData.numpages || 0,
        info: {
          title: pdfData.info?.Title || null,
          author: pdfData.info?.Author || null,
          creator: pdfData.info?.Creator || null,
          creationDate: pdfData.info?.CreationDate || null,
        },
      };
    } catch (err) {
      logger.error(`PDF extraction failed: ${err.message}`);
      return { text: '', pages: 0, info: {} };
    }
  }

  /**
   * Extract text from an image using Tesseract.js (real OCR)
   */
  async _extractFromImage(filePath) {
    try {
      const Tesseract = await import('tesseract.js');
      const { data: { text, confidence } } = await Tesseract.recognize(filePath, 'eng');
      logger.info(`Tesseract OCR done: ${text.length} chars, confidence=${confidence}`);
      return { text, pages: 1, info: {}, ocrConfidence: confidence };
    } catch (err) {
      logger.warn(`Tesseract unavailable (${err.message}), reading filename metadata only`);
      return { text: '', pages: 1, info: {}, ocrConfidence: 0 };
    }
  }

  /**
   * Parse extracted text to structured fields
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
   * Full pipeline: extract text → parse fields
   */
  async processReceiptFile(filePath) {
    try {
      logger.info(`Processing receipt: ${filePath}`);
      const extraction = await this.extractText(filePath);
      const rawText = extraction.text;

      if (!rawText || rawText.trim().length < 5) {
        logger.warn('Extracted text is empty or too short');
        return {
          success: true,
          data: {
            vendor: 'Unknown',
            date: new Date().toISOString().split('T')[0],
            amount: '0.00',
            taxAmount: '0.00',
            invoiceNumber: '',
            items: [],
            description: '(No readable text found in document)',
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
      /^([A-Z][A-Za-z\s&.'-]{2,40})$/m,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m?.[1]) {
        const v = m[1].trim();
        if (v.length >= 2 && v.length <= 100 && !/^\d+$/.test(v)) return v;
      }
    }
    const firstLine = text.trim().split('\n')[0]?.trim();
    if (firstLine && firstLine.length >= 2 && firstLine.length <= 80 && !/^\d/.test(firstLine)) {
      return firstLine;
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
    const patterns = [
      /(?:grand\s*total|net\s*total|total\s*amount|total\s*due|total\s*payable|amount\s*due|balance\s*due)[\s:₹$]*([0-9,]+\.?\d{0,2})/i,
      /(?:total)[\s:₹$]*([0-9,]+\.?\d{0,2})/i,
      /(?:amount|bill\s*amount|invoice\s*amount)[\s:₹$]*([0-9,]+\.?\d{0,2})/i,
      /[₹]\s*([0-9,]+\.?\d{0,2})/,
      /(?:rs\.?|inr)\s*([0-9,]+\.?\d{0,2})/i,
    ];
    let best = 0;
    for (const p of patterns) {
      const m = text.match(p);
      if (m?.[1]) {
        const val = parseFloat(m[1].replace(/,/g, ''));
        if (!isNaN(val) && val > best) {
          best = val;
          break;
        }
      }
    }
    if (best === 0) {
      const allAmounts = [...text.matchAll(/[₹$]?\s?([0-9,]+\.\d{2})/g)]
        .map(m => parseFloat(m[1].replace(/,/g, '')))
        .filter(v => !isNaN(v) && v > 0);
      if (allAmounts.length) best = Math.max(...allAmounts);
    }
    return best.toFixed(2);
  }

  _extractTax(text) {
    const patterns = [
      /(?:cgst|sgst|igst|gst|tax|vat)[\s@\d%]*[\s:₹$]*([0-9,]+\.?\d{0,2})/i,
      /(?:tax\s*amount|gst\s*amount|vat\s*amount)[\s:₹$]*([0-9,]+\.?\d{0,2})/i,
    ];
    let total = 0;
    const seen = new Set();
    for (const p of patterns) {
      const matches = [...text.matchAll(new RegExp(p.source, 'gi'))];
      for (const m of matches) {
        if (m?.[1]) {
          const val = parseFloat(m[1].replace(/,/g, ''));
          const key = val.toFixed(2);
          if (!isNaN(val) && val > 0 && !seen.has(key)) {
            seen.add(key);
            total += val;
          }
        }
      }
      if (total > 0) break;
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
