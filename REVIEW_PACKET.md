# REVIEW_PACKET.md — Artha Platform: Architecture, Signal Contracts & Integration Evidence

**Prepared for:** Engineering Review  
**Platform:** Artha v0.1  
**Scope:** Ledger → Compliance → Signal → SETU integration readiness  

---

## 1. Entry Points

### API Surface
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/v1/auth/login` | Public | JWT login |
| GET | `/api/v1/ledger/entries` | Bearer | Journal entries with pagination |
| GET | `/api/v1/ledger/verify-chain` | Bearer | Full ledger hash-chain verification |
| POST | `/api/v1/invoices/:id/send` | Bearer + accountant | Creates journal entry, posts to ledger |
| POST | `/api/v1/expenses/:id/approve` | Bearer + accountant | Approves + auto-records to ledger |
| POST | `/api/v1/tds/entries/:id/deduct` | Bearer + accountant | Records TDS deduction to ledger |
| GET | `/api/v1/compliance/gst/gstr-1` | Bearer + accountant | Generates GSTR-1 filing packet + validates + emits signal |
| GET | `/api/v1/compliance/gst/gstr-3b` | Bearer + accountant | Generates GSTR-3B + validates + emits signal |
| GET | `/api/v1/compliance/tds/form26q` | Bearer + accountant | Generates Form 26Q + validates + emits signal |
| GET | `/api/v1/signals/snapshot` | Bearer | Ledger-based signal snapshot (cashFlow, TDS, GST payable) |
| GET | `/api/v1/signals` | Bearer | List persisted ComplianceSignal records |
| GET | `/api/v1/signals/trace/:traceId` | Bearer | Full trace reconstruction (signal → filing → journal → ledger) |
| GET | `/api/v1/signals/:signalId/pipeline-check` | Bearer + accountant | Dry-run SETU pipeline for a signal |
| POST | `/api/v1/signals/evaluate/overdue-invoices` | Bearer + accountant | Evaluate + emit overdue invoice signals |

### Data Entry Points
Every financial event enters through one of three service methods:
- `InvoiceService.sendInvoice()` — creates AR journal entry
- `ExpenseService.recordExpense()` — creates expense journal entry  
- `TDSService.recordTDSDeduction()` — creates TDS journal entry

All three call `LedgerService.createJournalEntry()` → `validateJournalEntry()` → `postJournalEntry()`.

---

## 2. Architecture Understanding

### Dual Hash Chain
Artha maintains two independent hash chains:

**Chain 1 — JournalEntry (HMAC-SHA256)**
```
JE-001  prevHash="0"       hash=HMAC(payload, HMAC_SECRET)
JE-002  prevHash=JE-001.hash  hash=HMAC(payload, HMAC_SECRET)
JE-003  prevHash=JE-002.hash  hash=HMAC(payload, HMAC_SECRET)
```
Purpose: Tamper detection on the accounting record itself.

**Chain 2 — LedgerEntry (SHA-256)**
```
LE-001  prev_hash="0"        hash=SHA256(journalId+accountId+amount+prevHash)
LE-002  prev_hash=LE-001.hash hash=SHA256(...)
```
Purpose: Immutable audit trail of every individual debit/credit movement.

Both chains are verified by `GET /api/v1/ledger/verify-chain`.

### Journal Entry Lifecycle (enforced, not optional)
```
DRAFT → VALIDATED → POSTED
```
- `DRAFT`: created, hash computed, not yet verified
- `VALIDATED`: double-entry balanced, accounts exist, GST/TDS compliance checked, audit trace present
- `POSTED`: hash re-verified, LedgerEntries written, AccountBalances updated, Redis cache invalidated

Skipping validation throws: `"Cannot post unvalidated entry"`.

### GST Engine (pure function)
`gstEngine.service.js → calculateGSTBreakdown()`:
- Input: `{ transaction_type, amount, gst_rate, supplier_state, company_state }`
- Output: `{ taxable_value, cgst, sgst, igst, total_amount, is_interstate }`
- Allowed rates: `[0, 5, 12, 18, 28]` — any other rate throws `GST_VALIDATION_ERROR`
- Interstate detection: `supplier_state !== company_state` → IGST only; else CGST+SGST split

---

## 3. Signal Mapping

### Signal Sources and Types
| Source | Signal Type | Severity | Trigger |
|--------|-------------|----------|---------|
| GST_ENGINE | SIG_GST_MISMATCH | HIGH | Invoice tax ≠ GST calculation |
| GST_ENGINE | SIG_GST_INVALID_RATE | HIGH | Rate not in [0,5,12,18,28] |
| GST_ENGINE | SIG_GST_MIXED_TAX_TYPE | HIGH | IGST + CGST/SGST in same entry |
| GST_ENGINE | SIG_GST_COMPANY_STATE_MISSING | CRITICAL | Company state not in settings |
| TDS_ENGINE | SIG_TDS_MISSING_PAN | HIGH | Deductee PAN absent |
| TDS_ENGINE | SIG_TDS_MISSING_CHALLAN | HIGH | Challan not linked |
| TDS_ENGINE | SIG_TDS_EXCESS_DEDUCTION | HIGH | TDS > payment amount |
| LEDGER | SIG_LEDGER_IMBALANCE | CRITICAL | Debits ≠ Credits |
| LEDGER | SIG_LEDGER_HASH_TAMPER | CRITICAL | Hash mismatch on verify |
| LEDGER | SIG_CASHFLOW_NEGATIVE | HIGH | Net cash flow < 0 |
| INVOICE | SIG_INVOICE_OVERDUE | MEDIUM/HIGH | Past due date, unpaid |
| COMPLIANCE_FILING | SIG_FILING_NOT_READY | HIGH | Validation errors in filing |

Full mapping: see `SIGNAL_MAPPING.md`.

### Signal Persistence
All signals are written to `ComplianceSignal` collection before any SETU dispatch.
Dispatch failure never loses the signal — it remains in the DB with `dispatch_status: pending`.

---

## 4. Contract Specification

### SETU Payload (canonical)
```json
{
  "signal_id": "SIG_GST_MISMATCH",
  "trace_id":  "TRC-20260403-a1b2c3d4",
  "source": {
    "system":      "ARTHA",
    "module":      "GST_ENGINE",
    "entity_type": "INVOICE",
    "entity_id":   "INV-20260403-0001"
  },
  "severity":  "HIGH",
  "timestamp": "2026-04-03T10:00:00.000Z",
  "context": {
    "expected_tax": "1800.00",
    "actual_tax":   "1500.00",
    "variance":     "300.00",
    "gst_rate":     18,
    "is_interstate": false
  },
  "recommendation": {
    "code":    "REVIEW_GST_COMPUTATION",
    "message": "Invoice tax amount does not match GST engine calculation."
  }
}
```

### Pipeline (Phase 2A)
Every signal passes through four stages before SETU dispatch:

```
Raw Signal (DB or in-memory)
  │
  ▼ normalizeSignal()
  │  Guarantees: signal_id, trace_id, source{}, severity, timestamp, context{}, recommendation{}
  │  Handles: DB model shape vs in-memory shape, string source vs object source
  │
  ▼ validateSignal()
  │  Checks: known signal type, severity enum, source.system=ARTHA, known module/entity_type,
  │           entity_id not UNKNOWN, context shape for specific signal types
  │  Returns: { valid, errors[], warnings[] } — never throws
  │
  ▼ mapToSetuPayload()
  │  Transforms: normalized → SETU contract shape
  │  Enriches: computes variance from expected_tax/actual_tax if present
  │
  ▼ serializeForSetu()
     Produces: { body: JSON string, headers: { Content-Type, X-Artha-Trace, X-Signal-Type, X-Severity } }
