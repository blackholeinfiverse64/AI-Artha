import mongoose from 'mongoose';
import { randomUUID } from 'crypto';

const complianceSignalSchema = new mongoose.Schema({
  signal_id: {
    type: String,
    unique: true,
    default: () => `SIG-${randomUUID()}`,
    immutable: true,
    index: true,
  },
  trace_id: {
    type: String,
    required: true,
    immutable: true,
    index: true,
  },
  source: {
    type: String,
    default: 'ARTHA',
    immutable: true,
  },
  type: {
    type: String,
    required: true,
  },
  severity: {
    type: String,
    required: true,
  },
  context: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  recommendation: String,
  created_at: {
    type: Date,
    default: Date.now,
    immutable: true,
  },
}, {
  timestamps: true,
});

complianceSignalSchema.index({ type: 1, severity: 1, created_at: -1 });

export default mongoose.model('ComplianceSignal', complianceSignalSchema);
