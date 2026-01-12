import { AlertTriangle, Clock, Target, Zap } from 'lucide-react';
import { DraggablePanel } from './DraggablePanel';
import type { ConjunctionWarning } from '../types';

interface ConjunctionPanelProps {
  conjunctions: ConjunctionWarning[];
  onConjunctionSelect: (conjunction: ConjunctionWarning) => void;
}

function getRiskLevel(pc: number): 'critical' | 'high' | 'medium' | 'low' {
  if (pc > 1e-3) return 'critical';
  if (pc > 1e-4) return 'high';
  if (pc > 1e-5) return 'medium';
  return 'low';
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export function ConjunctionPanel({
  conjunctions,
  onConjunctionSelect,
}: ConjunctionPanelProps) {
  const highRiskCount = conjunctions.filter(c => 
    getRiskLevel(c.collisionProbability) === 'critical' || 
    getRiskLevel(c.collisionProbability) === 'high'
  ).length;

  return (
    <DraggablePanel
      title="Conjunctions"
      icon={<AlertTriangle size={16} style={{ color: 'var(--risk-high)' }} />}
      defaultPosition={{ x: typeof window !== 'undefined' ? window.innerWidth - 340 : 800, y: 80 }}
    >
      {/* Warning Summary */}
      {highRiskCount > 0 && (
        <div 
          className="flex items-center gap-2 p-3 rounded-xl mb-3"
          style={{ 
            background: 'rgba(255, 59, 48, 0.1)',
            border: '1px solid rgba(255, 59, 48, 0.2)'
          }}
        >
          <AlertTriangle size={16} style={{ color: 'var(--risk-critical)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--risk-critical)' }}>
            {highRiskCount} high-risk event{highRiskCount > 1 ? 's' : ''} detected
          </span>
        </div>
      )}

      {/* Conjunction List */}
      <div className="space-y-2">
        {conjunctions.map((conj, idx) => {
          const risk = getRiskLevel(conj.collisionProbability);
          
          return (
            <button
              key={idx}
              onClick={() => onConjunctionSelect(conj)}
              className={`conjunction-item ${risk}`}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                    {conj.sat1Name}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    × {conj.sat2Name}
                  </div>
                </div>
                <span className={`risk-badge ${risk}`}>
                  {risk}
                </span>
              </div>

              {/* Details */}
              <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <div className="flex items-center gap-1">
                  <Clock size={12} style={{ color: 'var(--text-muted)' }} />
                  {formatTime(conj.tca)}
                </div>
                <div className="flex items-center gap-1">
                  <Target size={12} style={{ color: 'var(--text-muted)' }} />
                  {conj.missDistance.toFixed(2)} km
                </div>
                <div className="flex items-center gap-1">
                  <Zap size={12} style={{ color: 'var(--text-muted)' }} />
                  {conj.relativeVelocity.toFixed(1)} km/s
                </div>
              </div>

              {/* Probability */}
              <div className="mt-2 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                Pc: {conj.collisionProbability.toExponential(2)}
              </div>
            </button>
          );
        })}
      </div>

      {conjunctions.length === 0 && (
        <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
          <AlertTriangle size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No conjunction warnings</p>
        </div>
      )}
    </DraggablePanel>
  );
}
