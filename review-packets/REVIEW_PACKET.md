# REVIEW_PACKET.md — Signal Dashboard · Full Implementation

**Submission:** Ashmit — Frontend Intelligence Surface
**Date:** 28/05/2026
**Folder:** `review-packets/REVIEW_PACKET.md`

---

## 1. ENTRY POINT

**Primary page (new):**
```
frontend/src/pages/compliance/SignalDashboard.jsx
```
Route: `/signals`
Auth: requires Bearer JWT + role admin or accountant

**Secondary page (existing, enhanced):**
```
frontend/src/pages/dashboard/FinancialIntelligenceDashboard.jsx
```
Route: `/dashboard`

---

## 2. CORE EXECUTION FLOW (3 files)

```
SignalDashboard.jsx
  │
  ├── useRuntimeMode.js
  │     GET /health (5s timeout, no auth)
  │     GET /api/v1/signals/snapshot (5s timeout, with auth)
  │     → BACKEND_CONNECTED | BACKEND_DEGRADED | BACKEND_UNAVAILABLE | MOCK_MODE
  │
  ├── useSignals.js
  │     Attempt 1: GET /api/v1/signals?limit=50
  │     Attempt 2: GET /api/v1/signals/snapshot
  │     On both fail: sets error state with exact URL + HTTP status
  │
  └── SignalDetailEngine.jsx
        POST /api/v1/signals/:signalId/dispatch
        → pipeline: normalize → validate → map → serialize → HTTP dispatch
        → returns: dispatch_attempted, payload, setu_status, failure_reason
```

---

## 3. LIVE FLOW (actual execution)

### Happy path — backend connected, signals exist, SETU disabled

```
1.  useRuntimeMode: GET /health → 200 OK
2.  useRuntimeMode: GET /signals/snapshot → 200 OK
3.  mode = BACKEND_CONNECTED
4.  RuntimeModeBanner: "● LIVE BACKEND SIGNALS"
5.  useSignals: GET /signals?limit=50 → ComplianceSignal[]
6.  mapDbSignal() maps each record to display shape
7.  SignalCard list renders grouped by severity filter
8.  User clicks signal → SignalDetailEngine shows type, recommendation
9.  User clicks "SEND TO SETU":
      POST /api/v1/signals/:signalId/dispatch
      Backend: runPipeline() → normalize → validate → map → serialize
      SETU_ENABLED=false → dispatch_attempted=false
      UI: "PIPELINE VALIDATED — SETU NOT CONFIGURED"
      Payload shown in collapsible details
10. User clicks "Show Trace Chain":
      GET /api/v1/signals/trace/:traceId
      5-step chain: Signal → Validation → Filing → JournalEntries → LedgerEntries
11. ComplianceVisibilityLayer:
      GET /api/v1/gst/summary?period=YYYY-MM → GST metrics
      GET /api/v1/tds/dashboard?quarter=Qx&financialYear=FYxx → TDS metrics
```

### SETU configured and reachable

```
POST /api/v1/signals/:signalId/dispatch
Backend: axios.post(SETU_BASE_URL/api/v1/signals/ingest, payload, {timeout})
→ 200 OK from SETU
UI: "SETU DISPATCH CONFIRMED" + dispatched_at + HTTP status
```

### SETU configured but unreachable (ECONNREFUSED / timeout)

```
POST /api/v1/signals/:signalId/dispatch
Backend: axios throws ECONNREFUSED or ECONNABORTED
→ 502 response: { failure_reason: "SETU_UNREACHABLE" | "SETU_TIMEOUT", failure_message, payload }
UI: "SETU DISPATCH FAILED" with failure_reason + message
    OR "SETU UNAVAILABLE — REQUEST TIMED OUT" with payload shown
```

### Degraded path — health OK, signals endpoint fails

```
1. useRuntimeMode: GET /health → 200 OK
2. useRuntimeMode: GET /signals/snapshot → 500 or timeout
3. mode = BACKEND_DEGRADED
4. RuntimeModeBanner: "● SNAPSHOT FALLBACK ACTIVE"
5. useSignals: GET /signals → fails
6. useSignals: GET /signals/snapshot → fails
7. error state set → "SIGNAL FETCH FAILED" banner with exact URL + HTTP status
8. Empty signal list shown with Refresh button
```

### Backend unavailable

```
1. useRuntimeMode: GET /health → ECONNREFUSED / timeout
2. mode = BACKEND_UNAVAILABLE
3. RuntimeModeBanner: "● BACKEND UNAVAILABLE"
4. Full-page: WifiOff icon + "Backend Unavailable" + "Retry Connection" button
5. No signals fetched. No mock data shown. No crash.
```

---

## 4. WHAT WAS BUILT

### Phase 1A — Backend Contract Verification ✅

- `useSignals.js`: calls real `GET /api/v1/signals` then `GET /api/v1/signals/snapshot`
- `useComplianceSnapshot.js`: calls real `GET /api/v1/gst/summary` and `GET /api/v1/tds/dashboard`
- Raw payload exposed in "raw payload" collapsible on both dashboard and signal page
- Response schema mapped: DB `ComplianceSignal` shape → display shape via `mapDbSignal()`
- Snapshot shape → display signals via `mapSnapshotToSignals()`

