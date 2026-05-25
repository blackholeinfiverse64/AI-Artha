# CURRENT_STATE.md — Artha Platform v0.1

## 1. What Artha Is Today

Artha is a financial intelligence and compliance platform built around
double-entry accounting, GST/TDS compliance, audit traceability,
and signal generation for Indian businesses.

Core pillars:

- **Ledger Integrity** — HMAC-SHA256 hash-chained journal entries + SHA-256 hash-chained ledger entries
- **Compliance Validation** — GST (GSTR-1, GSTR-3B) and TDS (Form 24Q, Form 26Q) filing generation with validation
- **Filing Readiness** — Structured JSON filing packets with `ComplianceFiling` records and `ComplianceValidationLog` audit
- **Financial Intelligence** — Signal engine reading ledger balances, dashboard with health score and risk signals
- **Audit Reconstruction** — Every journal entry carries `trace_id`, `auditTrace`, `auditTrail[]`, `prevHash`, `hash`, `chainPosition`

---

## 2. Architecture Overview

```
Browser (React 18 + Vite)
  │
  │  Authorization: Bearer <JWT>
  ▼
Express API  (Node.js 18, port 5000)
  │
  ├── /api/v1/auth          → auth.controller       → User model (bcrypt + JWT)
  ├── /api/v1/ledger        → ledger.controller     → LedgerService
  ├── /api/v1/invoices      → invoice.controller    → InvoiceService
  ├── /api/v1/expenses      → expense.controller    → ExpenseService
  ├── /api/v1/tds           → tds.controller        → TDSService
  ├── /api/v1/gst           → gst.controller        → GSTService / GSTStatutoryService
  ├── /api/v1/compliance    → compliance.controller → ComplianceValidationService
  ├── /api/v1/reports       → reports.controller    → FinancialReportsService
  ├── /api/v1/signals       → signal.controller     → SignalEngineService
  └── /api/v1/settings      → settings routes       → CompanySettings model
  │
  ▼
Services Layer
  ├── ledger.service.js          — journal lifecycle, hash chain, account balance updates
  ├── invoice.service.js         — invoice lifecycle → ledger posting
  ├── expense.service.js         — expense lifecycle → ledger posting
  ├── tds.service.js             — TDS lifecycle → ledger posting
  ├── gstEngine.service.js       — pure GST calculation (IGST / CGST+SGST split)
  ├── gst.service.js             — GSTR-1 / GSTR-3B generation (legacy)
  ├── compliance/
  │   ├── gstStatutory.service.js   — GSTR-1 / GSTR-3B from JournalEntry.gstDetails
  │   ├── tdsStatutory.service.js   — Form 26Q / Form 24Q from TDSEntry
  │   ├── validation.service.js     — filing validation → ComplianceValidationLog
  │   ├── period.util.js            — date range helpers, traceId builder
  │   └── export.service.js         — CSV/JSON export
  ├── signalEngine.service.js    — ledger-only snapshot (cashFlow, TDS payable, GST payable)
  └── financialReports.service.js — P&L, Balance Sheet, Cash Flow, Trial Balance, Aged Receivables
  │
  ▼
Data Layer (MongoDB 7+)
  ├── JournalEntry     — double-entry with HMAC hash chain
  ├── LedgerEntry      — flat debit/credit with SHA-256 hash chain
  ├── AccountBalance   — running balance per ChartOfAccounts entry
  ├── ChartOfAccounts  — 33 pre-seeded accounts (Indian standards)
  ├── Invoice          — lifecycle: draft → sent → partial → paid → cancelled
  ├── Expense          — lifecycle: pending → approved → recorded → rejected
  ├── TDSEntry         — lifecycle: pending → deducted → deposited → filed
  ├── GSTReturn        — GSTR-1 / GSTR-3B records (legacy)
  ├── ComplianceFiling — structured filing packets with sourceTransactions[]
  ├── ComplianceValidationLog — per-filing validation errors
  ├── ComplianceSignal — persisted signal records (model exists, not yet wired to engine)
  ├── CompanySettings  — singleton (_id: 'company_settings'), required for GST
  ├── BankStatement    — uploaded bank statements (augment P&L and Cash Flow)
  ├── User             — auth, roles: admin / accountant / viewer
  └── AuditLog         — action audit trail
  │
  ▼
Cache Layer (Redis 7+ — optional, graceful degradation)
  └── Ledger summary, invoice stats, expense stats
```

---

## 3. Data Flow: Transaction → Signal

