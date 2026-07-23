import express from 'express';
import mongoose from 'mongoose';
import { protect } from '../middleware/auth.js';
import { getRedisClient } from '../config/redis.js';
import { areTransactionsAvailable } from '../config/database.js';
import ComplianceSignal from '../models/ComplianceSignal.js';
import LedgerEntry from '../models/LedgerEntry.js';
import JournalEntry from '../models/JournalEntry.js';
import Invoice from '../models/Invoice.js';
import Expense from '../models/Expense.js';
import logger from '../config/logger.js';

// BHIV Runtime Integration Services
import bhivRuntimeBridge from '../services/bhivRuntimeBridge.service.js';
import runtimeRegistration from '../services/runtimeRegistration.service.js';
import insightFlow from '../services/insightflow.service.js';
import deterministicReplay from '../services/deterministicReplay.service.js';
import lineage from '../services/lineage.service.js';

const router = express.Router();

/**
 * GET /api/v1/runtime/status
 *
 * Operational proof surface.
 * Returns the full deterministic runtime state in one call.
 * Used by: incoming developers, integration layer, deployment verification.
 *
 * Auth: required (Bearer token). Non-sensitive data only — no keys or secrets.
 */
router.get('/status', protect, async (req, res) => {
  const t0 = Date.now();

  try {
    const dbState = mongoose.connection.readyState;

    // Redis
    let redisStatus = 'disabled';
    const redisClient = getRedisClient();
    if (redisClient) {
      try {
        const pong = await redisClient.ping();
        redisStatus = pong === 'PONG' ? 'connected' : 'error';
      } catch {
        redisStatus = 'error';
      }
    }

    // Counts — all in parallel, individual failures degrade gracefully
    const [
      totalSignals,
      totalLedgerEntries,
      totalPostedJournals,
      totalSentInvoices,
      totalRecordedExpenses,
    ] = await Promise.all([
      ComplianceSignal.countDocuments().catch(() => -1),
      LedgerEntry.countDocuments().catch(() => -1),
      JournalEntry.countDocuments({ status: { $in: ['POSTED', 'posted'] } }).catch(() => -1),
      Invoice.countDocuments({ status: { $in: ['sent', 'partial', 'paid'] } }).catch(() => -1),
      Expense.countDocuments({ status: 'recorded' }).catch(() => -1),
    ]);

    // Chain tip (last ledger entry hash)
    let chainTip = null;
    try {
      const lastEntry = await LedgerEntry.findOne({})
        .sort({ timestamp: -1, _id: -1 })
        .select('hash timestamp')
        .lean();
      if (lastEntry) {
        chainTip = { hash: lastEntry.hash, timestamp: lastEntry.timestamp };
      }
    } catch {
      chainTip = null;
    }

    // Recent signals (last 3, no sensitive data)
    let recentSignals = [];
    try {
      recentSignals = await ComplianceSignal.find({})
        .sort({ created_at: -1 })
        .limit(3)
        .select('signal_id type severity trace_id created_at')
        .lean();
    } catch {
      recentSignals = [];
    }

    const setuEnabled = process.env.SETU_ENABLED === 'true';
    const setuConfigured = !!(process.env.SETU_BASE_URL && process.env.SETU_API_KEY);

    // Get BHIV Runtime Bridge health
    const bridgeHealth = await bhivRuntimeBridge.getRuntimeHealth();

    const runtime = {
      status: dbState === 1 ? 'operational' : 'degraded',
      checked_at: new Date().toISOString(),
      latency_ms: Date.now() - t0,
      version: '0.1.0',
      environment: process.env.NODE_ENV || 'development',

      infrastructure: {
        database: {
          status: dbState === 1 ? 'connected' : 'disconnected',
          transactions_available: areTransactionsAvailable(),
        },
        redis: { status: redisStatus },
      },

      bhiv_runtime: {
        bridge_state: bridgeHealth.bridge_state,
        registration_id: bridgeHealth.registration_id,
        schema_version: bridgeHealth.schema_version,
        execution_count: bridgeHealth.execution_count,
        components: bridgeHealth.components,
      },

      ledger: {
        posted_journal_entries: totalPostedJournals,
        ledger_entries: totalLedgerEntries,
        chain_tip: chainTip,
      },

      compliance: {
        signals_in_db: totalSignals,
        recent_signals: recentSignals.map(s => ({
          signal_id: s.signal_id,
          type: s.type,
          severity: s.severity,
          trace_id: s.trace_id,
          created_at: s.created_at,
        })),
      },

      transactions: {
        sent_invoices: totalSentInvoices,
        recorded_expenses: totalRecordedExpenses,
      },

      setu: {
        enabled: setuEnabled,
        configured: setuConfigured,
        dispatch_surface: setuEnabled && setuConfigured ? 'live' : 'payload-proof-only',
      },

      endpoints: {
        signals:        'GET /api/v1/signals',
        snapshot:       'GET /api/v1/signals/snapshot',
        trace:          'GET /api/v1/signals/trace/:traceId',
        pipeline_check: 'GET /api/v1/signals/:signalId/pipeline-check',
        dispatch:       'POST /api/v1/signals/:signalId/dispatch',
        verify_chain:   'GET /api/v1/ledger/verify-chain',
        gst_summary:    'GET /api/v1/gst/summary?period=YYYY-MM',
        tds_dashboard:  'GET /api/v1/tds/dashboard?quarter=Q4&financialYear=FY2025-26',
        health:         'GET /health',
        runtime_execute:'POST /api/v1/runtime/execute',
        runtime_trace:  'GET /api/v1/runtime/trace/:traceId',
        runtime_replay: 'POST /api/v1/runtime/replay',
        runtime_health: 'GET /api/v1/runtime/health',
      },
    };

    res.json({ success: true, data: runtime });
  } catch (error) {
    logger.error('Runtime status error:', error);
    res.status(500).json({
      success: false,
      message: 'Runtime status check failed',
      error: error.message,
    });
  }
});