### Phase 1B — Production Mode Hardening ✅

- `useRuntimeMode.js`: 4 explicit states — `BACKEND_CONNECTED`, `BACKEND_DEGRADED`, `BACKEND_UNAVAILABLE`, `MOCK_MODE`
- `RuntimeModeBanner.jsx`: always visible, colored dot + label, recheck button, last-checked time
- `MOCK_MODE` only activates when `VITE_MOCK_MODE=true` in `.env` — never silent
- No mock data array used in any production code path

### Phase 1C — Signal Trace Proof ✅

- `SignalTracePanel.jsx`: calls `GET /api/v1/signals/trace/:traceId`
- Shows 5-step chain: Signal → Compliance Validation → Compliance Filing → Journal Entries → Ledger Entries
- Each step collapsible with raw JSON
- Snapshot-derived signals (no `trace_id`): explicit message "snapshot-derived signal"
- Trace toggle button on `SignalDashboard.jsx` per selected signal

### Phase 2A — SETU Dispatch Runtime Proof ✅

**Backend:** `POST /api/v1/signals/:signalId/dispatch` (new endpoint)
- Runs full pipeline: normalize → validate → map → serialize
- If `SETU_ENABLED=false`: returns `dispatch_attempted=false` + full payload proof
- If SETU reachable: real `axios.post()` to `SETU_BASE_URL/api/v1/signals/ingest`
- If SETU unreachable: `502` with `failure_reason: SETU_UNREACHABLE | SETU_TIMEOUT | SETU_ERROR`
- If pipeline fails: `422` with `pipeline_stage` + `pipeline_error`

**Frontend:** `SignalDetailEngine.jsx`
- Calls `POST /signals/:signalId/dispatch` — not a dry-run, real dispatch attempt
- 4 explicit dispatch states: `IDLE → DISPATCHING → SUCCESS | FAILED | TIMEOUT`
- `SUCCESS (not_dispatched)`: "PIPELINE VALIDATED — SETU NOT CONFIGURED" + payload collapsible
- `SUCCESS (dispatched)`: "SETU DISPATCH CONFIRMED" + dispatched_at + HTTP status
- `FAILED (422)`: "SETU DISPATCH FAILED" + pipeline stage + error
- `FAILED (502)`: "SETU DISPATCH FAILED" + failure_reason + message + payload
- `TIMEOUT`: "SETU UNAVAILABLE — REQUEST TIMED OUT" + payload attempted
- Snapshot-derived signals: explicit error "no signal_id — cannot dispatch"

### Phase 2B — Compliance Visibility Layer ✅

- `ComplianceVisibilityLayer.jsx`: real backend data only, no hardcoded metrics
- GST: output tax, input credit, net payable, CGST/SGST/IGST breakdown
- TDS: total deducted, pending payment, pending count, quarter/FY
- Filing readiness indicator derived from TDS `byStatus.filed` and `pendingCount`
- Risk surface: warns when GST net payable > ₹1L or TDS pending > ₹50K
- Error surface: shows exact backend error message when endpoint fails
- Refresh button on compliance panel

### Phase 2C — Failure Simulation Matrix ✅

`FailureSimulator` component in `SignalDashboard.jsx` — collapsible panel with 4 deterministic tests:

| Test | What it does | Expected result |
|------|-------------|-----------------|
| `empty_payload` | Checks if signals array is empty | Reports empty state renders correctly |
| `invalid_schema` | Runs `mapDbSignal()` on signal with no severity | Confirms default to `LOW`, no crash |
| `setu_unavailable` | Calls `POST /dispatch` on first signal | Reports `dispatch_attempted=false` (SETU disabled) or exact failure |
| `partial_response` | Calls `GET /signals/snapshot` | Reports which fields are present/missing |

Each test reports: `HANDLED CORRECTLY` (green) or `UNEXPECTED BEHAVIOR` (red) with exact message.

---

## 5. FAILURE CASES

### F1 — Backend not running
- `useRuntimeMode` GET /health → ECONNREFUSED
- `mode = BACKEND_UNAVAILABLE`
- Full-page: WifiOff + "Backend Unavailable" + "Retry Connection"
- No data fetched. No mock shown. No crash.

### F2 — Signals endpoint returns empty array
- `useSignals` GET /signals → `{ data: [] }`
- Falls through to snapshot attempt
- If snapshot also empty: `signals = []`, source = `EMPTY`
- Empty state renders with "No signals in database yet" + Refresh

### F3 — Signal missing severity field
- `mapDbSignal()` checks `SEV_ORDER.includes(sig.severity)` → defaults to `'LOW'`
- Signal renders with LOW badge — no crash, no hidden failure

### F4 — SETU pipeline validation fails (422)
- `DispatchResult FAILED` renders with `stage: VALIDATE` + error list
- Toast: "SETU pipeline failed: [error]"
- No fake success

