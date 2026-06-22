import { randomUUID } from 'crypto';
import logger from '../config/logger.js';
import UnifiedTrace from '../models/UnifiedTrace.js';
import RuntimeProof from '../models/RuntimeProof.js';
import ComplianceSignal from '../models/ComplianceSignal.js';

class TantraIntegrationService {
  constructor() {
    this.participationId = null;
    this.healthStatus = 'initializing';
    this.registrationTime = null;
    this.lastHeartbeat = null;
    this.eventQueue = [];
  }

  // Register with TANTRA runtime
  async register(participationData) {
    const { appId, version, capabilities, endpoints } = participationData;

    this.participationId = `TANTRA-${randomUUID().slice(0, 8)}`;
    this.registrationTime = new Date();
    this.healthStatus = 'registered';

    const registration = {
      participationId: this.participationId,
      appId: appId || 'ARTHA',
      version: version || '0.1.0',
      status: 'registered',
      capabilities: capabilities || [
        'ledger', 'invoices', 'expenses', 'gst', 'tds',
        'compliance', 'banking', 'audit', 'reports',
      ],
      endpoints: endpoints || {
        health: '/health/detailed',
        metrics: '/metrics',
        signals: '/api/v1/signals',
        trace: '/api/v1/trace',
        compliance: '/api/v1/compliance',
      },
      registeredAt: this.registrationTime,
      metadata: {
        nodeEnv: process.env.NODE_ENV,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
      },
    };

    logger.info(`TANTRA registration: ${this.participationId}`);
    return registration;
  }

  // Send heartbeat
  async heartbeat() {
    this.lastHeartbeat = new Date();

    return {
      participationId: this.participationId,
      status: this.healthStatus,
      timestamp: this.lastHeartbeat,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      eventQueueSize: this.eventQueue.length,
    };
  }

  // Emit runtime event to TANTRA
  async emitEvent(eventData) {
    const event = {
      eventId: `EVT-${randomUUID()}`,
      participationId: this.participationId,
      timestamp: new Date(),
      ...eventData,
    };

    this.eventQueue.push(event);

    // Process queue if > 10 events
    if (this.eventQueue.length > 10) {
      await this.flushEventQueue();
    }

    return event;
  }

  async flushEventQueue() {
    const events = [...this.eventQueue];
    this.eventQueue = [];

    logger.info(`Flushed ${events.length} events to TANTRA`);
    return { flushed: events.length, events };
  }

  // Get operational metadata for TANTRA
  async getOperationalMetadata() {
    return {
      participationId: this.participationId,
      healthStatus: this.healthStatus,
      registrationTime: this.registrationTime,
      lastHeartbeat: this.lastHeartbeat,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      eventQueueSize: this.eventQueue.length,
      capabilities: [
        'ledger', 'invoices', 'expenses', 'gst', 'tds',
        'compliance', 'banking', 'audit', 'reports',
      ],
      runtimeState: {
        databaseConnected: true,
        redisConnected: false,
        activeTraces: await UnifiedTrace.countDocuments({ status: 'IN_PROGRESS' }),
        totalTraces: await UnifiedTrace.countDocuments({}),
        totalProofs: await RuntimeProof.countDocuments({}),
        activeSignals: await ComplianceSignal.countDocuments({ status: { $ne: 'resolved' } }),
      },
    };
  }

  // Report lifecycle event
  async reportLifecycle(eventType, data) {
    return this.emitEvent({
      type: 'LIFECYCLE',
      eventType,
      data,
      severity: eventType === 'ERROR' ? 'critical' : 'info',
    });
  }

  // Report transaction lifecycle
  async reportTransactionLifecycle(traceId, stage, status, metadata) {
    return this.emitEvent({
      type: 'TRANSACTION',
      eventType: stage,
      traceId,
      status,
      metadata,
    });
  }

  // Report compliance event
  async reportComplianceEvent(filingType, status, traceId) {
    return this.emitEvent({
      type: 'COMPLIANCE',
      eventType: `FILING_${status}`,
      filingType,
      traceId,
      severity: status === 'FILED' ? 'info' : 'warning',
    });
  }

  // Set health status
  setHealthStatus(status) {
    this.healthStatus = status;
  }
}

export default new TantraIntegrationService();
