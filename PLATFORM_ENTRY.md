# PLATFORM_ENTRY.md — Canonical Application Entry Contract

**Schema Version:** 1.0.0  
**Status:** FROZEN  
**Last Updated:** 2026-06-29  
**Owner:** Ashmit Pandey — Platform Integration Lead

---

## 1. System Identity

| Field | Value |
|-------|-------|
| System Name | AI Content Platform |
| Role | Platform composition, adapters, integration ownership |
| Parent Ecosystem | TANTRA |
| Entry Point | `POST /platform/execute` |
| Health Check | `GET /health` |
| Contract Schema | `PLATFORM_ENTRY v1.0.0` |

---

## 2. Platform Request Contract

Every request to the AI Content Platform MUST carry the following envelope:

### 2.1 Required Request Headers

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `X-Trace-ID` | string (UUID v4) | YES | Unique trace identifier for distributed tracing |
| `X-Schema-Version` | string | YES | Schema version (e.g., `1.0.0`) |
| `X-Request-ID` | string (UUID v4) | YES | Unique request identifier |
| `Authorization` | string | Conditional | Bearer token for authenticated endpoints |
| `Content-Type` | string | YES | `application/json` for POST/PUT |

### 2.2 Required Request Body (POST /platform/execute)

```json
{
  "trace_id": "string (UUID v4)",
  "schema_version": "1.0.0",
  "module": "string",
  "action": "string",
  "payload": {},
  "metadata": {
    "source": "string",
    "timestamp": "ISO 8601",
    "user_id": "string (optional)"
  }
}
```

### 2.3 Required Response Envelope

```json
{
  "trace_id": "string",
  "schema_version": "1.0.0",
  "status": "success | error | partial",
  "module": "string",
  "execution_id": "string (UUID v4)",
  "timestamp": "ISO 8601",
  "duration_ms": "number",
  "data": {},
  "error": {
    "code": "string",
    "message": "string",
    "details": {}
  }
}
```

### 2.4 Status Values

| Status | Meaning |
|--------|---------|
| `success` | Operation completed successfully |
| `error` | Operation failed with documented error |
| `partial` | Operation completed with degraded results |
| `pending` | Operation is async, check status later |
| `rejected` | Operation rejected by validation/moderation |

---

## 3. Module Registry

| Module ID | Module Name | Owner | Responsibility |
|-----------|-------------|-------|----------------|
| `platform` | AI Content Platform | Ashmit Pandey | Platform composition, adapters |
| `prompt_runner` | Prompt Runner | Siddhesh Narkar | Deterministic execution interface |
| `moderation` | Moderation UI | Hrujul Todankar | Application presentation, moderation |
| `metadata` | Metadata Enrichment | Vijay Dhawan | Tagging, structured metadata |
| `ui` | UI/UX | Chandragupta | Production user experience |
| `bhiv_core` | BHIV Core | Raj Prajapati | Governed application integration |
| `testing` | Testing & Depository | Vinayak Tiwari | Validation, documentation, evidence |
| `verification` | Functionality Testing | Akash | Runtime verification, regression |

---

## 4. Execution Flow

```
User Request
  │
  ▼
[Platform Entry] ─── trace_id generated, schema validated
  │
  ▼
[Prompt Runner] ─── deterministic execution, status tracked
  │
  ▼
[Moderation] ─── content validation, approval/rejection
  │
  ▼
[Metadata] ─── tagging, enrichment, structured output
  │
  ▼
[UI Response] ─── formatted response, trace_id preserved
```

Every stage MUST:
- Preserve `trace_id` from original request
- Return structured response matching Section 2.3
- Report deterministic status values (Section 2.4)
- Handle failures using documented error responses

---

## 5. Error Response Contract

```json
{
  "trace_id": "string",
  "schema_version": "1.0.0",
  "status": "error",
  "module": "string",
  "execution_id": "string",
  "timestamp": "ISO 8601",
  "duration_ms": "number",
  "error": {
    "code": "VALIDATION_ERROR | AUTH_ERROR | TIMEOUT | INTERNAL_ERROR | MODULE_ERROR",
    "message": "Human-readable error description",
    "details": {
      "field": "string (optional)",
      "reason": "string"
    }
  }
}
```

---

## 6. Observability Contract

Every execution MUST produce:

| Field | Source | Description |
|-------|--------|-------------|
| `trace_id` | Request header | Distributed trace identifier |
| `execution_id` | Platform | Unique execution identifier |
| `module` | Request body | Module performing work |
| `action` | Request body | Action being performed |
| `status` | Response | Deterministic status value |
| `duration_ms` | Middleware | Wall-clock execution time |
| `timestamp` | Middleware | ISO 8601 execution timestamp |
| `event_type` | Platform | `execution_started`, `execution_completed`, `execution_failed` |

---

## 7. Bucket Storage Contract

Artifacts written through the platform layer MUST include:

| Field | Type | Description |
|-------|------|-------------|
| `artifact_id` | string | Unique artifact identifier |
| `trace_id` | string | Trace from originating request |
| `execution_id` | string | Execution that produced artifact |
| `module` | string | Module that produced artifact |
| `artifact_type` | string | `output`, `metadata`, `log`, `provenance` |
| `content_hash` | string | SHA-256 of artifact content |
| `created_at` | ISO 8601 | Creation timestamp |
| `provenance` | object | Chain of custody information |

---

## 8. Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PLATFORM_SCHEMA_VERSION` | No | `1.0.0` | Active schema version |
| `PLATFORM_STRICT_MODE` | No | `false` | Reject requests with missing optional fields |
| `PLATFORM_TRACE_SAMPLE_RATE` | No | `1.0` | Trace sampling rate (0.0-1.0) |
| `BHIV_STORAGE_BACKEND` | Yes | `local` | Storage backend (local/s3/supabase) |

---

## 9. Deployment Verification Checklist

- [ ] `/health` returns `{"status": "healthy"}`
- [ ] `POST /platform/execute` accepts valid contract
- [ ] `trace_id` is preserved across all response headers
- [ ] `schema_version` is validated on request
- [ ] Bucket write produces verifiable artifact
- [ ] Bucket read returns identical content hash
- [ ] Observability events are emitted for every execution
- [ ] Error responses follow contract (Section 5)
- [ ] Graceful failure handling on module errors
- [ ] Startup validation completes without errors

---

## 10. Canonical Classification

- **Classification:** Phase IV — Production Transition
- **Integration Type:** Platform composition adapter
- **Routing:** All requests via `POST /platform/execute`
- **Observability:** InsightFlow-compatible event emission
- **Storage:** BHIV Bucket with provenance tracking