/**
 * POST /api/v1/runtime/execute
 *
 * Execute a content processing pipeline through the BHIV ecosystem.
 * Full chain: ARTHA → Creator Core → Prompt Runner → BHIV Core → Bucket → Replay → InsightFlow
 *
 * Auth: required (Bearer token)
 * Capability: ARTHA-RUNTIME-001
 */
router.post('/execute', protect, async (req, res) => {
  try {
    const { script_text, content_id, operation } = req.body;

    if (!script_text && !content_id) {
      return res.status(400).json({
        success: false,
        message: 'Either script_text or content_id is required',
      });
    }

    const result = await bhivRuntimeBridge.executeContentPipeline({
      script_text,
      content_id,
      user_id: req.user._id,
      operation: operation || 'CONTENT_PIPELINE',
      trace_id: req.headers['x-trace-id'] || req.headers['x-request-id'],
    });

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(`Runtime execute error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Pipeline execution failed',
      error: error.message,
    });
  }
});

/**
 * GET /api/v1/runtime/trace/:traceId
 *
 * Get the full trace timeline for a given trace ID.
 * Reconstructs execution across all BHIV components.
 *
 * Auth: required (Bearer token)
 */
router.get('/trace/:traceId', protect, async (req, res) => {
  try {
    const { traceId } = req.params;

    // Get InsightFlow telemetry timeline
    const timeline = insightFlow.getTraceTimeline(traceId);

    // Get replay record if exists
    const replayRecord = await deterministicReplay.verifyReplay({
      trace_id: traceId,
      operation: 'CONTENT_PIPELINE',
    });

    // Get lineage anchoring
    const lineageRecord = lineage.getAnchoring(traceId, 'BHIV_CORE');

    res.json({
      success: true,
      data: {
        trace_id: traceId,
        timeline,
        replay: replayRecord ? {
          verified: replayRecord.verified,
          mismatch: replayRecord.mismatch,
        } : null,
        lineage: lineageRecord ? {
          entity_id: lineageRecord.entity_id,
          bucket_id: lineageRecord.bucket_id,
          immutable_ref: lineageRecord.immutable_ref,
        } : null,
        event_count: timeline.length,
      },
    });
  } catch (error) {
    logger.error(`Runtime trace error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Trace retrieval failed',
      error: error.message,
    });
  }
});

