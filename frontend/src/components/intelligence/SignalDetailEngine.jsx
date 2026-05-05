import { useState } from 'react';
import toast from 'react-hot-toast';
import { Send, Lightbulb, ShieldAlert } from 'lucide-react';
import { Card, Badge, Button } from '../common';

const severityBadge = {
  HIGH: 'danger',
  MEDIUM: 'warning',
  LOW: 'success',
};

const SignalDetailEngine = ({ selectedSignal }) => {
  const [sending, setSending] = useState(false);

  const handleSendToSetu = async () => {
    if (!selectedSignal) return;

    setSending(true);
    try {
      // Simulation-only action by default to avoid failing placeholder endpoint calls.
      await Promise.resolve();
      toast.success('Signal queued for SETU (simulation mode).');
    } finally {
      setSending(false);
    }
  };

  if (!selectedSignal) {
    return (
      <Card className="p-4 sticky top-24">
        <h2 className="text-base font-semibold text-foreground mb-2">Signal Engine</h2>
        <p className="text-sm text-muted-foreground">
          Select a signal from the left panel to see reason and recommendation.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4 sticky top-24">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-foreground">Signal Engine</h2>
        <Badge variant={severityBadge[selectedSignal.severity]}>
          {selectedSignal.severity}
        </Badge>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Signal Type</p>
          <p className="text-sm font-medium text-foreground">{selectedSignal.signal_type}</p>
        </div>

        <div className="rounded-xl border border-border/60 p-3 bg-muted/30">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-4 h-4 text-warning" />
            <p className="text-xs font-semibold text-muted-foreground tracking-wide">REASON</p>
          </div>
          <p className="text-sm text-foreground">{selectedSignal.reason}</p>
        </div>

        <div className="rounded-xl border border-border/60 p-3 bg-muted/30">
          <div className="flex items-center gap-2 mb-1">
            <Lightbulb className="w-4 h-4 text-primary" />
            <p className="text-xs font-semibold text-muted-foreground tracking-wide">RECOMMENDATION</p>
          </div>
          <p className="text-sm text-foreground">{selectedSignal.recommendation}</p>
        </div>

        <Button
          variant="primary"
          className="w-full"
          icon={Send}
          loading={sending}
          onClick={handleSendToSetu}
        >
          SEND TO SETU
        </Button>
      </div>
    </Card>
  );
};

export default SignalDetailEngine;
