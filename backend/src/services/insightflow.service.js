/**
 * insightFlow.service.js
 *
 * Telemetry emission service for the BHIV ecosystem.
 * Captures observability events from ARTHA and emits them to InsightFlow
 * for cross-component monitoring, replay evidence, and compliance tracking.
 *
 * InsightFlow is the observability backbone that unifies:
 * - Execution telemetry (latency, throughput, errors)
 * - Compliance signals (GST, TDS, BCAB)
 * - Replay evidence (deterministic reconstruction)
 * - Cross-service trace correlation
 *
 * This service does NOT implement InsightFlow itself - it emits events
 * that InsightFlow consumes. It also stores local telemetry for offline analysis.
 */

import { randomUUID } from 'crypto';
import logger from '../config/logger.js';

// In-memory telemetry buffer (circular, bounded)
const MAX_BUFFER_SIZE = 10000;
const TELEMETRY_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

class InsightFlowService {
  constructor() {
    this.buffer = [];
    this.metrics = {
      total_events: 0,
      by_component: {},
      by_event_type: {},
      error_count: 0,
      avg_latency_ms: 0,
    };
    this.emissionTargets = [];
    this.initialized = false;
  }

  /**
   * Initialize the InsightFlow service.
   */
  initialize() {
    this.initialized = true;
    logger.info('[INSIGHTFLOW] Telemetry service initialized');
  }

