/**
 * deterministicReplay.service.js
 *
 * Deterministic replay system for governance verification.
 * Records execution inputs, computes deterministic output hashes,
 * and enables independent verification of execution outcomes.
 */

import crypto from 'crypto';
import { randomUUID } from 'crypto';
import logger from '../config/logger.js';

class DeterministicReplayService {
  constructor() {
    this.replayRecords = new Map();
    this.initialized = false;
  }

  initialize() {
    this.initialized = true;
    logger.info('[REPLAY] Deterministic replay system initialized');
  }

  recordExecution(execution) {
    if (!this.initialized) this.initialize();

    const record = {
      replay_id: `RPL-${Date.now()}-${randomUUID().slice(0, 8)}`,
      trace_id: execution.trace_id,
      operation: execution.operation,
      timestamp: new Date().toISOString(),
      input: {
        method: execution.method,
        path: execution.path,
        body_hash: this._hashData(execution.body || {}),
        query_hash: this._hashData(execution.query || {}),
        params_hash: this._hashData(execution.params || {}),
        user_id: execution.user_id,
        capability: execution.capability,
      },
      output: {
        status_code: execution.status_code,
        response_hash: this._hashData(execution.response || {}),
        error: execution.error || null,
      },
      metadata: {
        environment_hash: this._hashEnvironment(),
        node_version: process.version,
      },
      verification: {
        input_fingerprint: null,
        output_fingerprint: null,
        deterministic: true,
      },
    };

    record.verification.input_fingerprint = this._computeFingerprint(record.input);
    record.verification.output_fingerprint = this._computeFingerprint(record.output);
    this.replayRecords.set(record.replay_id, record);

    logger.debug(`[REPLAY] Recorded: ${record.replay_id} op=${execution.operation}`);
    return record;
  }

  getReplayData(replayId) {
    const record = this.replayRecords.get(replayId);
    if (!record) return { found: false, error: `Replay ${replayId} not found` };

    return {
      found: true,
      record,
      replay_instructions: {
        method: record.input.method,
        path: record.input.path,
        body_hash: record.input.body_hash,
        expected_output_hash: record.output.response_hash,
        expected_status: record.output.status_code,
        capability: record.input.capability,
      },
    };
  }

  verifyReplay(replayId, actualOutput) {
    const record = this.replayRecords.get(replayId);
    if (!record) return { valid: false, error: `Replay ${replayId} not found` };

    const actualHash = this._hashData(actualOutput);
    const deterministic = actualHash === record.verification.output_fingerprint;

    return {
      replay_id: replayId,
      trace_id: record.trace_id,
      operation: record.operation,
      deterministic,
      expected_hash: record.verification.output_fingerprint,
      actual_hash: actualHash,
      match: deterministic,
      verified_at: new Date().toISOString(),
    };
  }

  getReplaysByTrace(traceId) {
    return Array.from(this.replayRecords.values()).filter(r => r.trace_id === traceId);
  }

  getStatistics() {
    const records = Array.from(this.replayRecords.values());
    return {
      total_replays: records.length,
      deterministic_count: records.filter(r => r.verification.deterministic).length,
      operations: [...new Set(records.map(r => r.operation))],
      traces: [...new Set(records.map(r => r.trace_id).filter(Boolean))],
    };
  }

  generateReplayProof(replayId) {
    const record = this.replayRecords.get(replayId);
    if (!record) return { valid: false, error: `Replay ${replayId} not found` };

    return {
      proof_id: `RPF-${Date.now()}-${randomUUID().slice(0, 8)}`,
      replay_id: replayId,
      trace_id: record.trace_id,
      operation: record.operation,
      timestamp: record.timestamp,
      input_fingerprint: record.verification.input_fingerprint,
      output_fingerprint: record.verification.output_fingerprint,
      deterministic: record.verification.deterministic,
      environment: { node_version: process.version, environment_hash: record.metadata.environment_hash },
      verification: {
        method: 'SHA-256 hash comparison',
        input_hash: record.input.body_hash,
        output_hash: record.output.response_hash,
        status_code: record.output.status_code,
      },
      generated_at: new Date().toISOString(),
    };
  }

  _hashData(data) {
    const sorted = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash('sha256').update(sorted || '').digest('hex');
  }

  _hashEnvironment() {
    const envStr = JSON.stringify({
      node_version: process.version,
      platform: process.platform,
      arch: process.arch,
    });
    return crypto.createHash('sha256').update(envStr).digest('hex');
  }

  _computeFingerprint(data) {
    const payload = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash('sha256').update(payload).digest('hex');
  }
}

const deterministicReplay = new DeterministicReplayService();
export default deterministicReplay;
