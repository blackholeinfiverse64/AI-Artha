import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  HeartPulse,
  ShieldAlert,
  TrendingUp,
} from 'lucide-react';
import api from '../../services/api';
import { Badge, Card, Loading } from '../../components/common';
import SignalStackPanel from '../../components/intelligence/SignalStackPanel';
import SignalDetailEngine from '../../components/intelligence/SignalDetailEngine';

const MOCK_SIGNALS = [
  {
    id: 'sig_001',
    signal_type: 'BUDGET_OVERRUN',
    label: 'Marketing spend exceeded plan',
    severity: 'HIGH',
    reason: 'Actual spend is 28% above planned budget this month.',
    recommendation: 'Freeze non-essential campaigns and re-approve by channel ROI.',
    variance_pct: 28.0,
    planned: 120000,
    actual: 153600,
    department: 'Marketing',
    trend: 'up',
    output: 71,
  },
  {
    id: 'sig_002',
    signal_type: 'PROCUREMENT_DRIFT',
    label: 'Procurement costs trending above baseline',
    severity: 'MEDIUM',
    reason: 'Vendor rates moved up while purchase volume remained flat.',
    recommendation: 'Renegotiate top 3 vendors and enforce PO cap for this cycle.',
    variance_pct: 12.4,
    planned: 260000,
    actual: 292240,
    department: 'Procurement',
    trend: 'up',
    output: 79,
  },
  {
    id: 'sig_003',
    signal_type: 'COLLECTION_LAG',
    label: 'Collections slowing in enterprise segment',
    severity: 'MEDIUM',
    reason: 'Receivable cycle extended by 9 days against target.',
    recommendation: 'Trigger focused follow-ups for invoices beyond 45 days.',
    variance_pct: 9.1,
    planned: 400000,
    actual: 363600,
    department: 'Revenue',
    trend: 'down',
    output: 88,
  },
  {
    id: 'sig_004',
    signal_type: 'EFFICIENCY_STABLE',
    label: 'Operations cost holding near expected band',
    severity: 'LOW',
    reason: 'Variance remains within tolerance despite volume increase.',
    recommendation: 'Maintain current controls and monitor weekly.',
    variance_pct: 3.2,
    planned: 180000,
    actual: 185760,
    department: 'Operations',
    trend: 'flat',
    output: 92,
  },
];

const severityWeight = { HIGH: 22, MEDIUM: 10, LOW: 4 };

function mapSnapshotToSignals(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return [];

  const cashFlow = Number(snapshot.cashFlow || 0);
  const tdsPayable = Number(snapshot.tdsPayable || 0);
  const outputCGST = Number(snapshot.outputCGST || 0);
  const outputSGST = Number(snapshot.outputSGST || 0);
  const totalGst = outputCGST + outputSGST;

  return [
    {
      id: 'sig_snapshot_cashflow',
      signal_type: 'CASH_FLOW_SIGNAL',
      label: cashFlow < 0 ? 'Cash flow pressure detected' : 'Cash flow stable',
      severity: cashFlow < 0 ? 'HIGH' : 'LOW',
      reason:
        cashFlow < 0
          ? 'Ledger snapshot indicates net negative cash flow in selected period.'
          : 'Ledger snapshot indicates positive cash flow momentum.',
      recommendation:
        cashFlow < 0
          ? 'Prioritize collections and delay discretionary spend for 7 days.'
          : 'Sustain current allocation and monitor weekly.',
      variance_pct: cashFlow < 0 ? 18 : 4,
      planned: Math.abs(cashFlow) * 0.9 || 100000,
      actual: Math.abs(cashFlow) || 96000,
      department: 'Treasury',
      trend: cashFlow < 0 ? 'down' : 'up',
      output: cashFlow < 0 ? 62 : 90,
    },
    {
      id: 'sig_snapshot_tax',
      signal_type: 'GST_TDS_LOAD',
      label: 'Tax liability pressure',
      severity: totalGst + tdsPayable > 0 ? 'MEDIUM' : 'LOW',
      reason: 'Current liabilities include GST output and TDS payable balances.',
      recommendation: 'Align payout calendar and keep liability buffers funded.',
      variance_pct: totalGst + tdsPayable > 0 ? 10 : 2,
      planned: Math.max(totalGst * 0.85, 80000),
      actual: Math.max(totalGst, 82000),
      department: 'Compliance',
      trend: totalGst > 0 ? 'up' : 'flat',
      output: 84,
    },
  ];
}

