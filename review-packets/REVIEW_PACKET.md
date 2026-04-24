1. ENTRY POINT
Frontend path: frontend/src/pages/upload/SmartUpload.jsx
Backend path: backend/src/server.js (mounts /api/v1/upload and /api/v1/statements)
User uploads a file from Smart Upload UI; backend routes it into deterministic extraction, reconciliation, and ledger posting.

2. CORE EXECUTION FLOW (ONLY 3 FILES)
- backend/src/services/smartUpload.service.js
  Detects document type, runs one extraction path, and dispatches bank statements vs receipts.
- backend/src/services/bankStatement.service.js
  Parses statement, matches/creates expenses, reconciles transactions, and auto-posts journal entries.
- backend/src/services/ledger.service.js
  Enforces double-entry + hash-chain integrity via createJournalEntry, postJournalEntry, verifyLedgerChain.

3. LIVE FLOW
User action -> Upload CSV/PDF in Smart Upload page and submit.
System flow -> frontend /upload call -> POST /api/v1/upload -> smartUpload.controller -> smartUpload.service -> bankStatement.service (autoReconcile) -> ledger.service (create/post) -> GET /api/v1/ledger/verify-chain.
ONE real JSON response:
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "totalEntries": 45,
    "errors": [],
    "lastHash": "a7f3e2d1c..."
  }
}
```

4. WHAT WAS BUILT
- added: smart upload deterministic routing for mixed documents; bank-statement parse/reconcile pipeline; ledger chain verification endpoint usage in UI/testing flow.
- modified: statement processing now auto-matches invoices/expenses and auto-creates journal entries with hash-chain posting.
- not touched: auth flow, GST/TDS filing modules, user management flows.

5. FAILURE CASES
- Missing upload file -> API returns 400 with "Please upload a file".
- Unsupported file type/oversize -> multer rejects request; API returns 400 error message.
- Password-protected PDF without password -> extraction marks password_required; processing stops until retry with password.
- Parse failure (bad CSV/Excel/PDF) -> statement status becomes failed; processingError stored; no reconciliation run.
- Ledger integrity violation (unbalanced or tampered entry) -> double-entry/hash checks throw; posting/verification returns failure.

6. PROOF
- API output proof source: FINAL_SUBMISSION.md (Usage Examples -> Verify Ledger Integrity output).
- Route + controller proof: backend/src/server.js, backend/src/controllers/smartUpload.controller.js, backend/src/controllers/ledger.controller.js.
- Runtime log proof emitted by pipeline:
  - "Bank statement uploaded: STMT-..."
  - "Bank statement parsed: STMT-... (... transactions)"
  - "Bank statement fully processed: STMT-..."
  - "Ledger chain verification: VALID"