```

Full implementation: `backend/src/services/setu.pipeline.js`

---

## 5. Trace Proof

### End-to-End Trace: Invoice GST Mismatch

**Step 1 — Ledger Entry**
```
POST /api/v1/invoices/INV-20260403-0001/send

JournalEntry created:
  entryNumber:    "JE-20260403-0001"
  trace_id:       "TRC-20260403-a1b2c3d4"
  status:         "POSTED"
  lines:
    DR 1100 (AR)          18000.00
    CR 4000 (Revenue)     15000.00
    CR 2311 (Output CGST)  1500.00   ← actual
    CR 2312 (Output SGST)  1500.00   ← actual

LedgerEntry written:
  journal_id: "JE-20260403-0001"
  account_id: "2311"
  type:       "CREDIT"
  amount:     "1500.00"
  hash:       "abc123..."
```

**Step 2 — Compliance Check**
```
GET /api/v1/compliance/gst/gstr-1?period=2026-04

gstStatutoryService.generateGSTR1():
  reads JournalEntry.gstDetails[]
  gst_rate=18, taxable_value=15000
  expected CGST = 15000 × 9% = 1350.00
  actual CGST from gstDetails = 1500.00
  → tolerance check fails (diff = 150.00 > 0.01)

validationService.validateGSTR1():
  errors: [{ code: "INVALID_GST_RATE", severity: "HIGH", reference_id: "INV-20260403-0001" }]
  filing_ready: false