/**
 * POST /api/v1/runtime/replay
 *
 * Record a deterministic replay entry for later verification.
 *
 * Auth: required (Bearer token)
 */
router.post('/replay', protect, async (req, res) => {
  try {
    const { operation, method, path, body, db_reads, db_writes } = req.body;

    if (!operation) {
      return res.status(400).json({
        success: false,
        message: 'operation is required',
      });
    }

    const replay = deterministicReplay.recordDistributedExecution({
      trace_id: req.headers['x-trace-id'] || req.headers['x-request-id'],
      operation,
      method: method || 'POST',
      path: path || '/api/v1/runtime/execute',
      body,
      user_id: req.user._id,
      capability: 'ARTHA-RUNTIME-001',
      status_code: 200,
      response: req.body,
      db_reads: db_reads || ['journalentries', 'ledgerentries'],
      db_writes: db_writes || ['journalentries', 'ledgerentries'],
    });

    res.json({ success: true, data: replay });
  } catch (error) {
    logger.error(`Runtime replay error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Replay recording failed',
      error: error.message,
    });
  }
});

/**
 * GET /api/v1/runtime/health
 *
 * Get comprehensive runtime health status.
 * Includes BHIV Runtime Bridge status, component connectivity, and metrics.
 *
 * Auth: required (Bearer token)
 */
router.get('/health', protect, async (req, res) => {
  try {
    const bridgeHealth = await bhivRuntimeBridge.getRuntimeHealth();
    const registrationStatus = runtimeRegistration.getStatus();
    const insightMetrics = insightFlow.getMetrics();

    res.json({
      success: true,
      data: {
        bridge: bridgeHealth,
        registration: registrationStatus,
        telemetry: insightMetrics,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error(`Runtime health error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Health check failed',
      error: error.message,
    });
  }
});

/**
 * GET /api/v1/runtime/registration
 *
 * Get current runtime registration status with BHIV Core.
 *
 * Auth: required (Bearer token)
 */
router.get('/registration', protect, async (req, res) => {
  try {
    const status = runtimeRegistration.getStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    logger.error(`Runtime registration error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Registration status failed',
      error: error.message,
    });
  }
});

/**
 * POST /api/v1/runtime/heartbeat
 *
 * Manually trigger a heartbeat to BHIV Core.
 *
 * Auth: required (Bearer token)
 */
router.post('/heartbeat', protect, async (req, res) => {
  try {
    const heartbeat = await runtimeRegistration.heartbeat();
    res.json({ success: true, data: heartbeat });
  } catch (error) {
    logger.error(`Runtime heartbeat error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Heartbeat failed',
      error: error.message,
    });
  }
});

/**
 * GET /api/v1/runtime/telemetry
 *
 * Get InsightFlow telemetry metrics and recent events.
 *
 * Auth: required (Bearer token)
 */
router.get('/telemetry', protect, async (req, res) => {
  try {
    const metrics = insightFlow.getMetrics();
    const component = req.query.component;

    let componentMetrics = null;
    if (component) {
      componentMetrics = insightFlow.getComponentMetrics(component);
    }

    res.json({
      success: true,
      data: {
        metrics,
        component_metrics: componentMetrics,
      },
    });
  } catch (error) {
    logger.error(`Runtime telemetry error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Telemetry retrieval failed',
      error: error.message,
    });
  }
});

/**
 * POST /api/v1/runtime/deregister
 *
 * Gracefully deregister ARTHA from BHIV Core.
 *
 * Auth: required (Bearer token)
 */
router.post('/deregister', protect, async (req, res) => {
  try {
    await runtimeRegistration.deregister();
    res.json({ success: true, message: 'Deregistered from BHIV Core' });
  } catch (error) {
    logger.error(`Runtime deregister error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Deregistration failed',
      error: error.message,
    });
  }
});

export default router;