```
Invoice Created (draft)
  │  no ledger impact
  ▼
Invoice Sent
  │  InvoiceService.sendInvoice()
  │  → gstEngine.calculateGSTBreakdown() per line
  │  → LedgerService.createJournalEntry()   [status: DRAFT]
  │  → LedgerService.validateJournalEntry() [status: VALIDATED]
  │     validates: line integrity, double-entry balance,
  │                account existence, GST compliance, TDS compliance,
  │                audit trace presence
  │  → LedgerService.postJournalEntry()     [status: POSTED]
  │     verifies HMAC hash, writes LedgerEntries (SHA-256 chain),
  │     updates AccountBalance, invalidates Redis cache
  ▼
JournalEntry (POSTED)
  │  fields: entryNumber, date, description, lines[], gstDetails[],
  │           prevHash, hash, chainPosition, trace_id, auditTrail[]
  ▼
LedgerEntry (per debit/credit line)
  │  fields: journal_id, account_id, type, amount, prev_hash, hash, timestamp
  ▼
AccountBalance (updated in-place)
  │  fields: account, balance, debitTotal, creditTotal, lastUpdated
  ▼
SignalEngineService.getSignalSnapshot()
  │  reads LedgerEntry for accounts: 1000/1010 (cash), TDS Payable, Output CGST/SGST
  │  returns: { cashFlow, tdsPayable, outputCGST, outputSGST }
  ▼
GET /api/v1/signals/snapshot
  │  FinancialIntelligenceDashboard maps snapshot → display signals
  ▼
ComplianceValidationService (on filing generation)
  │  validates GSTR-1 / GSTR-3B / Form 26Q / Form 24Q
  │  writes ComplianceValidationLog
  ▼
ComplianceFiling (persisted)
  │  fields: filingId, filingType, traceId, sourceTransactions[], jsonData
  ▼
[SETU integration — defined in ARTHA_SETU_CONTRACT.md]
```

---

## 4. Key Account Codes

| Code | Name | Type | Role |
|------|------|------|------|
| 1010 | Cash/Bank | Asset | All cash movements |
| 1100 | Accounts Receivable | Asset | Invoice AR |
| 2000 | Accounts Payable | Liability | Vendor payables |
| 2300 | TDS Payable | Liability | TDS deductions |
| 2301 | Input CGST | Asset | GST input credit |
| 2302 | Input SGST | Asset | GST input credit |
| 2303 | Input IGST | Asset | GST input credit |
| 2311 | Output CGST | Liability | GST output liability |
| 2312 | Output SGST | Liability | GST output liability |
| 2313 | Output IGST | Liability | GST output liability |
| 4000 | Revenue | Income | Sales revenue |
| 6xxx | Expense accounts | Expense | Operating expenses |

---

## 5. Major Maturity Improvements (vs. earlier versions)

### Ledger
| Before | Now |
|--------|-----|
| Journal entries only | Journal chain (HMAC-SHA256) + Ledger chain (SHA-256) + AccountBalance snapshots |
| No tamper detection | `verifyHash()` on every post, `verifyLedgerChain()` endpoint |
| No chain position | `chainPosition` field, ordered verification |

### Compliance
| Before | Now |
|--------|-----|
| Basic GST calculation | Full GST engine: IGST/CGST+SGST split, rate validation [0,5,12,18,28], interstate detection |
| No TDS tracking | TDS lifecycle with section-wise tracking (194A/C/H/I/J/192/194Q) |
| No filing packets | `ComplianceFiling` model with `sourceTransactions[]` for full traceability |
| No validation logs | `ComplianceValidationLog` per filing with error codes and severity |

### Audit
| Before | Now |
|--------|-----|
| CRUD history | Hash chain reconstructability — every entry has `trace_id`, `auditTrace`, `auditTrail[]` |
| No chain verification | `GET /api/v1/ledger/verify-chain` endpoint |

---

## 6. Current Limitations

### Signal Layer
- `ComplianceSignal` model exists but is **not written to** by any service
- Signal contracts are not formalized — no `signal_id` format, no severity enum enforcement
- `SignalEngineService` only reads ledger balances; does not evaluate compliance state
- No signals generated from: GST mismatch, TDS missing deduction, invoice overdue, ledger imbalance
- Dashboard falls back to `MOCK_SIGNALS` when `/signals/snapshot` returns empty data

### SETU Integration
- No SETU payload format defined
- No outbound HTTP client to SETU
- No retry/queue mechanism for signal delivery
- No acknowledgement tracking

### Filing
- `gst.service.js` (legacy) and `gstStatutory.service.js` (new) both exist — dual paths for GSTR-1/3B
- `GSTReturn` model (legacy) and `ComplianceFiling` model (new) both used — inconsistent
- GSTR-3B ITC calculation uses only journal `gstDetails` — does not cross-reference `Expense` model

### Cross-System Traceability
- `ComplianceFiling.sourceTransactions[]` links filings to JournalEntry/TDSEntry IDs
- But no reverse lookup: given a JournalEntry, cannot find which filings reference it
- `trace_id` on JournalEntry is not propagated to ComplianceFiling.traceId (separate UUIDs)

### Transactions
- MongoDB transactions only available when replica set is configured
- Without replica set: all multi-step operations (create → validate → post) run without ACID guarantees
- `approveExpense()` auto-calls `recordExpense()` but swallows ledger errors (only logs, does not re-throw)

### Authentication
- New users default to `viewer` role — cannot create invoices or expenses without admin role upgrade
- No refresh token endpoint implemented (listed in README but not in code)
- `routes/index.js` is dead code — never imported in `server.js`
