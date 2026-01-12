import { AlertTriangle, Clock, Target, Gauge } from 'lucide-react';
import { SidebarPanel } from './SidebarPanel';
import type { ConjunctionWarning } from '../types';

interface ConjunctionPanelProps {
  conjunctions: ConjunctionWarning[];
  onConjunctionSelect: (conjunction: ConjunctionWarning) => void;
}

export function ConjunctionPanel({ conjunctions, onConjunctionSelect }: ConjunctionPanelProps) {
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

  const sortedConjunctions = [...conjunctions].sort((a, b) => {
    const aRisk = getRiskLevel(a.collisionProbability);
    const bRisk = getRiskLevel(b.collisionProbability);
    const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return riskOrder[aRisk] - riskOrder[bRisk];
  });

  return (
    <SidebarPanel
      title="Conjunctions"
      icon={<AlertTriangle size={16} />}
      side="right"
      defaultPosition={{ x: typeof window !== 'undefined' ? window.innerWidth - 340 : 1000, y: 100 }}
    >
      {/* Summary */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 8, 
        marginBottom: 12,
        padding: '8px 10px',
        background: 'rgba(255, 68, 68, 0.1)',
        borderRadius: 8,
        fontSize: 12,
        color: 'var(--text-secondary)'
      }}>
        <AlertTriangle size={14} style={{ color: 'var(--accent-red)' }} />
        <span>
          <strong style={{ color: 'var(--text-primary)' }}>{conjunctions.length}</strong> high-risk events
        </span>
      </div>

      {/* Conjunction List */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {sortedConjunctions.map((c, index) => {
          const riskLevel = getRiskLevel(c.collisionProbability);
          
          return (
            <button
              key={index}
              onClick={() => onConjunctionSelect(c)}
              className={`conjunction-item ${riskLevel}`}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', marginBottom: 2 }}>
                    {c.sat1Name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    × {c.sat2Name}
                  </div>
                </div>
                <span className={`risk-badge ${riskLevel}`}>
                  {riskLevel}
                </span>
              </div>

              {/* Metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                  <Clock size={11} />
                  {formatTime(c.tca)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                  <Target size={11} />
                  {c.missDistance.toFixed(2)} km
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)' }}>
                  <Gauge size={11} />
                  {c.relativeVelocity.toFixed(1)} km/s
                </div>
              </div>

              {/* Probability */}
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: "'SF Mono', Monaco, monospace" }}>
                Pc: {c.collisionProbability.toExponential(2)}
              </div>
            </button>
          );
        })}
      </div>

      {conjunctions.length === 0 && (
        <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
          No conjunction warnings
        </div>
      )}
    </SidebarPanel>
  );
}
