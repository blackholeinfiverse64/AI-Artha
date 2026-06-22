# ARTHA Ecosystem Map

## System Overview
ARTHA v0.1 is a production-ready, India-compliant accounting system participating in the BHIV TANTRA ecosystem.

## Ecosystem Layers

### Layer 1: Transaction Processing
- **Invoice Management**: Draft → Sent → Partial → Paid lifecycle with auto-journal
- **Expense Management**: Draft → Approved → Recorded with OCR support
- **Banking**: NEFT/RTGS/UPI/IMPS payments with retry and failure recovery
- **TDS**: Deduction → Deposit → Filing workflow

### Layer 2: Ledger & Accounting
- **Double-Entry Ledger**: HMAC-SHA256 hash-chain verified, tamper-proof
- **Chart of Accounts**: 33+ pre-configured Indian accounts
- **Account Balances**: Real-time calculation from posted journal entries
- **Financial Reports**: P&L, Balance Sheet, Cash Flow, Trial Balance, Aged Receivables

### Layer 3: Compliance
- **GST Integration**: GSTR-1, GSTR-3B filing with CGST/SGST/IGST
- **TDS Management**: Section-wise tracking (194A-206AB)
- **Compliance Signals**: 46 signal types for monitoring
- **Filing Pipeline**: Validation → Generation → SETU dispatch

### Layer 4: Audit & Evidence
- **Immutable Audit Trail**: Hash-chain verified audit events
- **Runtime Proof**: API responses, DB states, chain verification captured
- **Unified Trace**: End-to-end lineage for every transaction
- **CA Workflow**: Month/Quarter/Annual close procedures

### Layer 5: Integration
- **TANTRA Runtime**: Health, events, lifecycle participation
- **SETU Pipeline**: Government integration with acknowledgement/retries
- **Tally Compatibility**: Import/Export vouchers, masters, opening balances
- **Multi-Company**: Consolidated reporting, branch accounting

### Layer 6: Observability
- **Health Endpoints**: Liveness, readiness, detailed health
- **Metrics**: Prometheus-compatible metrics
- **Dashboard**: Real-time system health visualization
- **Evidence Automation**: Auto-generated runtime evidence

## Data Flow
```
Transaction → Journal Entry → Ledger Entry → Hash Chain → Audit Event → Runtime Proof
     ↓              ↓              ↓              ↓              ↓              ↓
  Trace Init    Validation    Balance Update   Integrity    Immutable Log   Evidence
```

## Service Dependencies
- **Ledger Service** → Chart of Accounts, Account Balance, Journal Entry, Ledger Entry
- **Invoice Service** → Ledger Service, GST Engine
- **Expense Service** → Ledger Service, GST Engine
- **Banking Service** → Ledger Service, Audit Service, Traceability
- **CA Workflow Service** → Ledger Service, Financial Period, Audit Service
- **Tally Service** → Chart of Accounts, Journal Entry, Invoice, Expense
- **Multi-Company Service** → Company, Chart of Accounts, Account Balance
- **TANTRA Service** → Unified Trace, Runtime Proof, Compliance Signal
- **Observability Service** → All models for health checks
- **Evidence Service** → Runtime Proof, Unified Trace

## External Integrations
- **SETU**: Government compliance dispatch
- **TANTRA**: Runtime ecosystem participation
- **Tally**: Accounting software interoperability
- **Payment Gateways**: NEFT/RTGS/UPI/IMPS processing