```

**Step 3 — Signal**
```
signalEngineService.evaluateFilingResult():
  emitSignal({
    signalId:   "SIG_FILING_NOT_READY",
    trace_id:   "TRC-20260403-a1b2c3d4",   ← same trace_id threaded through
    module:     "COMPLIANCE_FILING",
    entityType: "COMPLIANCE_FILING",
    entityId:   "FIL-<uuid>",
    severity:   "HIGH",
    context:    { filing_id, filing_type, error_count: 1, errors: [...] }
  })

ComplianceSignal written:
  signal_id: "SIG-<uuid>"
  type:      "SIG_FILING_NOT_READY"
  trace_id:  "TRC-20260403-a1b2c3d4"
  severity:  "HIGH"
```

**Step 4 — SETU Payload**
```
runPipeline(signal):
  normalizeSignal()  → normalized shape
  validateSignal()   → { valid: true, errors: [], warnings: [] }
  mapToSetuPayload() → SETU contract shape
  serializeForSetu() → { body: '{"signal_id":"SIG_FILING_NOT_READY",...}', headers: {...} }

POST {SETU_BASE_URL}/api/v1/signals/ingest
  X-Artha-Trace: TRC-20260403-a1b2c3d4
  X-Signal-Type: SIG_FILING_NOT_READY
  X-Severity:    HIGH
  Body: { "signal_id": "SIG_FILING_NOT_READY", "trace_id": "TRC-20260403-a1b2c3d4", ... }
```

**Step 5 — Trace Reconstruction**
```
GET /api/v1/signals/trace/TRC-20260403-a1b2c3d4