  /**
   * Emit a telemetry event to all registered consumers.
   *
   * @param {Object} event - Event payload
   * @param {string} event.event - Event type/name (e.g., 'CONTENT_PIPELINE_COMPLETED')
   * @param {string} event.component - Source component (e.g., 'bhivRuntimeBridge')
   * @param {string} [event.run_id] - Associated run ID
   * @param {string} [event.trace_id] - Trace ID for cross-service correlation
   * @param {string} [event.operation] - Operation being performed
   * @param {number} [event.duration_ms] - Duration in milliseconds
   * @param {string} [event.error] - Error message if failed
   * @param {Object} [event.metadata] - Additional context
   */
  async emitEvent(event) {
    if (!this.initialized) {
      this.initialize();
    }

    const enrichedEvent = {
      id: `EVT-${Date.now()}-${randomUUID().slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      source: 'ARTHA',
      ...event,
      metadata: {
        schema_version: '1.0.0',
        ...event.metadata,
      },
    };

    // Add to buffer
    this._addToBuffer(enrichedEvent);

    // Update metrics
    this._updateMetrics(enrichedEvent);

    // Emit to registered targets
    for (const target of this.emissionTargets) {
      try {
        await target.emit(enrichedEvent);
      } catch (error) {
        logger.warn(`[INSIGHTFLOW] Failed to emit to target: ${error.message}`);
      }
    }

    // Log for debugging
    if (process.env.INSIGHTFLOW_VERBOSE === 'true') {
      logger.debug(`[INSIGHTFLOW] Event: ${enrichedEvent.event} | Component: ${enrichedEvent.component} | Duration: ${enrichedEvent.duration_ms}ms`);
    }

    return enrichedEvent;
  }

  /**
   * Register an emission target (consumer) for events.
   *
   * @param {string} name - Target name
   * @param {Object} target - Object with emit(event) method
   */
  registerTarget(name, target) {
    this.emissionTargets.push({ name, ...target });
    logger.info(`[INSIGHTFLOW] Registered emission target: ${name}`);
  }

  /**
   * Query telemetry events from the buffer.
   *
   * @param {Object} query - Query filters
   * @param {string} [query.component] - Filter by component
   * @param {string} [query.event] - Filter by event type
   * @param {string} [query.run_id] - Filter by run ID
   * @param {string} [query.trace_id] - Filter by trace ID
   * @param {string} [query.from] - ISO timestamp start
   * @param {string} [query.to] - ISO timestamp end
   * @param {number} [query.limit] - Max results (default 100)
   * @returns {Object[]} Matching events
   */
  queryEvents(query = {}) {
    const { component, event, run_id, trace_id, from, to, limit = 100 } = query;

    let results = [...this.buffer];

    if (component) results = results.filter(e => e.component === component);
    if (event) results = results.filter(e => e.event === event);
    if (run_id) results = results.filter(e => e.run_id === run_id);
    if (trace_id) results = results.filter(e => e.trace_id === trace_id);
    if (from) results = results.filter(e => new Date(e.timestamp) >= new Date(from));
    if (to) results = results.filter(e => new Date(e.timestamp) <= new Date(to));

    return results.slice(0, limit);
  }

  /**
   * Get telemetry metrics summary.
   */
  getMetrics() {
    return {
      ...this.metrics,
      buffer_size: this.buffer.length,
      targets: this.emissionTargets.map(t => t.name),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get metrics for a specific component.
   *
   * @param {string} component - Component name
   */
  getComponentMetrics(component) {
    const events = this.buffer.filter(e => e.component === component);
    const errors = events.filter(e => e.error);

    const latencies = events
      .filter(e => e.duration_ms !== undefined)
      .map(e => e.duration_ms);

    return {
      component,
      total_events: events.length,
      error_count: errors.length,
      error_rate: events.length > 0 ? (errors.length / events.length * 100).toFixed(2) + '%' : '0%',
      avg_latency_ms: latencies.length > 0
        ? (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2)
        : null,
      p95_latency_ms: latencies.length > 0
        ? this._percentile(latencies, 95)
        : null,
      p99_latency_ms: latencies.length > 0
        ? this._percentile(latencies, 99)
        : null,
      event_types: this._countByField(events, 'event'),
      last_event: events.length > 0 ? events[events.length - 1].timestamp : null,
    };
  }

  /**
   * Get trace timeline for a specific trace_id.
   *
   * @param {string} traceId - Trace ID to reconstruct
   * @returns {Object[]} Timeline of events in chronological order
   */
  getTraceTimeline(traceId) {
    return this.buffer
      .filter(e => e.trace_id === traceId)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map((e, i) => ({
        sequence: i + 1,
        event: e.event,
        component: e.component,
        timestamp: e.timestamp,
        duration_ms: e.duration_ms,
        status: e.error ? 'FAILED' : 'OK',
        metadata: e.metadata,
      }));
  }

  /**
   * Add event to circular buffer.
   */
  _addToBuffer(event) {
    this.buffer.push(event);

    // Trim old events
    const cutoff = Date.now() - TELEMETRY_RETENTION_MS;
    while (this.buffer.length > 0 && new Date(this.buffer[0].timestamp).getTime() < cutoff) {
      this.buffer.shift();
    }

    // Enforce max size
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.buffer = this.buffer.slice(this.buffer.length - MAX_BUFFER_SIZE);
    }
  }

  /**
   * Update aggregate metrics.
   */
  _updateMetrics(event) {
    this.metrics.total_events++;

    // By component
    if (!this.metrics.by_component[event.component]) {
      this.metrics.by_component[event.component] = 0;
    }
    this.metrics.by_component[event.component]++;

    // By event type
    if (!this.metrics.by_event_type[event.event]) {
      this.metrics.by_event_type[event.event] = 0;
    }
    this.metrics.by_event_type[event.event]++;

    // Errors
    if (event.error) {
      this.metrics.error_count++;
    }

    // Running average latency
    if (event.duration_ms !== undefined) {
      const n = this.metrics.total_events;
      this.metrics.avg_latency_ms = ((this.metrics.avg_latency_ms * (n - 1)) + event.duration_ms) / n;
    }
  }

  /**
   * Calculate percentile from array of values.
   */
  _percentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  /**
   * Count occurrences by field value.
   */
  _countByField(events, field) {
    const counts = {};
    for (const e of events) {
      const val = e[field];
      counts[val] = (counts[val] || 0) + 1;
    }
    return counts;
  }
}

const insightFlow = new InsightFlowService();
export default insightFlow;
