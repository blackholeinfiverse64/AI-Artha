# REVIEW_PACKET.md

## 1. Entry Point

Input sources:
- OCR flows via bank statement and upload pipelines with `source: "OCR"` or `source: "SYSTEM"`
- Manual finance operations via invoice, expense, ledger APIs with `source: "MANUAL"` or `source: "SYSTEM"`

Every journal now captures:
- `trace_id` (UUID)
- `source` (`OCR | MANUAL | SYSTEM`)
- `auditTrace.steps[]`
- `created_at`

## 2. Flow

Implemented pipeline:
- Input -> Draft: `ledgerService.createJournalEntry()` always creates status `DRAFT`
- Draft -> Validate: `ledgerService.validateJournalEntry()` enforces:
  - Debit = Credit
  - Account existence / active account checks
  - GST split validation (CGST + SGST = 18% and equal split)
  - TDS validation (TDS <= expense)
  - Audit trace completeness
- Validate -> Post: `ledgerService.postJournalEntry()` blocks unvalidated journals with `Cannot post unvalidated entry`
- Post -> Ledger: posting writes immutable `LedgerEntry` records with hash + prev_hash chain
- Ledger -> Signals: `signalEngine.service` computes cash flow and tax signals from `LedgerEntry` only

Strict guard:
- No API/service writes `LedgerEntry` directly except through `ledgerService.writeLedgerEntries()` during posting

## 3. Journal Proof

Validated examples (all balanced = true):

1. Expense Entry
- Dr Rent Expense 10,000
- Cr Cash 10,000

2. Invoice Entry (GST)
- Dr Accounts Receivable 11,800
- Cr Revenue 10,000
- Cr Output CGST 900
- Cr Output SGST 900

3. Payroll Entry (TDS)
- Dr Salary Expense 50,000
- Cr Cash 45,000
- Cr TDS Payable 5,000

Automated proof test file:
- `backend/tests/ca-ledger-proof.test.js`

## 4. GST + TDS

GST accounts ensured in code:
- Input CGST (`2301`)
- Input SGST (`2302`)
- Output CGST (`2311`)
- Output SGST (`2312`)

TDS account ensured in code:
- TDS Payable (`2400` or existing configured code in flows)

Posting patterns:
- Sales (invoice send): AR debit, Revenue credit, Output CGST credit, Output SGST credit
- Purchase/expense: Expense debit, Input CGST debit, Input SGST debit, Cash credit
- Payroll/TDS: Expense debit, Cash credit, TDS Payable credit

## 5. Failure Handling

Rejection and hold rules:
- Unbalanced journal -> rejected in validation (`Journal not balanced`)
- Invalid GST split -> rejected (`Invalid GST split`)
- Invalid TDS (`tds > expense`) -> rejected (`Invalid TDS`)
- Missing accounts / inactive accounts -> rejected
- Missing audit trace metadata -> rejected
- Incomplete journal data -> remains `DRAFT` and returns `incomplete_data`
- Attempt to post draft/unvalidated -> rejected (`Cannot post unvalidated entry`)

## 6. Proof

API log evidence points:
- Draft creation log: `Journal entry created: <entryNumber>`
- Validation log in audit trail: action `VALIDATED`
- Posting log: `Journal entry posted: <entryNumber>` and `ledgerEntries` count

Validation log evidence:
- `validateJournal()` ensures strict debit/credit equality
- `validateGST()` enforces 18% split and equal CGST/SGST
- `validateTDS()` enforces TDS amount upper bound

Ledger verification evidence:
- `/api/v1/ledger/verify-chain` verifies `prev_hash` link continuity and SHA256 hash correctness from `LedgerEntry`
- `/api/v1/ledger/entries/:id/verify-chain` verifies chain segment for a specific journal

Signal evidence:
- `/api/v1/signals/cash-flow` calculates cash flow from ledger entries only
- `/api/v1/signals/snapshot` returns ledger-only cash/GST/TDS signal snapshot
