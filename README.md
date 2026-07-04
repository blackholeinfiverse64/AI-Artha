# AI Content Platform - Phase IV

TANTRA ecosystem participant with platform contracts, trace propagation, observability, and MongoDB backend.

## Quick Start

```bash
git clone https://github.com/blackholeinfiverse54-creator/AI_Content_Platform_T41.git
cd AI_Content_Platform_T41
pip install -r requirements.txt
cp .env.example .env   # edit with your MongoDB URI and JWT secret
python -m uvicorn app.main:app --host 127.0.0.1 --port 9000
```

Server: http://localhost:9000 | Docs: http://localhost:9000/docs

Demo login: `demo` / `demo1234`

## Architecture

```
Client Request
    |
TracePropagationMiddleware (injects X-Trace-ID, X-Schema-Version)
    |
FastAPI App
    |-- Auth Layer (JWT)
    |-- Rate Limiting (in-memory)
    |-- Input Validation
    |
    +-- Routes (71 endpoints)
    |   |-- /users/*       Authentication
    |   |-- /upload        Content upload
    |   |-- /contents      Content listing
    |   |-- /content/{id}  Content details
    |   |-- /download/{id} File download
    |   |-- /stream/{id}   Video streaming
    |   |-- /feedback      Content feedback
    |   |-- /generate-video Video generation
    |   |-- /analytics     AI analytics
    |   |-- /cdn/*         CDN file management
    |   |-- /metrics/*     Performance metrics
    |   |-- /platform/*    TANTRA platform layer
    |   |-- /observability/* Runtime observability
    |   +-- /bucket-validation/* Write/read verification
    |
    +-- MongoDB (9 collections)
        |-- users, content, feedback, scripts
        |-- audit_logs, analytics, system_logs
        |-- invitations, ratings
```

## Project Structure

```
AI_Content_Platform_T41/
├── app/                     # FastAPI application (23 files)
│   ├── main.py              # Entry point, middleware, startup
│   ├── routes.py            # All API endpoints (71 routes)
│   ├── auth.py              # JWT authentication
│   ├── auth_middleware.py    # Global auth middleware
│   ├── platform_contract.py # TANTRA platform layer
│   ├── runtime_observability.py
│   ├── bucket_validation.py
│   ├── config.py            # Configuration
│   ├── rate_limiting.py     # In-memory rate limiting
│   ├── observability.py     # Sentry/PostHog
│   └── ...                  # Middleware, models, etc.
├── core/                    # Core modules (10 files)
│   ├── database.py          # MongoDB DatabaseManager
│   ├── mongodb.py           # Connection + indexes
│   ├── mongo_models.py      # Document schemas
│   ├── bhiv_core.py         # Pipeline orchestrator
│   ├── bhiv_bucket.py       # Local file storage
│   └── ...
├── video/                   # Video generation (3 files)
│   ├── generator.py
│   └── storyboard.py
├── evidence/                # Phase IV evidence (13 files)
├── requirements.txt
├── Dockerfile
├── render.yaml
├── PLATFORM_ENTRY.md
├── PHASE_IV_CONVERGENCE_PACKET.md
└── DEPLOYMENT_CHECKLIST.md
```

## API Endpoints (71 total)

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/users/register` | Register new user |
| POST | `/users/login` | Login (form data) |
| POST | `/users/login-json` | Login (JSON) |
| POST | `/users/refresh` | Refresh JWT token |
| GET | `/users/profile` | Get user profile |
| POST | `/users/logout` | Logout |

### Content
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/upload` | Upload content file |
| GET | `/contents` | List all content |
| GET | `/content/{id}` | Get content details |
| GET | `/content/{id}/metadata` | Content metadata |
| GET | `/download/{id}` | Download file |
| GET | `/stream/{id}` | Stream video (range) |
| POST | `/generate-video` | Generate video from script |

### AI & Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/feedback` | Submit content feedback |
| GET | `/recommend-tags/{id}` | AI tag recommendations |
| GET | `/average-rating/{id}` | Content average rating |
| GET | `/bhiv/analytics` | Analytics with sentiment |
| GET | `/rl/agent-stats` | Q-Learning agent stats |
| GET | `/lm/stats` | Language model stats |

### CDN
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/cdn/upload-url` | Get upload token |
| POST | `/cdn/upload/{token}` | Upload via token |
| GET | `/cdn/download/{id}` | CDN download |
| GET | `/cdn/stream/{id}` | CDN stream |
| GET | `/cdn/list` | List user files |
| GET | `/cdn/info/{id}` | File info |
| DELETE | `/cdn/delete/{id}` | Delete file |

### Metrics & Monitoring
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/metrics` | System metrics |
| GET | `/metrics/prometheus` | Prometheus format |
| GET | `/metrics/performance` | Performance metrics |
| GET | `/streaming-performance` | Streaming analytics |
| GET | `/logs` | System logs |

### Phase IV - TANTRA Platform
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/platform/execute` | Execute with trace |
| POST | `/platform/validate-contract` | Validate schema |
| GET | `/platform/contract` | Get contract info |
| GET | `/platform/modules` | List modules |
| GET | `/observability/events` | Runtime events |
| GET | `/observability/events/trace/{trace_id}` | Events by trace |
| GET | `/observability/stats/modules` | Module stats |
| GET | `/observability/health` | Observability health |
| POST | `/bucket-validation/write-and-verify` | Write + verify |
| GET | `/bucket-validation/status` | Validation status |
| GET | `/bucket-validation/list-artifacts` | List artifacts |
| GET | `/bucket-validation/read-artifact/{id}` | Read artifact |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/health/platform` | Platform health |
| GET | `/health/detailed` | Detailed health |
| GET | `/bucket/stats` | Storage stats |
| GET | `/bucket/list/{segment}` | List storage segment |
| GET | `/storage/status` | Storage status |

## Environment Variables

```env
# MongoDB (required)
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/?appName=App

# Authentication
JWT_SECRET_KEY=your-secret-key
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Observability (optional)
SENTRY_DSN=https://your-sentry-dsn
POSTHOG_API_KEY=phc_your_key
POSTHOG_HOST=https://us.posthog.com

# Environment
ENVIRONMENT=development
```

## Deployment

### Docker
```bash
docker build -t ai-agent .
docker run -p 9000:9000 --env-file .env ai-agent
```

### Render
Push to `main` branch. Render auto-deploys via `render.yaml`.

## Demo Credentials

- Username: `demo`
- Password: `demo1234`
- Login: `POST /users/login` (form data: `username=demo&password=demo1234`)

## Tech Stack

- **Framework**: FastAPI + Uvicorn
- **Database**: MongoDB Atlas (pymongo)
- **Auth**: JWT (python-jose) + bcrypt
- **Video**: MoviePy + OpenCV
- **ML**: scikit-learn, torch, transformers
- **Monitoring**: Sentry + PostHog
- **Deployment**: Docker + Render
