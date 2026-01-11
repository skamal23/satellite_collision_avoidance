import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ChevronDown, ChevronUp, Clock, Zap, Target } from 'lucide-react';
import type { ConjunctionWarning } from '../types';

interface ConjunctionPanelProps {
  conjunctions: ConjunctionWarning[];
  onConjunctionSelect: (conjunction: ConjunctionWarning) => void;
}

function formatTimeUntil(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = timestamp - now;
  
  if (diff < 0) return 'Passed';
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${(diff / 3600).toFixed(1)}h`;
  return `${(diff / 86400).toFixed(1)}d`;
}

function getRiskLevel(pc: number): { level: 'low' | 'medium' | 'high' | 'critical', color: string, bg: string } {
  if (pc >= 0.001) return { level: 'critical', color: 'var(--accent-danger)', bg: 'rgba(239, 68, 68, 0.15)' };
  if (pc >= 0.0001) return { level: 'high', color: 'var(--accent-warning)', bg: 'rgba(245, 158, 11, 0.15)' };
  if (pc >= 0.00001) return { level: 'medium', color: 'var(--accent-secondary)', bg: 'rgba(139, 92, 246, 0.15)' };
  return { level: 'low', color: 'var(--accent-success)', bg: 'rgba(16, 185, 129, 0.15)' };
}

export function ConjunctionPanel({ conjunctions, onConjunctionSelect }: ConjunctionPanelProps) {
  const [expanded, setExpanded] = useState(true);

  const sortedConjunctions = [...conjunctions].sort((a, b) => {
    // Sort by TCA (soonest first)
    return a.tca - b.tca;
  });

  const criticalCount = conjunctions.filter(c => c.collisionProbability >= 0.0001).length;

  return (
    <motion.aside
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="fixed right-4 top-24 w-80 z-40"
    >
      <div className="glass-panel overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border-glass)]">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <AlertTriangle className={`w-5 h-5 ${criticalCount > 0 ? 'text-[var(--accent-warning)]' : 'text-[var(--accent-success)]'}`} />
              Conjunctions
            </h2>
            <button
              onClick={() => setExpanded(!expanded)}
              className="glass-button p-1.5"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {criticalCount > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 p-2.5 rounded-xl flex items-center gap-2"
              style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)' }}
            >
              <AlertTriangle className="w-4 h-4 text-[var(--accent-warning)]" />
              <span className="text-sm text-[var(--accent-warning)]">
                {criticalCount} high-risk event{criticalCount > 1 ? 's' : ''} detected
              </span>
            </motion.div>
          )}
        </div>

        {/* Conjunction List */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="max-h-96 overflow-y-auto p-2"
            >
              {sortedConjunctions.length === 0 ? (
                <div className="text-center py-8 text-[var(--text-muted)]">
                  <Target className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No conjunctions detected</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedConjunctions.map((conj, idx) => {
                    const risk = getRiskLevel(conj.collisionProbability);
                    
                    return (
                      <motion.button
                        key={`${conj.sat1Id}-${conj.sat2Id}`}
                        layout
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        onClick={() => onConjunctionSelect(conj)}
                        className="w-full text-left p-3 rounded-xl transition-all glass-subtle hover:bg-[var(--bg-glass-hover)]"
                        style={{ borderLeft: `3px solid ${risk.color}` }}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{conj.sat1Name}</div>
                            <div className="text-xs text-[var(--text-muted)]">×</div>
                            <div className="text-sm font-medium truncate">{conj.sat2Name}</div>
                          </div>
                          <div 
                            className="text-xs font-semibold px-2 py-1 rounded-full shrink-0"
                            style={{ background: risk.bg, color: risk.color }}
                          >
                            {risk.level.toUpperCase()}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-[var(--text-muted)]" />
                            <span className="text-[var(--text-secondary)]">{formatTimeUntil(conj.tca)}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Target className="w-3 h-3 text-[var(--text-muted)]" />
                            <span className="text-[var(--text-secondary)]">{conj.missDistance.toFixed(2)} km</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Zap className="w-3 h-3 text-[var(--text-muted)]" />
                            <span className="text-[var(--text-secondary)]">{conj.relativeVelocity.toFixed(1)} km/s</span>
                          </div>
                        </div>

                        <div className="mt-2 text-xs text-mono text-[var(--text-muted)]">
                          Pc: {conj.collisionProbability.toExponential(2)}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}


