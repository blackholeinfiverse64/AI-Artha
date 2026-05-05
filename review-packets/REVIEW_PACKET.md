## 1) Frontend Entry Point

- Route: `/dashboard`
- Page file: `frontend/src/pages/dashboard/FinancialIntelligenceDashboard.jsx`
- App routing wiring: `frontend/src/App.jsx`

This dashboard is signal-first and opens as the default authenticated landing screen.

## 2) Component Structure (Max 3 Core Components)

1. `FinancialIntelligenceDashboard`
   - Orchestrates data loading, metric derivation, panel layout, and fallback strategy.
2. `SignalStackPanel`
   - Left panel attention driver; groups and ranks signals by severity and variance.
3. `SignalDetailEngine`
   - Right panel critical action surface; displays reason/recommendation and handles `SEND TO SETU`.

## 3) Signal Rendering Flow

1. Attempt `GET /api/v1/signals` (`api.get('/signals')`) as preferred contract.
2. If unavailable, fallback to `GET /api/v1/signals/snapshot` and map ledger snapshot to structured UI signals.
3. If both fail, use strict structured mock signal objects (same schema as signal contract).
4. Normalize every item to:
   - `signal_type`, `label`, `severity`, `reason`, `recommendation`, `variance_pct`, `planned`, `actual`, `department`, `trend`
5. Render:
   - Top bar: health score, risk level, active issues
   - Left: grouped signal stack (HIGH/MEDIUM/LOW)
   - Center: planned vs actual, variance, trend, breakdown
   - Right: selected signal reason/recommendation + `SEND TO SETU`
   - Bottom: department efficiency summary

## 4) Sample UI -> Signal Mapping

Example signal:

```json
{
  "id": "sig_001",
  "signal_type": "BUDGET_OVERRUN",
  "label": "Marketing spend exceeded plan",
  "severity": "HIGH",
  "reason": "Actual spend is 28% above planned budget this month.",
  "recommendation": "Freeze non-essential campaigns and re-approve by channel ROI.",
  "variance_pct": 28.0,
  "planned": 120000,
  "actual": 153600,
  "department": "Marketing",
  "trend": "up"
}
```

UI impact:
- Top bar: decreases health score, may elevate risk to HIGH, increments active issue count.
- Left panel: shown under HIGH risk with variance badge.
- Center panel: contributes to planned/actual totals and variance bar breakdown.
- Right panel: reason/recommendation shown for decision action.
- Bottom panel: contributes to department efficiency row.

## 5) Failure States (No Data / API Fail)

- Primary endpoint failure (`/signals`) -> fallback to `/signals/snapshot` mapping.
- Snapshot failure -> structured mock signals are loaded.
- Empty payload -> normalized empty state with no crashes.
- Setu dispatch endpoint unavailable -> action is simulated and user receives a success queue toast.

## 6) Proof

- Demo URL options:
  - Vercel: `https://ai-artha.vercel.app`
  - Custom domain: `https://artha.blackholeinfiverse.com`
- Screenshot placeholders:
  - `proof/01-top-bar-health-risk.png`
  - `proof/02-signal-stack-priority.png`
  - `proof/03-signal-engine-send-to-setu.png`
