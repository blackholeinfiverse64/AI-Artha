/**
 * runtimeRegistration.service.js
 *
 * Manages ARTHA's lifecycle registration with BHIV Core.
 * Handles heartbeat, capability declaration, and runtime metadata exchange.
 *
 * This service:
 * - Registers ARTHA as a BHIV ecosystem participant
 * - Sends periodic heartbeats to maintain registration
 * - Reports runtime health and execution metrics
 * - Handles deregistration on graceful shutdown
 */

import { randomUUID } from 'crypto';
import logger from '../config/logger.js';
import provenanceChain from './provenanceChain.service.js';
import decisionLedger from './decisionLedger.service.js';
import insightFlow from './insightflow.service.js';

class RuntimeRegistrationService {
  constructor() {
    this.registrationId = null;
    this.heartbeatInterval = null;
    this.heartbeatCount = 0;
    this.lastHeartbeat = null;
    this.state = 'UNREGISTERED';
    this.capabilities = [];
    this.runtimeInfo = {};
  }

  /**
   * Register ARTHA with BHIV Core runtime.
   *
   * @param {Object} options - Registration options
   * @param {string} options.appId - Application ID (default: ARTHA)
   * @param {string} options.version - ARTHA version
   * @param {string} options.environment - Runtime environment
   * @param {Object} options.capabilities - Capability declarations
   * @returns {Object} Registration result
   */
  async register(options = {}) {
    const {
      appId = process.env.APP_ID || process.env.BHIV_APP_ID || 'ARTHA',
      version = '0.1.0',
      environment = process.env.NODE_ENV || 'development',
      capabilities = this._getDefaultCapabilities(),
    } = options;

    const startTime = Date.now();

    try {
      this.registrationId = `REG-${appId}-${Date.now()}-${randomUUID().slice(0, 8)}`;
      this.capabilities = capabilities;

      this.runtimeInfo = {
        registration_id: this.registrationId,
        app_id: appId,
        version,
        environment,
        schema_version: '1.0.0',
        participant_type: 'ACCOUNTING_PLATFORM',
        status: 'REGISTERED',
        capabilities,
        registered_at: new Date().toISOString(),
        metadata: {
          node_version: process.version,
          platform: process.platform,
          architecture: process.arch,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        },
      };

      // Record registration to provenance chain
      await provenanceChain.recordDeployment({
        action: 'REGISTER',
        version,
        environment,
        details: {
          registration_id: this.registrationId,
          participant_type: 'ACCOUNTING_PLATFORM',
          capability_count: capabilities.length,
        },
      });

      // Record to decision ledger
      await decisionLedger.recordDecision({
        decision_type: 'RUNTIME_REGISTRATION',
        capability_id: 'ARTHA-RUNTIME-001',
        outcome: 'ALLOW',
        reason: `ARTHA registered as BHIV ecosystem participant: ${this.registrationId}`,
        evidence: {
          registration_id: this.registrationId,
          capabilities,
          environment,
        },
      });

      // Emit registration event
      await insightFlow.emitEvent({
        event: 'RUNTIME_REGISTERED',
        component: 'runtimeRegistration',
        registration_id: this.registrationId,
        app_id: appId,
        capability_count: capabilities.length,
        duration_ms: Date.now() - startTime,
      });

      // Start heartbeat
      this._startHeartbeat();

      this.state = 'REGISTERED';

      logger.info(`[RUNTIME_REG] Registered: ${this.registrationId} (${appId} v${version})`);

      return {
        success: true,
        registration: this.runtimeInfo,
      };
    } catch (error) {
      this.state = 'FAILED';

      await insightFlow.emitEvent({
        event: 'RUNTIME_REGISTRATION_FAILED',
        component: 'runtimeRegistration',
        error: error.message,
        duration_ms: Date.now() - startTime,
      });

      logger.error(`[RUNTIME_REG] Registration failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Deregister ARTHA from BHIV Core (graceful shutdown).
   */
  async deregister() {
    if (!this.registrationId) return;

    try {
      this._stopHeartbeat();

      await provenanceChain.recordDeployment({
        action: 'DEREGISTER',
        version: this.runtimeInfo.version,
        environment: this.runtimeInfo.environment,
        details: {
          registration_id: this.registrationId,
          heartbeat_count: this.heartbeatCount,
        },
      });

      await decisionLedger.recordDecision({
        decision_type: 'RUNTIME_DEREGISTRATION',
        capability_id: 'ARTHA-RUNTIME-001',
        outcome: 'ALLOW',
        reason: `ARTHA deregistered: ${this.registrationId}`,
        evidence: {
          registration_id: this.registrationId,
          total_heartbeats: this.heartbeatCount,
        },
      });

      await insightFlow.emitEvent({
        event: 'RUNTIME_DEREGISTERED',
        component: 'runtimeRegistration',
        registration_id: this.registrationId,
        heartbeat_count: this.heartbeatCount,
      });

      this.state = 'DEREGISTERED';
      logger.info(`[RUNTIME_REG] Deregistered: ${this.registrationId}`);
    } catch (error) {
      logger.warn(`[RUNTIME_REG] Deregistration error: ${error.message}`);
    }
  }

  /**
   * Send heartbeat to BHIV Core.
   * Reports current runtime health and execution metrics.
   */
  async heartbeat() {
    if (this.state !== 'REGISTERED') return;

    try {
      this.heartbeatCount++;
      this.lastHeartbeat = new Date();

      const heartbeatData = {
        registration_id: this.registrationId,
        sequence: this.heartbeatCount,
        timestamp: new Date().toISOString(),
        state: 'ALIVE',
        metadata: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        },
      };

      await insightFlow.emitEvent({
        event: 'RUNTIME_HEARTBEAT',
        component: 'runtimeRegistration',
        registration_id: this.registrationId,
        sequence: this.heartbeatCount,
        state: 'ALIVE',
      });

      // In production, this would POST to BHIV Core heartbeat endpoint
      // await fetch(`${bhivCoreUrl}/api/v1/runtime/heartbeat`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(heartbeatData),
      // });

      return heartbeatData;
    } catch (error) {
      logger.warn(`[RUNTIME_REG] Heartbeat failed: ${error.message}`);
    }
  }

  /**
   * Get current registration status.
   */
  getStatus() {
    return {
      state: this.state,
      registration_id: this.registrationId,
      heartbeat_count: this.heartbeatCount,
      last_heartbeat: this.lastHeartbeat,
      capabilities: this.capabilities,
      runtime_info: this.runtimeInfo,
    };
  }

  /**
   * Get default ARTHA capabilities.
   */
  _getDefaultCapabilities() {
    return [
      {
        id: 'DOUBLE_ENTRY_LEDGER',
        name: 'Double Entry Accounting',
        status: 'active',
        endpoints: ['POST /api/v1/ledger/entries', 'GET /api/v1/ledger/entries'],
      },
      {
        id: 'GST_COMPLIANCE',
        name: 'GST Compliance Engine',
        status: 'active',
        endpoints: ['GET /api/v1/gst/summary', 'POST /api/v1/gst/calculate'],
      },
      {
        id: 'TDS_COMPLIANCE',
        name: 'TDS Compliance Management',
        status: 'active',
        endpoints: ['GET /api/v1/tds/dashboard', 'POST /api/v1/tds/calculate'],
      },
      {
        id: 'INVOICE_MANAGEMENT',
        name: 'Invoice Lifecycle Management',
        status: 'active',
        endpoints: ['POST /api/v1/invoices', 'GET /api/v1/invoices'],
      },
      {
        id: 'EXPENSE_MANAGEMENT',
        name: 'Expense Recording & Processing',
        status: 'active',
        endpoints: ['POST /api/v1/expenses', 'GET /api/v1/expenses'],
      },
      {
        id: 'FINANCIAL_REPORTING',
        name: 'Financial Report Generation',
        status: 'active',
        endpoints: ['GET /api/v1/reports/profit-loss', 'GET /api/v1/reports/balance-sheet'],
      },
      {
        id: 'HASH_CHAIN_INTEGRITY',
        name: 'Immutable Hash Chain Verification',
        status: 'active',
        endpoints: ['GET /api/v1/ledger/verify-chain'],
      },
      {
        id: 'DETERMINISTIC_REPLAY',
        name: 'Deterministic Execution Replay',
        status: 'active',
        endpoints: ['POST /api/v1/runtime/replay'],
      },
      {
        id: 'SETU_SIGNAL_DISPATCH',
        name: 'SETU Signal Dispatch Pipeline',
        status: 'active',
        endpoints: ['POST /api/v1/setu/dispatch'],
      },
      {
        id: 'COMPLIANCE_FILING',
        name: 'Regulatory Compliance Filing',
        status: 'active',
        endpoints: ['POST /api/v1/compliance/file'],
      },
    ];
  }

  /**
   * Start periodic heartbeat.
   */
  _startHeartbeat() {
    const interval = parseInt(process.env.HEARTBEAT_INTERVAL_MS) || 30000; // 30 seconds
    this.heartbeatInterval = setInterval(() => this.heartbeat(), interval);
  }

  /**
   * Stop periodic heartbeat.
   */
  _stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

const runtimeRegistration = new RuntimeRegistrationService();
export default runtimeRegistration;
