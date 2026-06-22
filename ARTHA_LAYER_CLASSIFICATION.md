# ARTHA Layer Classification

## Classification Matrix

| Layer | Component | Authority | Dependencies | Failure Impact |
|-------|-----------|-----------|--------------|----------------|
| **Transaction** | Invoice Service | Business | None | Revenue loss |
| **Transaction** | Expense Service | Business | None | Expense tracking loss |
| **Transaction** | Banking Service | Financial | Ledger, Audit | Payment failures |
| **Ledger** | Ledger Service | Accounting | Chart of Accounts | Accounting integrity loss |
| **Ledger** | Journal Engine | Accounting | None | Double-entry failure |
| **Compliance** | GST Service | Regulatory | Invoice, Ledger | Filing failures |
| **Compliance** | TDS Service | Regulatory | Expense, Ledger | TDS non-compliance |
| **Audit** | Audit Service | Legal | None | Compliance risk |
| **Audit** | Evidence Service | Operational | Runtime Proof | Proof generation loss |
| **Integration** | TANTRA Service | Ecosystem | None | Ecosystem disconnect |
| **Integration** | SETU Pipeline | Government | Compliance | Filing dispatch failure |
| **Integration** | Tally Service | Business | Chart, Journal | Migration failure |
| **Observability** | Health Service | Operations | All components | Monitoring blind spot |
| **Observability** | Metrics Service | Operations | None | Metrics loss |

## Upstream Systems
- User Input (Invoices, Expenses, Payments)
- Bank Statements (CSV upload)
- Tally (Import/Export)
- SETU (Government filings)
- TANTRA (Runtime events)

## Downstream Systems
- MongoDB (Data persistence)
- Redis (Caching)
- SETU (Filing dispatch)
- TANTRA (Event emission)
- PDF Generation (Reports)

## Authority Boundaries
1. **Financial**: Ledger Service controls all financial integrity
2. **Compliance**: GST/TDS services control regulatory filings
3. **Audit**: Audit Service controls immutable logging
4. **Operational**: Observability controls health monitoring
5. **Ecosystem**: TANTRA controls runtime participation