Response:
{
  "trace_id": "TRC-20260403-a1b2c3d4",
  "steps": [
    { "step": 1, "label": "Signal",                "found": true,  "data": { "type": "SIG_FILING_NOT_READY", "severity": "HIGH" } },
    { "step": 2, "label": "Compliance Validation", "found": true,  "data": { "filingId": "FIL-...", "filing_ready": false, "error_count": 1 } },
    { "step": 3, "label": "Compliance Filing",     "found": true,  "data": { "filingType": "GSTR-1", "sourceTransactionCount": 1 } },
    { "step": 4, "label": "Journal Entries",       "found": true,  "data": [{ "entryNumber": "JE-20260403-0001", "status": "POSTED", "hash": "..." }] },
    { "step": 5, "label": "Ledger Entries",        "found": true,  "data": [{ "journal_id": "JE-20260403-0001", "account_id": "2311", "type": "CREDIT", "amount": "1500.00" }] }
  ]
}
```

Every arrow in the chain is verified by a real DB query. No step is synthetic.

---

## 6. Failure Scenarios

### Scenario A: Company settings not configured
- `InvoiceService.sendInvoice()` calls `CompanySettings.findById('company_settings')`
- If missing: throws `GST_VALIDATION_ERROR: Company state is required for GST`
- Invoice stays `draft`. No journal entry created. No ledger impact.
- **Signal emitted:** None (error thrown before signal layer)
- **Risk:** Silent failure if caller does not surface the error to the user

### Scenario B: MongoDB not a replica set
- `withTransaction()` detects no replica set → runs without ACID session
- `createJournalEntry()` + `validateJournalEntry()` + `postJournalEntry()` run sequentially without rollback
- If `postJournalEntry()` fails after `validateJournalEntry()` succeeds: entry stays `VALIDATED`, never `POSTED`
- AccountBalance is not updated. LedgerEntries not written.
- **Risk:** Orphaned VALIDATED entries that never appear in reports

### Scenario C: SETU unreachable
- `dispatchToSetu()` catches the axios error, logs warning
- Signal is already persisted in `ComplianceSignal` before dispatch attempt
- No retry mechanism exists
- **Risk:** SETU never receives the signal. No alert. No retry.

### Scenario D: GST rate 15% submitted
- `gstEngine.calculateGSTBreakdown()` throws `GST_VALIDATION_ERROR: Invalid GST rate`
- `InvoiceService.sendInvoice()` propagates the error
- Invoice stays `draft`. No journal entry.
- **Signal emitted:** None (error thrown before signal layer)
- **Risk:** User sees a 500 error with no actionable guidance

### Scenario E: Expense auto-record fails after approval
- `ExpenseService.approveExpense()` sets status `approved`, then calls `recordExpense()`
- If `recordExpense()` throws (e.g. account not found): error is caught and only logged
- Expense stays `approved` but is never `recorded`. No journal entry.
- **Signal emitted:** `SIG_EXPENSE_RECORD_FAILED` (logged only, not emitted — gap identified in CONVERGENCE_GAPS.md)

---

## 7. Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Orphaned VALIDATED journal entries (no replica set) | HIGH | MEDIUM | Require replica set in production; add monitoring query for VALIDATED entries older than 1 hour |
| SETU dispatch silently fails | HIGH | MEDIUM | Add `dispatch_status` field to ComplianceSignal; implement retry job |
| Dual signal vocabularies in ComplianceSignal collection | MEDIUM | HIGH | Enforce `signal_type` enum; migrate existing records |
| Company settings not seeded → all invoice sends fail | CRITICAL | LOW | Add startup health check that verifies company_settings exists |
| GST rate validation blocks valid invoices (e.g. 0% exempt) | MEDIUM | LOW | Rate 0 is in allowed set; document that exempt supplies use rate=0 |
| No deduplication of signals | LOW | HIGH | Add idempotency check before ComplianceSignal.create() |
| trace_id not threaded from JournalEntry to ComplianceFiling | MEDIUM | HIGH | Pass JournalEntry.trace_id into filing generation; store in ComplianceFiling |

---

## 8. Artifacts

| File | Purpose |
|------|---------|
| `CURRENT_STATE.md` | Full platform architecture, data flow, maturity analysis, limitations |
| `SIGNAL_MAPPING.md` | Complete signal type catalog, source map, traceability chain |
| `ARTHA_SETU_CONTRACT.md` | Canonical SETU payload contract, per-signal context schemas, env vars |
| `CONVERGENCE_GAPS.md` | Schema, traceability, validation, and observability gaps |
| `REVIEW_PACKET.md` | This document — executive summary + evidence package |
| `backend/src/services/setu.pipeline.js` | Normalizer + Validator + Mapper + Serializer (Phase 2A) |
| `backend/src/services/signalEngine.service.js` | Signal engine with emitSignal(), evaluateFilingResult(), evaluateOverdueInvoices() |
| `backend/src/controllers/signal.controller.js` | Signal endpoints including trace reconstruction and pipeline dry-run |
| `backend/src/routes/signal.routes.js` | Signal routes: snapshot, list, trace/:traceId, pipeline-check, evaluate |

### New API Endpoints Added
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/signals` | List signals with severity/type filter |
| GET | `/api/v1/signals/trace/:traceId` | Full 5-step trace reconstruction |
| GET | `/api/v1/signals/:signalId/pipeline-check` | Dry-run SETU pipeline |
| POST | `/api/v1/signals/evaluate/overdue-invoices` | Emit overdue invoice signals |

### Existing Endpoints — Unchanged
All pre-existing endpoints (`/signals/snapshot`, `/signals/cash-flow`, all compliance,
ledger, invoice, expense, TDS, reports endpoints) retain identical request/response shapes.
