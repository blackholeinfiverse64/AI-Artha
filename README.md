# ARTHA v0.1 - Production-Ready Accounting System

[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18+-blue.svg)](https://reactjs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7+-green.svg)](https://www.mongodb.com/)
[![Integrity](https://img.shields.io/badge/Integrity-Verified-brightgreen.svg)]()

**ARTHA** is a comprehensive, India-compliant accounting and financial management system built on modern web technologies with full double-entry bookkeeping integrity.

## 🎯 Key Features

### ✅ Core Accounting
- **Double-Entry Ledger**: HMAC-chain verified, tamper-proof ledger system with Decimal.js precision
- **Hash-Chain Verification**: Full ledger integrity checking with entry-by-entry verification
- **Financial Reports**: P&L with monthly trends, Balance Sheet, Cash Flow, Trial Balance, Aged Receivables
- **Dashboard**: Real-time KPIs with Revenue vs Expenses charts and Expense Breakdown
- **Chart of Accounts**: 33 pre-configured accounts following Indian accounting standards
- **Account Balances**: Real-time balance calculation from posted journal entries

### ✅ India Compliance
- **GST Integration**:
  - Real-time GST dashboard with 6-month trends
  - GSTR-1 filing packet (outward supplies)
  - GSTR-3B filing packet (tax summary & reconciliation)
  - IGST / CGST+SGST calculation
  - B2B/B2C categorization
  - Filing-ready JSON/CSV export
  - Quarterly due date tracking

- **TDS Management**:
  - Section-wise tracking (194A, 194C, 194H, 194I, 194J, 192, 194Q)
  - Quarterly dashboard with Form 24Q/26Q/27Q status
  - Automatic journal entry creation on deduction
  - Challan recording and reconciliation
  - Status workflow: Pending → Deducted → Deposited → Filed

- **Multi-Year Support**: Multiple financial years with FY-based reporting

### ✅ Invoice Management
- Invoice lifecycle: Draft → Sent → Partial → Paid → Cancelled
- Automatic journal entry creation on send:
  - DR Accounts Receivable (1100)
  - CR Revenue (4000)
  - CR GST Payable (2200)
- Payment recording with automatic journal entries:
  - DR Cash/Bank (1010)
  - CR Accounts Receivable (1100)
- Tax calculation per line item with IGST/CGST+SGST support
- Payment tracking with partial payment support
- Customer GSTIN validation for B2B transactions

### ✅ Expense Management
- Expense approval workflow: Pending → Approved → Recorded → Rejected
- **OCR Receipt Scanning**: Extract vendor, date, amount, tax from receipt images
- Automatic expense-to-ledger posting:
  - DR Expense Account (6xxx)
  - CR Cash/Bank (1010)
- Category tracking with real-time breakdown charts
- Multi-receipt upload support
- Input GST credit tracking

### ✅ Production Features
- **Hash-Chain Ledger**: Every entry linked with HMAC-SHA256 for audit trail
- **Accounting Integrity**: Verified double-entry system (Debits = Credits)
- **Real-time Calculations**: All reports calculated from posted journal entries
- **Redis Caching**: Response caching and session management
- **Docker Deployment**: Multi-container production setup
- **Health Checks**: Liveness, readiness, and detailed health endpoints
- **Backup & Restore**: Automated MongoDB backups with recovery scripts
- **Monitoring**: Real-time system health dashboard
- **Performance Optimization**: Database indexing and query optimization

### ✅ Security
- JWT authentication with refresh tokens
- Role-based access control (admin, accountant, user, viewer)
- Audit logging for all actions
- Input validation and sanitization
- CORS protection
- Helmet security headers
- Rate limiting
- Non-root Docker containers

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- MongoDB 7+
- Redis 7+

### Development Setup

1. **Clone repository**:
```bash
git clone <repo-url>
cd artha
```

2. **Setup environment**:
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

3. **Start development stack**:
```bash
docker-compose -f docker-compose.dev.yml up -d
```

4. **Seed database**:
```bash
cd backend
node scripts/seed.js
node scripts/seed-tds.js
```

5. **Verify integrity**:
```bash
node scripts/verify-integrity.js
```

6. **Git Commands**:
```bash
git status
git add -A
git commit -m "your message"
git pull origin main && git pull collaborator main
git push origin main && git push collaborator main
```

7. **Access application**:
- Frontend: http://localhost:5173
- Backend API: http://localhost:5000
- Adminer: http://localhost:8080

### Production Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions.

For Pravah deployment, see [docs/PRAVAH_DEPLOYMENT.md](docs/PRAVAH_DEPLOYMENT.md).

## 📊 API Documentation

### Authentication
```bash
# Register
POST /api/v1/auth/register
Body: { email, password, name }

# Login
POST /api/v1/auth/login
Body: { email, password }

# Refresh Token
POST /api/v1/auth/refresh
Body: { refreshToken }
```

### Ledger
```bash
# Get all entries
GET /api/v1/ledger/entries

# Create entry
POST /api/v1/ledger/entries
Body: { date, description, lines }

# Verify chain integrity
GET /api/v1/ledger/verify-chain

# Verify single entry
GET /api/v1/ledger/entries/:id/verify

# Get chain segment
GET /api/v1/ledger/chain-segment?startPosition=0&endPosition=100
```

### Invoices
```bash
# Get all invoices
GET /api/v1/invoices

# Create invoice
POST /api/v1/invoices
Body: { invoiceDate, dueDate, customerName, lines }

# Send invoice
POST /api/v1/invoices/:id/send

# Record payment
POST /api/v1/invoices/:id/payment
Body: { amount, paymentMethod, reference }
```

### Expenses
```bash
# Get all expenses
GET /api/v1/expenses

# Create expense
POST /api/v1/expenses
Body: { date, vendor, category, amount, taxAmount }

# Process OCR
POST /api/v1/expenses/ocr
Body: FormData with receipt file

# Approve expense
POST /api/v1/expenses/:id/approve

# Record expense
POST /api/v1/expenses/:id/record
```

### GST Filing
```bash
# Get GST summary
GET /api/v1/gst/summary?period=2025-02

# Get GSTR-1 packet
GET /api/v1/gst/filing-packet/gstr-1?period=2025-02

# Get GSTR-3B packet
GET /api/v1/gst/filing-packet/gstr-3b?period=2025-02

# Export filing packet
GET /api/v1/gst/filing-packet/export?type=gstr-1&period=2025-02
```

### TDS Management
```bash
# Get TDS Dashboard
GET /api/v1/tds/dashboard?quarter=Q4&financialYear=FY2025-26

# Get TDS Entries
GET /api/v1/tds/entries?quarter=Q4&financialYear=FY2025-26

# Create TDS Entry
POST /api/v1/tds/entries
Body: { deductee: { name, pan }, section, paymentAmount, tdsRate }

# Record TDS Deduction
POST /api/v1/tds/entries/:id/deduct

# Record Challan
POST /api/v1/tds/entries/:id/challan
Body: { challanNumber, challanDate, bankBSR }

# Generate Form 26Q
GET /api/v1/tds/form26q?quarter=Q4&financialYear=FY2025-26

# Calculate TDS
POST /api/v1/tds/calculate
Body: { amount, section, customRate }
```

### Reports
```bash
# Profit & Loss
GET /api/v1/reports/profit-loss?startDate=2025-01-01&endDate=2025-12-31

# Balance Sheet
GET /api/v1/reports/balance-sheet?asOfDate=2025-12-31

# Cash Flow
GET /api/v1/reports/cash-flow?startDate=2025-01-01&endDate=2025-12-31

# Trial Balance
GET /api/v1/reports/trial-balance?asOfDate=2025-12-31

# Aged Receivables
GET /api/v1/reports/aged-receivables?asOfDate=2025-12-31

# Dashboard Summary
GET /api/v1/reports/dashboard

# Revenue vs Expenses Chart
GET /api/v1/reports/revenue-expenses-chart?year=2025

# Expense Breakdown
GET /api/v1/reports/expense-breakdown?startDate=2025-01-01&endDate=2025-12-31
```

### Health & Monitoring
```bash
# Basic health
GET /health

# Detailed health
GET /health/detailed

# Readiness probe
GET /ready

# Liveness probe
GET /live
```

## 🔄 Data Flow & Integrity

### Invoice Workflow
1. **Create Invoice (Draft)**: No accounting impact
2. **Send Invoice**: Creates journal entry
   - DR Accounts Receivable (1100): ₹Total Amount
   - CR Revenue (4000): ₹Subtotal
   - CR GST Payable (2200): ₹Tax Amount
3. **Record Payment**: Creates journal entry
   - DR Cash/Bank (1010): ₹Payment Amount
   - CR Accounts Receivable (1100): ₹Payment Amount
4. **Status Updates**: Draft → Sent → Partial → Paid

### Expense Workflow
1. **Create Expense**: Status = Pending
2. **Approve Expense**: Status = Approved
3. **Record Expense**: Creates journal entry
   - DR Expense Account (6xxx): ₹Total Amount
   - CR Cash/Bank (1010): ₹Total Amount
4. **Status**: Pending → Approved → Recorded

### TDS Workflow
1. **Create TDS Entry**: Status = Pending
2. **Record Deduction**: Creates journal entry
   - DR Expense Account: ₹Payment Amount
   - CR TDS Payable (2300): ₹TDS Amount
   - CR Cash/Bank: ₹Net Payable
3. **Record Challan**: Status = Deposited
4. **File Return**: Status = Filed

### GST Calculation
- **Output GST**: Sum of taxAmount from sent/paid invoices
- **Input GST**: Sum of taxAmount from recorded expenses
- **Net Payable**: Output GST - Input GST
- **B2B/B2C**: Categorized by customer GSTIN presence

### Report Generation
- **Balance Sheet**: Real-time from account balances (Assets = Liabilities + Equity)
- **P&L Statement**: Real-time from Income/Expense accounts
- **Trial Balance**: All accounts with debit/credit totals (must balance)
- **Aged Receivables**: From unpaid/partial invoices with aging buckets
- **Cash Flow**: Categorized by Operating/Investing/Financing activities

## ✅ Integrity Verification

Run the integrity verification script:
```bash
cd backend
node scripts/verify-integrity.js
```

This verifies:
- ✓ All sent invoices have journal entries
- ✓ All paid invoices have payment entries
- ✓ Accounting equation: Debits = Credits
- ✓ Account balances match journal entries
- ✓ GST calculations match invoice data
- ✓ Reports pull from real-time data

## 🏗️ Architecture

### Backend Stack
- **Node.js 18+** with Express.js
- **MongoDB 7+** with Mongoose ODM
- **Redis 7+** for caching
- **Decimal.js** for precise financial calculations
- **HMAC-SHA256** for ledger hash-chain
- **JWT** for authentication

### Frontend Stack
- **React 18+** with Vite
- **Recharts** for data visualization
- **Tailwind CSS** for styling
- **React Router** for navigation
- **Axios** for API calls

### Database Models (11)
1. User
2. ChartOfAccounts
3. JournalEntry
4. AccountBalance
5. Invoice
6. Expense
7. TDSEntry
8. AuditLog
9. Settings
10. FinancialYear
11. InsightFlowExperience

### Key Services (20+)
- Authentication Service
- Ledger Service
- Invoice Service
- Expense Service
- TDS Service
- GST Filing Service
- Financial Reports Service
- Export Service
- Health Service
- Performance Service

## 📊 Sample Data

After seeding, you'll have:
- **33 Chart of Accounts** (Assets, Liabilities, Equity, Income, Expenses)
- **Sample Invoices** with automatic journal entries
- **Sample Expenses** with approval workflow
- **6 TDS Entries** (Q4 FY2025-26)
- **Posted Journal Entries** maintaining double-entry integrity

## 🧪 Testing

```bash
# Run all tests
npm run test

# Run specific tests
npm run test:ledger
npm run test:invoice
npm run test:gst
```

## 📝 License

Proprietary - BHIV Inc.

## 👥 Contributors

- **Nilesh** - Architecture & Coordination
- **Ishan** - InsightFlow & Compliance
- **Akash** - APIs & Integration
- **Development Team** - Full Stack Implementation

## 📞 Support

For issues and support:
- Create an issue on GitHub
- Email: support@artha.bhiv.in

---

**Last Updated**: February 19, 2025  
**Version**: 0.1  
**Status**: Production Ready ✓  
**Integrity**: Verified ✓
