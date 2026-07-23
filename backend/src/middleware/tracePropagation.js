/**
 * tracePropagation.js
 *
 * Middleware for cross-service trace continuity.
 * Ensures trace_id flows through the entire BHIV execution chain:
 *   User → ARTHA → Creator Core → Prompt Runner → BHIV Core → TANTRA → Bucket → Replay → InsightFlow
 *
 * This middleware:
 * - Extracts trace_id from incoming requests (header or generates new)
 * - Attaches trace_id to req.traceId for downstream use
 * - Adds trace_id to response headers for client correlation
 * - Propagates trace_id to external service calls
 */

import { randomUUID } from 'crypto';
import logger from '../config/logger.js';

/**
 * Trace propagation middleware.
 * Extracts or generates trace_id and attaches to request context.
 *
 * Headers:
 * - x-trace-id: Existing trace ID (optional)
 * - x-request-id: Alternative trace ID header (optional)
 *
 * Response Headers:
 * - x-trace-id: The trace ID for this request
 * - x-run-id: Run ID for pipeline execution (if applicable)
 */
export const tracePropagation = (req, res, next) => {
  // Extract trace ID from headers or generate new
  const incomingTraceId = req.headers['x-trace-id'] || req.headers['x-request-id'];

  if (incomingTraceId) {
    req.traceId = incomingTraceId;
  } else {
    // Generate trace ID in format: TRC-YYYYMMDD-XXXXXXXX
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = randomUUID().slice(0, 8);
    req.traceId = `TRC-${date}-${random}`;
  }

  // Attach timestamp for latency calculation
  req.traceStartTime = Date.now();

  // Add trace ID to response headers
  res.setHeader('x-trace-id', req.traceId);

  // Override res.json to add trace metadata
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === 'object') {
      body.trace_id = req.traceId;
      body.trace_latency_ms = Date.now() - req.traceStartTime;
    }
    return originalJson(body);
  };

  // Log trace start in verbose mode
  if (process.env.TRACE_VERBOSE === 'true') {
    logger.debug(`[TRACE] ${req.method} ${req.path} | trace_id: ${req.traceId}`);
  }

  next();
};

/**
 * Create a child trace ID for sub-operations.
 * Maintains parent trace chain while adding operation-specific identifier.
 *
 * @param {string} parentTraceId - Parent trace ID
 * @param {string} operation - Operation name
 * @returns {string} Child trace ID
 */
export const createChildTraceId = (parentTraceId, operation) => {
  const opCode = operation.slice(0, 4).toUpperCase();
  const random = randomUUID().slice(0, 6);
  return `${parentTraceId}.${opCode}-${random}`;
};

/**
 * Propagate trace headers to outgoing HTTP requests.
 * Use with fetch or axios to maintain trace continuity.
 *
 * @param {string} traceId - Current trace ID
 * @returns {Object} Headers object with trace propagation
 */
export const getTraceHeaders = (traceId) => ({
  'x-trace-id': traceId,
  'x-request-id': traceId,
  'x forwarded-by': 'ARTHA',
});

export default tracePropagation;
