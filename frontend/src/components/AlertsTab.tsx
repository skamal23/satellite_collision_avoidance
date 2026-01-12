import { useMemo, memo, useCallback } from 'react';
import { Clock, Target, Gauge, ShieldAlert, TrendingUp } from 'lucide-react';
import type { ConjunctionWarning } from '../types';

interface AlertsTabProps {
  conjunctions: ConjunctionWarning[];
  onConjunctionSelect: (conjunction: ConjunctionWarning) => void;
}

const formatTime = (seconds: number) => {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 3600 * 24) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / (3600 * 24)).toFixed(1)}d`;
};

const getRiskLevel = (pc: number): 'critical' | 'high' | 'medium' | 'low' => {
  if (pc > 1e-3) return 'critical';
  if (pc > 1e-4) return 'high';
  if (pc > 1e-5) return 'medium';
  return 'low';
};

const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 };

const AlertItem = memo(function AlertItem({
  conjunction,
  riskLevel,
  onSelect,
}: {
  conjunction: ConjunctionWarning;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`alert-item ${riskLevel}`}
    >
      <div className="alert-header">
        <div className="alert-satellites">
          <span className="primary-sat">{conjunction.sat1Name}</span>
          <span className="vs">×</span>
          <span className="secondary-sat">{conjunction.sat2Name}</span>
        </div>
        <span className={`risk-badge ${riskLevel}`}>
          {riskLevel}
        </span>
      </div>

      <div className="alert-metrics">
        <div className="metric">
          <Clock size={11} />
          <span className="metric-value">{formatTime(conjunction.tca)}</span>
          <span className="metric-label">TCA</span>
        </div>
        <div className="metric">
          <Target size={11} />
          <span className="metric-value">{conjunction.missDistance.toFixed(2)}</span>
          <span className="metric-label">km</span>
        </div>
        <div className="metric">
          <Gauge size={11} />
          <span className="metric-value">{conjunction.relativeVelocity.toFixed(1)}</span>
          <span className="metric-label">km/s</span>
        </div>
        <div className="metric probability">
          <TrendingUp size={11} />
          <span className="metric-value">{conjunction.collisionProbability.toExponential(1)}</span>
          <span className="metric-label">Pc</span>
        </div>
      </div>
    </button>
  );
});

function AlertsTabComponent({ conjunctions, onConjunctionSelect }: AlertsTabProps) {
  const sortedConjunctions = useMemo(() => {
    return [...conjunctions].sort((a, b) => {
      const aRisk = getRiskLevel(a.collisionProbability);
      const bRisk = getRiskLevel(b.collisionProbability);
      return riskOrder[aRisk] - riskOrder[bRisk];
    });
  }, [conjunctions]);

  const stats = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    conjunctions.forEach(c => {
      counts[getRiskLevel(c.collisionProbability)]++;
    });
    return counts;
  }, [conjunctions]);

  const handleSelect = useCallback((conjunction: ConjunctionWarning) => {
    onConjunctionSelect(conjunction);
  }, [onConjunctionSelect]);

  return (
    <div className="tab-content alerts-tab">
      {/* Summary Bar */}
      <div className="alerts-summary">
        <div className="summary-icon">
          <ShieldAlert size={18} />
        </div>
        <div className="summary-stats">
          {stats.critical > 0 && (
            <span className="stat critical">{stats.critical} critical</span>
          )}
          {stats.high > 0 && (
            <span className="stat high">{stats.high} high</span>
          )}
          {stats.medium > 0 && (
            <span className="stat medium">{stats.medium} medium</span>
          )}
          {stats.low > 0 && (
            <span className="stat low">{stats.low} low</span>
          )}
          {conjunctions.length === 0 && (
            <span className="stat none">No active alerts</span>
          )}
        </div>
        <div className="summary-total">
          {conjunctions.length} total
        </div>
      </div>

      {/* Alert List */}
      <div className="tab-list">
        {sortedConjunctions.map((c, index) => (
          <AlertItem
            key={`${c.sat1Id}-${c.sat2Id}-${index}`}
            conjunction={c}
            riskLevel={getRiskLevel(c.collisionProbability)}
            onSelect={() => handleSelect(c)}
          />
        ))}
        {conjunctions.length === 0 && (
          <div className="empty-state">
            <ShieldAlert size={32} />
            <p>No conjunction warnings</p>
            <span>All tracked satellites are at safe distances</span>
          </div>
        )}
      </div>

      <style>{`
        .alerts-tab {
          display: flex;
          flex-direction: column;
          height: 100%;
          padding: 12px 16px;
          gap: 12px;
        }

        .alerts-summary {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          background: rgba(255, 68, 68, 0.08);
          border: 1px solid rgba(255, 68, 68, 0.15);
          border-radius: 10px;
          flex-shrink: 0;
        }

        .summary-icon {
          color: var(--accent-red, #ff4444);
        }

        .summary-stats {
          display: flex;
          gap: 12px;
          flex: 1;
        }

        .stat {
          font-size: 12px;
          font-weight: 500;
        }

        .stat.critical { color: #ff3b3b; }
        .stat.high { color: #ff8800; }
        .stat.medium { color: #ffcc00; }
        .stat.low { color: #00ff88; }
        .stat.none { color: rgba(255, 255, 255, 0.5); }

        .summary-total {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.4);
        }

        .tab-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .alert-item {
          padding: 12px 14px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: left;
          width: 100%;
        }

        .alert-item:hover {
          background: rgba(255, 255, 255, 0.06);
        }

        .alert-item.critical {
          border-left: 3px solid #ff3b3b;
          background: rgba(255, 59, 59, 0.05);
        }

        .alert-item.high {
          border-left: 3px solid #ff8800;
          background: rgba(255, 136, 0, 0.05);
        }

        .alert-item.medium {
          border-left: 3px solid #ffcc00;
        }

        .alert-item.low {
          border-left: 3px solid #00ff88;
        }

        .alert-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 10px;
        }

        .alert-satellites {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .primary-sat {
          font-size: 13px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.95);
        }

        .vs {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.3);
        }

        .secondary-sat {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.6);
        }

        .risk-badge {
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .risk-badge.critical {
          background: rgba(255, 59, 59, 0.2);
          color: #ff3b3b;
        }

        .risk-badge.high {
          background: rgba(255, 136, 0, 0.2);
          color: #ff8800;
        }

        .risk-badge.medium {
          background: rgba(255, 204, 0, 0.2);
          color: #ffcc00;
        }

        .risk-badge.low {
          background: rgba(0, 255, 136, 0.2);
          color: #00ff88;
        }

        .alert-metrics {
          display: flex;
          gap: 16px;
        }

        .metric {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
        }

        .metric svg {
          opacity: 0.6;
        }

        .metric-value {
          color: rgba(255, 255, 255, 0.85);
          font-weight: 500;
          font-variant-numeric: tabular-nums;
        }

        .metric-label {
          opacity: 0.6;
        }

        .metric.probability .metric-value {
          font-family: 'SF Mono', Monaco, monospace;
          font-size: 10px;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          text-align: center;
          color: rgba(255, 255, 255, 0.4);
          gap: 8px;
        }

        .empty-state svg {
          opacity: 0.3;
          margin-bottom: 8px;
        }

        .empty-state p {
          font-size: 14px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.6);
          margin: 0;
        }

        .empty-state span {
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}

export const AlertsTab = memo(AlertsTabComponent);
