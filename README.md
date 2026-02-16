# ARTHA v0.1 - Production-Ready Accounting System

[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18+-blue.svg)](https://reactjs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7+-green.svg)](https://www.mongodb.com/)

**ARTHA** is a comprehensive, India-compliant accounting and financial management system built on modern web technologies.

## 🎯 Key Features

### ✅ Core Accounting
- **Double-Entry Ledger**: HMAC-chain verified, tamper-proof ledger system
- **Hash-Chain Verification**: Full ledger integrity checking with entry-by-entry verification
- **Financial Reports**: P&L, Balance Sheet, Cash Flow, Trial Balance, Aged Receivables
- **Dashboard**: Real-time KPIs, balance summaries, recent activities

### ✅ India Compliance
- **GST Integration**:
  - GSTR-1 filing packet (outward supplies)
  - GSTR-3B filing packet (tax summary & reconciliation)
  - IGST / CGST+SGST calculation
  - Filing-ready JSON/CSV export

- **TDS/PF/ESI**: Tax calculation and deduction recording
- **Multi-Year Support**: Multiple financial years

### ✅ Invoice Management
- Invoice lifecycle: Draft → Sent → Partial → Paid → Cancelled
- Automatic journal entry creation
- Tax calculation per line item
- Payment tracking and recording

### ✅ Expense Management
- Expense approval workflow
- **OCR Receipt Scanning**: Extract vendor, date, amount, tax from receipt images
- Automatic expense-to-ledger posting
- Category tracking

### ✅ Production Features
- **Hash-Chain Ledger**: Every entry linked with HMAC-SHA256 for audit trail
- **Redis Caching**: Response caching and session management
- **Docker Deployment**: Multi-container production setup
- **Health Checks**: Liveness, readiness, and detailed health endpoints
- **Backup & Restore**: Automated MongoDB backups with recovery scripts
- **Monitoring**: Real-time system health dashboard

### ✅ Security
- JWT authentication with refresh tokens
- Role-based access control (admin, accountant, user)
- Audit logging for all actions
- Input validation and sanitization
- CORS protection

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
docker exec artha-backend-dev npm run seed
```

4. **Git Commands**:
```bash
git status

git add -A

git commit -m "comment"

git pull origin main && git pull collaborator main

git push origin main && git push collaborator main

```


5. **Access application**:
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

# Dashboard Summary
GET /api/v1/reports/dashboard
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

## API Endpoints (Legacy)

### Authentication (Legacy)
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (requires auth)
- `POST /api/auth/logout` - Logout user

### Authentication (V1)
- `POST /api/v1/auth/register` - Register new user (enhanced)
- `POST /api/v1/auth/login` - Login user (enhanced)
- `GET /api/v1/auth/me` - Get current user (enhanced)
- `POST /api/v1/auth/logout` - Logout user

### Chart of Accounts
- `GET /api/v1/accounts` - Get all accounts with filters
- `GET /api/v1/accounts/:id` - Get single account
- `POST /api/v1/accounts` - Create new account (admin/accountant)
- `PUT /api/v1/accounts/:id` - Update account (admin/accountant)
- `DELETE /api/v1/accounts/:id` - Deactivate account (admin)
- `POST /api/v1/accounts/seed` - Seed default accounts (admin)

### Ledger Management
- `GET /api/v1/ledger/entries` - Get journal entries with filters
- `GET /api/v1/ledger/entries/:id` - Get single journal entry
- `POST /api/v1/ledger/entries` - Create journal entry (admin/accountant)
- `POST /api/v1/ledger/entries/:id/post` - Post journal entry (admin/accountant)
- `POST /api/v1/ledger/entries/:id/void` - Void journal entry (admin/accountant)
- `GET /api/v1/ledger/balances` - Get account balances
- `GET /api/v1/ledger/summary` - Get ledger summary
- `GET /api/v1/ledger/verify` - Verify ledger integrity (admin)

### Legacy Ledger Routes (Backward Compatibility)
- `GET /api/v1/ledger/journal-entries` - Get journal entries (legacy)
- `POST /api/v1/ledger/journal-entries` - Create journal entry (legacy)
- `GET /api/v1/ledger/journal-entries/:id` - Get single journal entry (legacy)
- `POST /api/v1/ledger/journal-entries/:id/post` - Post journal entry (legacy)
- `POST /api/v1/ledger/journal-entries/:id/void` - Void journal entry (legacy)
- `GET /api/v1/ledger/verify-chain` - Verify ledger integrity (legacy)

### Reports
- `GET /api/v1/reports/general-ledger` - Export General Ledger as PDF (admin/accountant)

### Invoices
- `GET /api/v1/invoices` - Get all invoices with filters (admin/accountant/manager)
- `GET /api/v1/invoices/stats` - Get invoice statistics (admin/accountant/manager)
- `GET /api/v1/invoices/:id` - Get single invoice (admin/accountant/manager)
- `POST /api/v1/invoices` - Create new invoice (admin/accountant)
- `PUT /api/v1/invoices/:id` - Update invoice (admin/accountant)
- `POST /api/v1/invoices/:id/send` - Send invoice and create AR entry (admin/accountant)
- `POST /api/v1/invoices/:id/payment` - Record payment for invoice (admin/accountant)
- `POST /api/v1/invoices/:id/cancel` - Cancel invoice (admin/accountant)

### Expenses
- `GET /api/v1/expenses` - Get all expenses with filters (admin/accountant/manager)
- `GET /api/v1/expenses/stats` - Get expense statistics (admin/accountant/manager)
- `GET /api/v1/expenses/:id` - Get single expense (admin/accountant/manager/owner)
- `POST /api/v1/expenses` - Create new expense with receipt uploads (all users)
- `PUT /api/v1/expenses/:id` - Update expense with additional receipts (admin/accountant/owner)
- `POST /api/v1/expenses/:id/approve` - Approve expense (admin/accountant)
- `POST /api/v1/expenses/:id/reject` - Reject expense (admin/accountant)
- `POST /api/v1/expenses/:id/record` - Record expense in ledger (admin/accountant)
- `DELETE /api/v1/expenses/:id/receipts/:receiptId` - Delete receipt (admin/accountant/owner)

### InsightFlow (RL Experience Buffer)
- `POST /api/v1/insightflow/experience` - Log RL experience data (all authenticated users)
- `GET /api/v1/insightflow/experiences` - Get RL experiences with filters (admin)
- `GET /api/v1/insightflow/stats` - Get RL experience statistics (admin)

### Performance Monitoring
- `GET /api/v1/performance/metrics` - Get performance metrics (admin)
- `GET /api/v1/performance/health` - Get performance health status (admin)
- `POST /api/v1/performance/reset` - Reset performance metrics (admin)

### Database Optimization
- `GET /api/v1/database/stats` - Get database statistics (admin)
- `GET /api/v1/database/collections` - Get collection statistics (admin)
- `GET /api/v1/database/indexes` - Get index information (admin)
- `POST /api/v1/database/indexes` - Create all indexes (admin)
- `GET /api/v1/database/optimize` - Get optimization suggestions (admin)

### Health Check
- `GET /health` - Main API health status
- `GET /health/detailed` - Comprehensive system health
- `GET /ready` - Readiness probe (Kubernetes)
- `GET /live` - Liveness probe (Kubernetes)
- `GET /metrics` - Public performance metrics
- `GET /status` - System component status
- `GET /api/health` - Legacy health status
-



## 🏢 Architecture

```
artha/
├── backend/
│   ├── src/
│   │   ├── controllers/    # API controllers
│   │   ├── services/       # Business logic
│   │   ├── models/         # MongoDB schemas
│   │   ├── routes/         # API routes
│   │   ├── middleware/     # Auth, validation, logging
│   │   └── config/         # Configuration
│   ├── tests/              # Test suites
│   ├── scripts/            # Utilities (seed, backup)
│   └── Dockerfile.prod     # Production image
│
├── frontend/
│   ├── src/
│   │   ├── pages/          # Route pages
│   │   ├── components/     # Reusable components
│   │   ├── services/       # API clients
│   │   └── App.jsx         # Main component
│   └── Dockerfile.prod     # Production image
│
├── docs/
│   ├── DEPLOYMENT.md       # Deployment guide
│   └── PRAVAH_DEPLOYMENT.md # Pravah-specific guide
│
└── docker-compose*.yml     # Dev/prod orchestration
```

## 🧪 Testing

### Run all tests:
```bash
./scripts/run-all-tests.sh
```

### Run specific tests:
```bash
npm run test:ledger      # Ledger hash-chain tests
npm run test:ocr         # OCR pipeline tests
npm run test:gst         # GST filing tests
npm run test:all         # Full coverage
```

### Test Coverage:
- Authentication & Authorization (✓)
- Ledger Hash-Chain Verification (✓)
- Invoice Workflow (✓)
- Expense OCR Pipeline (✓)
- GST Filing Packets (✓)
- Financial Reports (✓)
- Health Checks (✓)

## 🔐 Security Checklist

- [x] JWT authentication with refresh tokens
- [x] Role-based access control
- [x] Input validation & sanitization
- [x] HMAC-based ledger tamper-proofing
- [x] Audit logging for all actions
- [x] Rate limiting
- [x] CORS protection
- [x] Helmet security headers
- [x] Non-root Docker containers
- [x] Secrets management (env-based)

## 📈 Production Readiness

- [x] Multi-container Docker setup
- [x] MongoDB replica set support
- [x] Redis caching layer
- [x] Load balancing ready
- [x] Health check endpoints
- [x] Automated backups
- [x] Comprehensive logging
- [x] Error handling
- [x] Database indexing optimization
- [x] Performance monitoring

## 📏 Features Added in Completion Sprint

### Day 1: Ledger Hash-Chain Hardening ✅
- Full HMAC-SHA256 hash-chain implementation
- Entry-by-entry verification
- Chain segment audit queries
- Tamper detection

### Day 2: Expense OCR Pipeline ✅
- Receipt image processing
- Vendor, date, amount extraction
- Confidence scoring
- Fallback to mock OCR (development)
- Integration with expense creation

### Day 3: GST Filing Packets ✅
- GSTR-1 generation (outward supplies)
- GSTR-3B generation (tax summary)
- CSV export functionality
- Period-based filing packets

### Day 4: CI/CD & Pravah Documentation ✅
- Complete Pravah deployment guide
- Build → Test → Deploy → Verify pipeline
- Secrets management guide
- Health check configuration

### Day 5-6: Testing & Frontend UX ✅
- Full integration test suite
- Ledger integrity status widget
- GST summary & export component
- OCR receipt scanning UI

### Day 7: Polish & Submission ✅
- Comprehensive README
- Test execution scripts
- Documentation review
- Final code quality checks

## 📆 Documentation

- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Full production deployment guide
- **[docs/PRAVAH_DEPLOYMENT.md](docs/PRAVAH_DEPLOYMENT.md)** - Pravah platform setup
- **[API Documentation](#-api-documentation)** - REST API reference
- **[Architecture](#-architecture)** - System design

## 🐛 Troubleshooting

### MongoDB connection issues
```bash
docker-compose -f docker-compose.dev.yml logs mongodb
docker exec artha-mongo-dev mongosh --eval "rs.status()"
```

### Backend won't start
```bash
docker logs artha-backend-dev --tail 100
# Check .env variables are set correctly
```

### Frontend blank/not loading
```bash
# Check browser console for errors
# Verify API URL in .env
# Check CORS settings
```

## 📄 License

Proprietary - BHIV Inc.

## 👥 Team

- **Nilesh** - Architecture & Coordination
- **Ishan** - InsightFlow & Compliance Alignment
- **Akash** - APIs & OCR Integration
- **You** - Full Stack Development

## 📞 Support

For issues and support:
- Create an issue on GitHub
- Email: support@artha.bhiv.in

---

**Last Updated**: December 5, 2025
**Status**: Production Ready v0.1#   A I - A r t h a 
 
 