### F5 — SETU unreachable (502)
- `DispatchResult FAILED` or `TIMEOUT` renders with exact `failure_reason`
- Payload that was attempted shown in collapsible
- No fake success

### F6 — Compliance endpoints return 500
- `useComplianceSnapshot` catches error, sets `errors.gst` or `errors.tds`
- `ErrorSurface` renders with exact message: "[GST/TDS] UNAVAILABLE — [message]"
- Other compliance data still renders if available

### F7 — Snapshot-derived signal dispatched to SETU
- `signal_id` is null → immediate FAILED state
- Message: "no signal_id — snapshot-derived signal cannot be dispatched"

### F8 — Trace reconstruction finds no chain
- `SignalTracePanel` calls `GET /signals/trace/:traceId`
- If 404 or empty steps: "No chain data found for this trace_id"
- No crash

---

## 6. FILES CREATED / MODIFIED

### New files
| File | Purpose |
|------|---------|
| `frontend/src/pages/compliance/SignalDashboard.jsx` | Dedicated signal page at `/signals` |
| `frontend/src/hooks/useRuntimeMode.js` | Runtime mode detection (4 states) |
| `frontend/src/hooks/useSignals.js` | Real signal fetching, no mock |
| `frontend/src/hooks/useComplianceSnapshot.js` | Real GST + TDS fetching |
| `frontend/src/components/intelligence/RuntimeModeBanner.jsx` | Visible mode declaration |
| `frontend/src/components/intelligence/SignalTracePanel.jsx` | 5-step trace reconstruction |
| `frontend/src/components/intelligence/ComplianceVisibilityLayer.jsx` | GST + TDS widgets |
| `frontend/src/components/intelligence/SignalDetailEngine.jsx` | SETU dispatch proof |
| `frontend/src/components/intelligence/SignalStackPanel.jsx` | Signal list grouped by severity |

### Modified files
| File | Change |
|------|--------|
| `backend/src/controllers/signal.controller.js` | Added `dispatchSignal` — real SETU HTTP dispatch |
| `backend/src/routes/signal.routes.js` | Added `POST /:signalId/dispatch` route |
| `frontend/src/App.jsx` | Added `/signals` route → `SignalDashboard` |
| `frontend/src/components/layout/Sidebar.jsx` | Added "Signals" nav item with `Radio` icon |

### Unchanged (core integrity preserved)
All existing routes, controllers, services, models, and middleware are untouched.

---

## 7. API ENDPOINTS CONSUMED

| Endpoint | Phase | Purpose |
|----------|-------|---------|
| `GET /health` | 1B | Runtime mode check |
| `GET /api/v1/signals?limit=50` | 1A | Live signal list |
| `GET /api/v1/signals/snapshot` | 1A | Ledger snapshot fallback |
| `GET /api/v1/signals/trace/:traceId` | 1C | Chain reconstruction |
| `GET /api/v1/signals/:signalId/pipeline-check` | 2A | Dry-run validation |
| `POST /api/v1/signals/:signalId/dispatch` | 2A | Real SETU dispatch |
| `GET /api/v1/gst/summary?period=YYYY-MM` | 2B | GST compliance snapshot |
| `GET /api/v1/tds/dashboard?quarter=Qx&financialYear=FYxx` | 2B | TDS compliance snapshot |

---

## 8. SETU PAYLOAD EXAMPLE

From `POST /api/v1/signals/:signalId/dispatch` when `SETU_ENABLED=false`:

```json
{
  "success": true,
  "dispatch_attempted": false,
  "setu_enabled": false,
  "reason": "SETU_ENABLED is false — set SETU_ENABLED=true to enable dispatch",
  "pipeline_stage": "COMPLETE",
  "payload": {
    "signal_id": "SIG_FILING_NOT_READY",
    "trace_id": "TRC-20260528-a1b2c3d4",
    "source": {
      "system": "ARTHA",
      "module": "COMPLIANCE_FILING",
      "entity_type": "COMPLIANCE_FILING",
      "entity_id": "FIL-abc123"
    },
    "severity": "HIGH",
    "timestamp": "2026-05-28T10:00:00.000Z",
    "context": {
      "filing_id": "FIL-abc123",
      "filing_type": "GSTR-1",
      "error_count": 2
    },
    "recommendation": {
      "code": "RESOLVE_FILING_ERRORS",
      "message": "Compliance filing has validation errors and is not ready for submission."
    }
  },
  "headers": {
    "Content-Type": "application/json",
    "X-Artha-Trace": "TRC-20260528-a1b2c3d4",
    "X-Signal-Type": "SIG_FILING_NOT_READY",
    "X-Severity": "HIGH"
  },
  "warnings": []
}
```

---

## 9. RUNTIME MODE STATES (visible in UI)

```
● LIVE BACKEND SIGNALS          — green dot, success colors
● SNAPSHOT FALLBACK ACTIVE      — amber dot, warning colors
● BACKEND UNAVAILABLE           — red dot, destructive colors
● MOCK DEVELOPMENT MODE         — purple dot, secondary colors
● CHECKING CONNECTION           — grey dot, pulsing
```

All states declared via `RuntimeModeBanner` — always rendered, never hidden.