function sanitizeSignal(raw, index) {
  return {
    id: raw.id || `sig_${index + 1}`,
    signal_type: raw.signal_type || 'UNCLASSIFIED_SIGNAL',
    label: raw.label || 'Unlabeled signal',
    severity: ['HIGH', 'MEDIUM', 'LOW'].includes(raw.severity) ? raw.severity : 'LOW',
    reason: raw.reason || 'No reason provided.',
    recommendation: raw.recommendation || 'Review this signal with finance owner.',
    variance_pct: Number(raw.variance_pct || 0),
    planned: Number(raw.planned || 0),
    actual: Number(raw.actual || 0),
    department: raw.department || 'General',
    trend: raw.trend || 'flat',
    output: Number(raw.output || 80),
  };
}

const FinancialIntelligenceDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [signals, setSignals] = useState([]);
  const [selectedSignal, setSelectedSignal] = useState(null);
  const [source, setSource] = useState('api');
  const [errorState, setErrorState] = useState('');

  useEffect(() => {
    const loadSignals = async () => {
      setLoading(true);
      setErrorState('');

      try {
        // Preferred contract from integration requirement.
        const signalsRes = await api.get('/signals');
        const payload = signalsRes?.data?.data;
        const list = Array.isArray(payload) ? payload : payload?.signals;
        if (Array.isArray(list) && list.length) {
          const normalized = list.map(sanitizeSignal);
          setSignals(normalized);
          setSelectedSignal(normalized[0]);
          setSource('api/signals');
          return;
        }
      } catch {
        // fall through to snapshot mapping
      }

      try {
        const snapshotRes = await api.get('/signals/snapshot');
        const mapped = mapSnapshotToSignals(snapshotRes?.data?.data).map(sanitizeSignal);
        if (mapped.length) {
          setSignals(mapped);
          setSelectedSignal(mapped[0]);
          setSource('api/signals/snapshot');
          return;
        }
      } catch {
        // fall through to strict structured mock
      }

      const fallback = MOCK_SIGNALS.map(sanitizeSignal);
      setSignals(fallback);
      setSelectedSignal(fallback[0]);
      setSource('structured-mock');
      setErrorState('Live signal API unavailable. Showing mapped structured fallback.');
      setLoading(false);
    };

    loadSignals().finally(() => setLoading(false));
  }, []);

  const groupedSignals = useMemo(() => {
    const groups = { HIGH: [], MEDIUM: [], LOW: [] };
    [...signals]
      .sort((a, b) => Math.abs(b.variance_pct) - Math.abs(a.variance_pct))
      .forEach((signal) => {
        groups[signal.severity].push(signal);
      });
    return groups;
  }, [signals]);

  const metrics = useMemo(() => {
    if (!signals.length) {
      return {
        healthScore: 100,
        riskLevel: 'LOW',
        activeIssues: 0,
      };
    }

    const penalty = signals.reduce(
      (sum, signal) => sum + (severityWeight[signal.severity] || 0) + Math.min(Math.abs(signal.variance_pct), 20),
      0
    );
    const healthScore = Math.max(0, Math.min(100, Math.round(100 - penalty / Math.max(signals.length, 1))));
    const activeIssues = signals.filter((s) => s.severity !== 'LOW').length;

    let riskLevel = 'LOW';
    if (signals.some((s) => s.severity === 'HIGH') || healthScore < 60) riskLevel = 'HIGH';
    else if (activeIssues > 0 || healthScore < 80) riskLevel = 'MEDIUM';

    return { healthScore, riskLevel, activeIssues };
  }, [signals]);

  const costSummary = useMemo(() => {
    const planned = signals.reduce((sum, s) => sum + s.planned, 0);
    const actual = signals.reduce((sum, s) => sum + s.actual, 0);
    const variancePct = planned > 0 ? ((actual - planned) / planned) * 100 : 0;
    const trendDirection = variancePct > 3 ? 'up' : variancePct < -3 ? 'down' : 'flat';
    return { planned, actual, variancePct, trendDirection };
  }, [signals]);

  const departmentEfficiency = useMemo(() => {
    const bucket = new Map();
    signals.forEach((signal) => {
      const current = bucket.get(signal.department) || { cost: 0, output: 0, count: 0 };
      current.cost += signal.actual;
      current.output += signal.output;
      current.count += 1;
      bucket.set(signal.department, current);
    });

    return [...bucket.entries()].map(([department, stats]) => ({
      department,
      cost: stats.cost,
      output: stats.output / stats.count,
      efficiency: stats.cost > 0 ? (stats.output / stats.cost) * 1000 : 0,
    }));
  }, [signals]);

  if (loading) return <Loading.Page />;

  return (
    <div className="space-y-5 animate-fadeIn">
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <HeartPulse className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Financial Health Score</p>
              <p className="text-2xl font-bold text-foreground">{metrics.healthScore}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Budget Risk Level</p>
              <Badge variant={metrics.riskLevel === 'HIGH' ? 'danger' : metrics.riskLevel === 'MEDIUM' ? 'warning' : 'success'}>
                {metrics.riskLevel}
              </Badge>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active Issues</p>
              <p className="text-2xl font-bold text-foreground">{metrics.activeIssues}</p>
            </div>
          </div>
        </Card>
      </section>

      {errorState && (
        <Card className="p-3 border-warning/40 bg-warning/5">
          <p className="text-sm text-warning">{errorState}</p>
        </Card>
      )}

      <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-3">
          <SignalStackPanel
            groupedSignals={groupedSignals}
            selectedSignalId={selectedSignal?.id}
            onSelectSignal={setSelectedSignal}
          />
        </div>

        <div className="xl:col-span-6 space-y-5">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-foreground">Cost Intelligence View</h2>
              <Badge variant="info">Source: {source}</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Planned</p>
                <p className="text-lg font-semibold text-foreground">Rs {costSummary.planned.toLocaleString()}</p>
              </div>
              <div className="rounded-xl bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Actual</p>
                <p className="text-lg font-semibold text-foreground">Rs {costSummary.actual.toLocaleString()}</p>
              </div>
              <div className="rounded-xl bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Variance</p>
                <p className="text-lg font-semibold text-foreground">
                  {costSummary.variancePct > 0 ? '+' : ''}
                  {costSummary.variancePct.toFixed(1)}%
                </p>
              </div>
            </div>

            <div className="mt-4 p-3 rounded-xl border border-border/60 bg-card">
              <div className="flex items-center gap-2">
                {costSummary.trendDirection === 'up' ? (
                  <ArrowUpRight className="w-4 h-4 text-destructive" />
                ) : costSummary.trendDirection === 'down' ? (
                  <ArrowDownRight className="w-4 h-4 text-success" />
                ) : (
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                )}
                <p className="text-sm font-medium text-foreground">
                  Insight: {costSummary.trendDirection === 'up' ? 'Cost pressure is increasing.' : costSummary.trendDirection === 'down' ? 'Cost efficiency is improving.' : 'Costs are within expected range.'}
                </p>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Reason: Top contributor is {signals[0]?.department || 'N/A'} with {Math.abs(signals[0]?.variance_pct || 0).toFixed(1)}% variance.
              </p>
            </div>

            <div className="mt-4 space-y-2">
              {signals.slice(0, 4).map((signal) => {
                const width = Math.max(8, Math.min(100, Math.abs(signal.variance_pct) * 2.5));
                return (
                  <div key={signal.id}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{signal.department}</span>
                      <span className="text-foreground font-medium">
                        {signal.variance_pct > 0 ? '+' : ''}
                        {signal.variance_pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full ${signal.variance_pct > 0 ? 'bg-destructive/70' : 'bg-success/70'}`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="xl:col-span-3">
          <SignalDetailEngine selectedSignal={selectedSignal} />
        </div>
      </section>

      <section>
        <Card className="p-5">
          <h2 className="text-base font-semibold text-foreground mb-3">Department Efficiency View</h2>
          <div className="space-y-3">
            {departmentEfficiency.map((dept) => (
              <div key={dept.department} className="rounded-xl border border-border/50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-foreground">{dept.department}</p>
                  <p className="text-xs text-muted-foreground">Efficiency {dept.efficiency.toFixed(2)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Cost</p>
                    <p className="font-medium text-foreground">Rs {dept.cost.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Output</p>
                    <p className="font-medium text-foreground">{dept.output.toFixed(1)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
};

export default FinancialIntelligenceDashboard;
