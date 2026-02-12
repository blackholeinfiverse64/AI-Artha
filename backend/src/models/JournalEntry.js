import mongoose from 'mongoose';
import crypto from 'crypto';
import Decimal from 'decimal.js';

const journalLineSchema = new mongoose.Schema({
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChartOfAccounts',
    required: true,
  },
  debit: {
    type: String,
    default: '0',
    validate: {
      validator: function(v) {
        try {
          new Decimal(v);
          return true;
        } catch {
          return false;
        }
      },
      message: 'Invalid decimal value for debit'
    },
  },
  credit: {
    type: String,
    default: '0',
    validate: {
      validator: function(v) {
        try {
          new Decimal(v);
          return true;
        } catch {
          return false;
        }
      },
      message: 'Invalid decimal value for credit'
    },
  },
  description: String,
}, { _id: false });

const journalEntrySchema = new mongoose.Schema({
  entryNumber: {
    type: String,
    unique: true,
    // Format: JE-YYYYMMDD-XXXX
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
  },
  description: {
    type: String,
    required: true,
  },
  lines: {
    type: [journalLineSchema],
    validate: {
      validator: function(lines) {
        return lines && lines.length >= 2;
      },
      message: 'Journal entry must have at least 2 lines',
    },
  },
  reference: {
    type: String,
    // External reference: invoice number, expense ID, etc.
  },
  status: {
    type: String,
    enum: ['draft', 'posted', 'voided'],
    default: 'draft',
    index: true,
  },
  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  postedAt: Date,
  voidedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  voidReason: String,
  
  // Enhanced hash-chain fields
  prevHash: {
    type: String,
    default: '0',
    index: true,
  },
  hash: {
    type: String,
    index: true,
  },
  chainPosition: {
    type: Number,
    default: 0,
    index: true,
  },
  hashTimestamp: {
    type: Date,
    default: Date.now,
  },
  
  // Legacy fields (backward compatibility)
  immutable_hash: {
    type: String,
  },
  prev_hash: {
    type: String,
    default: '0',
  },
  immutable_chain_valid: {
    type: Boolean,
    default: true,
  },
  
  // Approval workflow
  approvals: [{
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: Date,
    comment: String,
  }],
  
  // Audit trail
  auditTrail: [{
    action: String,
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    details: mongoose.Schema.Types.Mixed,
  }],
  
  // Metadata
  tags: [String],
  attachments: [String],
}, {
  timestamps: true,
});

// Additional indexes for performance
journalEntrySchema.index({ entryNumber: 1 });
journalEntrySchema.index({ status: 1 });
journalEntrySchema.index({ date: -1 });
journalEntrySchema.index({ status: 1, date: -1 });
journalEntrySchema.index({ 'lines.account': 1 });
journalEntrySchema.index({ 'lines.account': 1, date: -1 });
journalEntrySchema.index({ postedBy: 1 });
journalEntrySchema.index({ reference: 1 });
journalEntrySchema.index({ tags: 1 });

// Hash-chain indexes
journalEntrySchema.index({ chainPosition: 1, status: 1 });
journalEntrySchema.index({ hash: 1, prevHash: 1 });
journalEntrySchema.index({ prevHash: 1 });

// Static method to compute hash for an entry
journalEntrySchema.statics.computeHash = function(entryData, prevHash = '0') {
  // Stable field ordering for hash computation
  const stableData = {
    entryNumber: entryData.entryNumber,
    date: entryData.date?.toISOString ? entryData.date.toISOString() : new Date(entryData.date).toISOString(),
    description: entryData.description,
    lines: (entryData.lines || [])
      .map(line => ({
        account: line.account?.toString(),
        debit: line.debit || '0',
        credit: line.credit || '0',
      }))
      .sort((a, b) => a.account.localeCompare(b.account)),
    status: entryData.status,
    reference: entryData.reference || '',
    prevHash: prevHash,
  };

  const payload = JSON.stringify(stableData);
  const hmacSecret = process.env.HMAC_SECRET || 'dev_secret';

  return crypto.createHmac('sha256', hmacSecret).update(payload).digest('hex');
};

// Instance method to verify hash
journalEntrySchema.methods.verifyHash = function() {
  const computedHash = this.constructor.computeHash(this.toObject(), this.prevHash);
  return computedHash === this.hash;
};

// Instance method to verify entire chain from this entry back to genesis
journalEntrySchema.methods.verifyChainFromEntry = async function() {
  const JournalEntry = this.constructor;
  const errors = [];
  let currentEntry = this;

  // Start from this entry and walk backwards
  for (let i = 0; i < 1000; i++) {
    if (!currentEntry.verifyHash()) {
      errors.push({
        position: currentEntry.chainPosition,
        entryNumber: currentEntry.entryNumber,
        issue: 'Hash mismatch',
        expected: currentEntry.hash,
        computed: JournalEntry.computeHash(currentEntry.toObject(), currentEntry.prevHash),
      });
      break;
    }

    // If at genesis (prevHash is '0'), we've verified the chain
    if (currentEntry.prevHash === '0') {
      return {
        isValid: errors.length === 0,
        totalEntriesVerified: i + 1,
        errors,
      };
    }

    // Find previous entry
    currentEntry = await JournalEntry.findOne({ hash: currentEntry.prevHash });

    if (!currentEntry) {
      errors.push({
        position: i,
        issue: 'Previous entry not found',
        prevHash: currentEntry?.prevHash,
      });
      break;
    }
  }

  return {
    isValid: false,
    totalEntriesVerified: 1000,
    errors,
  };
};

// Legacy method for backward compatibility
journalEntrySchema.methods.calculateHash = function() {
  const payload = {
    entryNumber: this.entryNumber || 'TEMP',
    date: this.date.toISOString(),
    description: this.description,
    lines: this.lines,
    prev_hash: this.prev_hash || this.prevHash,
    status: this.status,
  };
  
  const hmac = crypto.createHmac('sha256', process.env.HMAC_SECRET || 'default-secret');
  hmac.update(JSON.stringify(payload));
  return hmac.digest('hex');
};

// Generate entry number and hash
journalEntrySchema.pre('save', async function(next) {
  if (this.isNew && !this.entryNumber) {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await mongoose.model('JournalEntry').countDocuments({
      entryNumber: new RegExp(`^JE-${dateStr}`)
    });
    this.entryNumber = `JE-${dateStr}-${String(count + 1).padStart(4, '0')}`;
  }
  
  // Set chain position for new entries
  if (this.isNew) {
    const lastEntry = await mongoose.model('JournalEntry')
      .findOne({ status: 'posted' })
      .sort({ chainPosition: -1 })
      .select('chainPosition hash');
    
    this.chainPosition = lastEntry ? lastEntry.chainPosition + 1 : 0;
    this.prevHash = lastEntry ? lastEntry.hash : '0';
    this.prev_hash = this.prevHash; // Backward compatibility
  }
  
  // Calculate hash after entryNumber is set
  if (this.isNew || this.isModified('status') || this.isModified('lines')) {
    this.hash = this.constructor.computeHash(this.toObject(), this.prevHash);
    this.immutable_hash = this.hash; // Backward compatibility
    this.hashTimestamp = new Date();
  }
  
  next();
});

export default mongoose.model('JournalEntry', journalEntrySchema);