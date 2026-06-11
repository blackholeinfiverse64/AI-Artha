# REVIEW_PACKET.md — Artha Platform: Architecture, Signal Contracts & Integration Evidence

**Prepared for:** Engineering Review  
**Platform:** Artha v0.1  
**Scope:** Ledger → Compliance → Signal → SETU integration readiness  
**Last Updated:** June 2026 — Phase 3/4/5 Sprint Complete  

---

## Changelog (Phase 3/4/5 Sprint)

| Date | Change |
|------|--------|
| June 2026 | Design system capability extraction complete — `frontend/src/design-system/` |
| June 2026 | Ecosystem readiness assessment — `docs/ecosystem-readiness.md` |
| June 2026 | Lineage model documented — `docs/lineage-model.md` |
| June 2026 | Replay proof documented — `docs/replay-proof.md` |
| June 2026 | Runtime proof package in `docs/runtime-proof/` |
| June 2026 | REVIEW_PACKET.md updated with Phase 3/4/5 artifacts |

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
  │
  ▼ validateSignal()
  │  Checks: known signal type, severity enum, source.system=ARTHA, known module/entity_type,
  │          entity_id not UNKNOWN, context shape for specific signal types
  │  Returns: { valid, errors[], warnings[] } — never throws
  │
  ▼ mapToSetuPayload()
  │  Transforms: normalized → SETU contract shape
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
    CR 2311 (Output CGST)  1500.00
    CR 2312 (Output SGST)  1500.00
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
    trace_id:   "TRC-20260403-a1b2c3d4",
    module:     "COMPLIANCE_FILING",
    severity:   "HIGH",
  })

ComplianceSignal written:
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
```

**Step 5 — Trace Reconstruction**
```
GET /api/v1/signals/trace/TRC-20260403-a1b2c3d4

Response:
{
  "trace_id": "TRC-20260403-a1b2c3d4",
  "steps": [
    { "step": 1, "label": "Signal",                "found": true, "data": { "type": "SIG_FILING_NOT_READY" }},
    { "step": 2, "label": "Compliance Validation", "found": true, "data": { "filing_ready": false }},
    { "step": 3, "label": "Compliance Filing",     "found": true, "data": { "filingType": "GSTR-1" }},
    { "step": 4, "label": "Journal Entries",       "found": true, "data": [{ "entryNumber": "JE-20260403-0001" }]},
    { "step": 5, "label": "Ledger Entries",        "found": true, "data": [{ "account_id": "2311", "type": "CREDIT" }]}
  ]
}
```

---

## 6. Failure Scenarios

### Scenario A: Company settings not configured
- Signal emitted: None — error thrown before signal layer
- Risk: Silent failure if caller does not surface error to user

### Scenario B: MongoDB not a replica set
- `withTransaction()` runs without ACID session
- Orphaned VALIDATED entries possible
- Risk: Account balances not updated

### Scenario C: SETU unreachable
- Signal preserved with `dispatch_status: pending`
- No retry mechanism exists (GAP-001)
- Risk: SETU never receives signal

### Scenario D: GST rate 15% submitted
- `gstEngine.calculateGSTBreakdown()` throws
- Invoice stays draft — no journal entry
- Risk: User sees 500 error with no guidance

### Scenario E: Expense auto-record fails after approval
- Expense stays `approved` but never `recorded`
- Signal: `SIG_EXPENSE_RECORD_FAILED` logged only, not emitted
- Risk: Missing ledger entry for approved expense

---

## 7. Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Orphaned VALIDATED journal entries | HIGH | MEDIUM | Require replica set; monitor VALIDATED entries > 1hr |
| SETU dispatch silently fails | HIGH | MEDIUM | Add dispatch retry job (GAP-001) |
| Dual signal vocabularies | MEDIUM | HIGH | Enforce enum schema; migrate records (GAP-004) |
| Company settings not seeded | CRITICAL | LOW | Startup health check (GAP-006) |
| No signal deduplication | LOW | HIGH | Add idempotency check (GAP-002) |
| trace_id not in ComplianceFiling | MEDIUM | HIGH | Store trace_id on filing creation (GAP L-1) |

---

## 8. Phase 3/4/5 Deliverables Index

### Design System Package (`frontend/src/design-system/`)
| File | Status | Description |
|------|--------|-------------|
| `colors.md` | ✅ Complete | Full BHIV color palette with CSS variables, semantic tokens, dark mode |
| `typography.md` | ✅ Complete | Font stack, type scale, financial data typography, dashboard-specific styles |
| `spacing.md` | ✅ **NEW** | 8-point grid, semantic tokens, card anatomy, grid patterns, Tailwind mapping |
| `layout_rules.md` | ✅ **NEW** | Page shell, grid patterns, information hierarchy, z-index, animations |
| `dashboard_patterns.md` | ✅ **NEW** | 5 documented dashboard patterns with blueprints and density guidance |
| `component_library.md` | ✅ **NEW** | 8 reusable card components with props, usage examples, reference implementations |

### Documentation (`docs/`)
| File | Status | Description |
|------|--------|-------------|
| `ecosystem-readiness.md` | ✅ **NEW** | Phase 4: Trace/dashboard/observability compatibility + 6 known gaps + future recommendations |
| `lineage-model.md` | ✅ **NEW** | Phase 5: Full lineage graph, entity relationships, trace reconstruction, hash chain integrity |
| `replay-proof.md` | ✅ **NEW** | Phase 5: Replay architecture, API contract, replay packet format, forensic use cases |
| `runtime-proof/` | ✅ Existing | Runtime evidence package |

### Review Packet
| File | Status | Description |
|------|--------|-------------|
| `REVIEW_PACKET.md` | ✅ **UPDATED** | This document — now includes Phase 3/4/5 artifact index |
| `review_packets/REVIEW_PACKET.md` | ✅ **NEW** | Copy in review_packets/ directory |

---

## 9. Artifacts

| File | Purpose |
|------|---------|
| `CURRENT_STATE.md` | Full platform architecture, data flow, maturity analysis |
| `SIGNAL_MAPPING.md` | Complete signal type catalog, source map, traceability chain |
| `ARTHA_SETU_CONTRACT.md` | Canonical SETU payload contract, per-signal context schemas |
| `CONVERGENCE_GAPS.md` | Schema, traceability, validation, and observability gaps |
| `docs/ecosystem-readiness.md` | Phase 4: Ecosystem readiness assessment |
| `docs/lineage-model.md` | Phase 5: Data lineage model documentation |
| `docs/replay-proof.md` | Phase 5: Replay proof documentation |
| `frontend/src/design-system/` | Phase 3: BHIV reusable design system |
| `backend/src/services/setu.pipeline.js` | Signal normalizer + validator + mapper + serializer |
| `backend/src/services/signalEngine.service.js` | Signal engine core |
| `backend/scripts/replay-provenance-proof.js` | Replay proof script |

### New API Endpoints Added
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/signals` | List signals with severity/type filter |
| GET | `/api/v1/signals/trace/:traceId` | Full 5-step trace reconstruction |
| GET | `/api/v1/signals/:signalId/pipeline-check` | Dry-run SETU pipeline |
| POST | `/api/v1/signals/evaluate/overdue-invoices` | Emit overdue invoice signals |

---

**Document Version**: 2.0 (Phase 3/4/5 Sprint)  
**Platform Version**: ARTHA v0.1  
**Owner**: BHIV Platform Engineering  
