import { memo, useState, useCallback, useMemo } from 'react';
import { X, Orbit, AlertTriangle, Rocket, Target, Fuel, Check, ChevronDown, Clock, Gauge, Sparkles } from 'lucide-react';
import type { SatelliteInfo, SatellitePosition, ConjunctionWarning, ManeuverResult, SpacecraftParams, OptimizeManeuverResult } from '../types';

interface SatelliteDetailDrawerProps {
  satellite: SatelliteInfo | null;
  position: SatellitePosition | null;
  conjunctions: ConjunctionWarning[];
  onClose: () => void;
  onSimulateManeuver: (
    satelliteId: number,
    deltaV: { x: number; y: number; z: number },
    spacecraft: SpacecraftParams
  ) => Promise<ManeuverResult>;
  onOptimizeManeuver?: (
    satelliteId: number,
    threatId: number,
    targetMissDistance: number,
    timeToTca: number,
    spacecraft: SpacecraftParams
  ) => Promise<OptimizeManeuverResult>;
  onConjunctionSelect: (conjunction: ConjunctionWarning) => void;
}

const defaultSpacecraft: SpacecraftParams = {
  massKg: 1000,
  ispS: 300,
  maxThrustN: 100,
  fuelMassKg: 50,
};

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

function SatelliteDetailDrawerComponent({
  satellite,
  position,
  conjunctions,
  onClose,
  onSimulateManeuver,
  onOptimizeManeuver,
  onConjunctionSelect,
}: SatelliteDetailDrawerProps) {
  const [activeSection, setActiveSection] = useState<'info' | 'conjunctions' | 'maneuver'>('info');
  const [deltaV, setDeltaV] = useState({ x: 0, y: 0, z: 0 });
  const [spacecraft, setSpacecraft] = useState<SpacecraftParams>(defaultSpacecraft);
  const [result, setResult] = useState<ManeuverResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeResult, setOptimizeResult] = useState<OptimizeManeuverResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const altitude = useMemo(() => {
    if (!position) return null;
    const r = Math.sqrt(position.position.x ** 2 + position.position.y ** 2 + position.position.z ** 2);
    return r - 6371;
  }, [position]);

  const velocity = useMemo(() => {
    if (!position) return null;
    return Math.sqrt(position.velocity.x ** 2 + position.velocity.y ** 2 + position.velocity.z ** 2);
  }, [position]);

  const relatedConjunctions = useMemo(() => {
    if (!satellite) return [];
    return conjunctions.filter(c => c.sat1Id === satellite.id || c.sat2Id === satellite.id);
  }, [satellite, conjunctions]);

  const handleSimulate = useCallback(async () => {
    if (!satellite) return;

    setIsSimulating(true);
    setResult(null);

    try {
      const res = await onSimulateManeuver(satellite.id, deltaV, spacecraft);
      setResult(res);
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Simulation failed',
        predictedPath: [],
        newMissDistance: 0,
        totalDeltaV: 0,
        fuelCostKg: 0,
        alternatives: [],
      });
    } finally {
      setIsSimulating(false);
    }
  }, [satellite, deltaV, spacecraft, onSimulateManeuver]);

  const totalDeltaV = Math.sqrt(deltaV.x ** 2 + deltaV.y ** 2 + deltaV.z ** 2);
  const fuelEstimate = spacecraft.massKg * (1 - 1 / Math.exp((totalDeltaV * 1000) / (spacecraft.ispS * 9.80665)));
  const canExecute = fuelEstimate <= spacecraft.fuelMassKg;

  if (!satellite) return null;

  return (
    <div className="detail-drawer">
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer-content">
        {/* Header */}
        <div className="drawer-header">
          <div className="header-info">
            <h2>{satellite.name}</h2>
            <span className="designator">{satellite.intlDesignator}</span>
          </div>
          <button onClick={onClose} className="close-btn">
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="drawer-tabs">
          <button
            className={`drawer-tab ${activeSection === 'info' ? 'active' : ''}`}
            onClick={() => setActiveSection('info')}
          >
            <Orbit size={14} />
            Info
          </button>
          <button
            className={`drawer-tab ${activeSection === 'conjunctions' ? 'active' : ''}`}
            onClick={() => setActiveSection('conjunctions')}
          >
            <AlertTriangle size={14} />
            Alerts
            {relatedConjunctions.length > 0 && (
              <span className="tab-badge">{relatedConjunctions.length}</span>
            )}
          </button>
          <button
            className={`drawer-tab ${activeSection === 'maneuver' ? 'active' : ''}`}
            onClick={() => setActiveSection('maneuver')}
          >
            <Rocket size={14} />
            Maneuver
          </button>
        </div>

        {/* Content */}
        <div className="drawer-body">
          {/* Info Section */}
          {activeSection === 'info' && (
            <div className="section-info">
              <div className="info-grid">
                <div className="info-card">
                  <div className="info-label">Altitude</div>
                  <div className="info-value cyan">{altitude?.toFixed(1) ?? '—'} km</div>
                </div>
                <div className="info-card">
                  <div className="info-label">Velocity</div>
                  <div className="info-value">{velocity?.toFixed(3) ?? '—'} km/s</div>
                </div>
                <div className="info-card">
                  <div className="info-label">Inclination</div>
                  <div className="info-value">{satellite.inclination.toFixed(2)}°</div>
                </div>
                <div className="info-card">
                  <div className="info-label">Period</div>
                  <div className="info-value">{(1440 / satellite.meanMotion).toFixed(1)} min</div>
                </div>
                <div className="info-card">
                  <div className="info-label">Eccentricity</div>
                  <div className="info-value">{satellite.eccentricity.toFixed(6)}</div>
                </div>
                <div className="info-card">
                  <div className="info-label">Mean Motion</div>
                  <div className="info-value">{satellite.meanMotion.toFixed(4)} rev/day</div>
                </div>
              </div>

              {position && (
                <div className="position-section">
                  <h4>Current Position (ECI)</h4>
                  <div className="position-grid">
                    <div><span>X:</span> {position.position.x.toFixed(3)} km</div>
                    <div><span>Y:</span> {position.position.y.toFixed(3)} km</div>
                    <div><span>Z:</span> {position.position.z.toFixed(3)} km</div>
                  </div>
                  <h4>Velocity (ECI)</h4>
                  <div className="position-grid">
                    <div><span>Vx:</span> {position.velocity.x.toFixed(4)} km/s</div>
                    <div><span>Vy:</span> {position.velocity.y.toFixed(4)} km/s</div>
                    <div><span>Vz:</span> {position.velocity.z.toFixed(4)} km/s</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Conjunctions Section */}
          {activeSection === 'conjunctions' && (
            <div className="section-conjunctions">
              {relatedConjunctions.length === 0 ? (
                <div className="empty-conjunctions">
                  <AlertTriangle size={24} />
                  <p>No active conjunction warnings</p>
                  <span>This satellite has no predicted close approaches</span>
                </div>
              ) : (
                <div className="conjunction-list">
                  {relatedConjunctions.map((c, i) => {
                    const riskLevel = getRiskLevel(c.collisionProbability);
                    const otherSat = c.sat1Id === satellite.id ? c.sat2Name : c.sat1Name;
                    return (
                      <button
                        key={i}
                        className={`conjunction-card ${riskLevel}`}
                        onClick={() => onConjunctionSelect(c)}
                      >
                        <div className="conj-header">
                          <span className="other-sat">× {otherSat}</span>
                          <span className={`risk-badge ${riskLevel}`}>{riskLevel}</span>
                        </div>
                        <div className="conj-metrics">
                          <div className="metric">
                            <Clock size={11} />
                            {formatTime(c.tca)}
                          </div>
                          <div className="metric">
                            <Target size={11} />
                            {c.missDistance.toFixed(2)} km
                          </div>
                          <div className="metric">
                            <Gauge size={11} />
                            {c.relativeVelocity.toFixed(1)} km/s
                          </div>
                        </div>
                        <div className="conj-probability">
                          Pc: {c.collisionProbability.toExponential(2)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Maneuver Section */}
          {activeSection === 'maneuver' && (
            <div className="section-maneuver">
              {/* Active Conjunction Quick Actions */}
              {relatedConjunctions.length > 0 && onOptimizeManeuver && (
                <div className="optimize-section">
                  <h4><Sparkles size={12} /> Quick Optimization</h4>
                  <p className="optimize-hint">
                    Calculate optimal δV to avoid the closest threat
                  </p>
                  <button
                    onClick={async () => {
                      if (!satellite || relatedConjunctions.length === 0) return;
                      setIsOptimizing(true);
                      setOptimizeResult(null);
                      try {
                        const threat = relatedConjunctions[0];
                        const threatId = threat.sat1Id === satellite.id ? threat.sat2Id : threat.sat1Id;
                        const res = await onOptimizeManeuver(
                          satellite.id,
                          threatId,
                          10, // Target 10km miss distance
                          threat.tca,
                          spacecraft
                        );
                        setOptimizeResult(res);
                        if (res.success) {
                          setDeltaV(res.recommendedDeltaV);
                        }
                      } finally {
                        setIsOptimizing(false);
                      }
                    }}
                    disabled={isOptimizing}
                    className="optimize-btn"
                  >
                    <Sparkles size={14} />
                    {isOptimizing ? 'Calculating...' : 'Calculate Optimal δV'}
                  </button>
                  {optimizeResult && (
                    <div className={`optimize-result ${optimizeResult.success ? 'success' : 'failure'}`}>
                      {optimizeResult.success ? (
                        <>
                          <div className="optimize-result-header">
                            <Check size={12} /> Optimal maneuver found
                          </div>
                          <div className="optimize-details">
                            <span>δV: {(optimizeResult.totalDeltaV * 1000).toFixed(1)} m/s</span>
                            <span>Fuel: {optimizeResult.fuelCostKg.toFixed(2)} kg</span>
                            <span>New miss: {optimizeResult.expectedMissDistance.toFixed(1)} km</span>
                          </div>
                          {optimizeResult.alternatives.length > 0 && (
                            <div className="optimize-alts">
                              <span className="alts-label">{optimizeResult.alternatives.length} alternatives available</span>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="optimize-result-header error">
                          <X size={12} /> {optimizeResult.message}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Delta-V Inputs */}
              <div className="maneuver-group">
                <h4>Delta-V (km/s)</h4>
                <div className="dv-inputs">
                  {(['x', 'y', 'z'] as const).map(axis => (
                    <div key={axis} className="dv-input">
                      <label>{axis.toUpperCase()} (RIC)</label>
                      <input
                        type="number"
                        step="0.001"
                        value={deltaV[axis]}
                        onChange={(e) => setDeltaV(prev => ({ ...prev, [axis]: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                  ))}
                </div>
                <div className="dv-total">
                  Total: {(totalDeltaV * 1000).toFixed(1)} m/s
                </div>
              </div>

              {/* Advanced Parameters */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="advanced-toggle"
              >
                <ChevronDown size={12} style={{ transform: showAdvanced ? 'rotate(180deg)' : 'none' }} />
                Spacecraft Parameters
              </button>

              {showAdvanced && (
                <div className="spacecraft-params">
                  <div className="param-grid">
                    <div className="param">
                      <label>Mass (kg)</label>
                      <input
                        type="number"
                        value={spacecraft.massKg}
                        onChange={(e) => setSpacecraft(prev => ({ ...prev, massKg: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                    <div className="param">
                      <label>Isp (s)</label>
                      <input
                        type="number"
                        value={spacecraft.ispS}
                        onChange={(e) => setSpacecraft(prev => ({ ...prev, ispS: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                    <div className="param">
                      <label>Thrust (N)</label>
                      <input
                        type="number"
                        value={spacecraft.maxThrustN}
                        onChange={(e) => setSpacecraft(prev => ({ ...prev, maxThrustN: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                    <div className="param">
                      <label>Fuel (kg)</label>
                      <input
                        type="number"
                        value={spacecraft.fuelMassKg}
                        onChange={(e) => setSpacecraft(prev => ({ ...prev, fuelMassKg: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Fuel Estimate */}
              <div className={`fuel-estimate ${canExecute ? 'feasible' : 'infeasible'}`}>
                <Fuel size={14} />
                <span>
                  Est. fuel: <strong>{fuelEstimate.toFixed(2)} kg</strong>
                </span>
                {!canExecute && (
                  <span className="warning">Insufficient ({spacecraft.fuelMassKg} kg available)</span>
                )}
              </div>

              {/* Simulate Button */}
              <button
                onClick={handleSimulate}
                disabled={isSimulating || totalDeltaV === 0}
                className="simulate-btn"
              >
                {isSimulating ? 'Simulating...' : 'Simulate Maneuver'}
              </button>

              {/* Result */}
              {result && (
                <div className={`maneuver-result ${result.success ? 'success' : 'failure'}`}>
                  <div className="result-header">
                    <Check size={14} />
                    <span>{result.success ? 'Maneuver Feasible' : 'Maneuver Failed'}</span>
                  </div>
                  <p>{result.message}</p>
                  {result.success && result.newMissDistance > 0 && (
                    <div className="new-miss">
                      <Target size={12} />
                      New miss distance: <strong>{result.newMissDistance.toFixed(2)} km</strong>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .detail-drawer {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          top: 0;
          z-index: 300;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }

        .drawer-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
        }

        .drawer-content {
          position: relative;
          width: 100%;
          max-width: 600px;
          max-height: 70vh;
          background: rgba(10, 15, 25, 0.95);
          backdrop-filter: blur(24px);
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px 20px 0 0;
          display: flex;
          flex-direction: column;
          animation: slideUp 0.3s ease;
        }

        @keyframes slideUp {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .drawer-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 20px 20px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .header-info h2 {
          font-size: 18px;
          font-weight: 600;
          color: white;
          margin: 0 0 4px;
        }

        .designator {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.5);
        }

        .close-btn {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: rgba(255, 255, 255, 0.7);
          cursor: pointer;
        }

        .close-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: white;
        }

        .drawer-tabs {
          display: flex;
          padding: 0 20px;
          gap: 4px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .drawer-tab {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 12px 16px;
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          font-size: 13px;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          transition: all 0.15s ease;
        }

        .drawer-tab:hover {
          color: rgba(255, 255, 255, 0.8);
        }

        .drawer-tab.active {
          color: var(--accent-cyan, #00d4ff);
          border-bottom-color: var(--accent-cyan, #00d4ff);
        }

        .tab-badge {
          padding: 2px 6px;
          background: var(--accent-red, #ff4444);
          border-radius: 10px;
          font-size: 10px;
          font-weight: 600;
          color: white;
        }

        .drawer-body {
          flex: 1;
          overflow-y: auto;
          padding: 16px 20px 20px;
        }

        /* Info Section */
        .info-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-bottom: 20px;
        }

        .info-card {
          padding: 12px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 10px;
        }

        .info-label {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.4);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }

        .info-value {
          font-size: 15px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
          font-variant-numeric: tabular-nums;
        }

        .info-value.cyan {
          color: var(--accent-cyan, #00d4ff);
        }

        .position-section {
          padding: 16px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 12px;
        }

        .position-section h4 {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          text-transform: uppercase;
          margin: 0 0 8px;
        }

        .position-section h4:not(:first-child) {
          margin-top: 16px;
        }

        .position-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.8);
          font-variant-numeric: tabular-nums;
        }

        .position-grid span {
          color: rgba(255, 255, 255, 0.4);
          margin-right: 4px;
        }

        /* Conjunctions Section */
        .empty-conjunctions {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 40px 20px;
          text-align: center;
          color: rgba(255, 255, 255, 0.4);
        }

        .empty-conjunctions svg {
          opacity: 0.3;
          margin-bottom: 12px;
        }

        .empty-conjunctions p {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.6);
          margin: 0 0 4px;
        }

        .empty-conjunctions span {
          font-size: 12px;
        }

        .conjunction-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .conjunction-card {
          padding: 14px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          text-align: left;
          width: 100%;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .conjunction-card:hover {
          background: rgba(255, 255, 255, 0.06);
        }

        .conjunction-card.critical {
          border-left: 3px solid #ff3b3b;
        }

        .conjunction-card.high {
          border-left: 3px solid #ff8800;
        }

        .conjunction-card.medium {
          border-left: 3px solid #ffcc00;
        }

        .conjunction-card.low {
          border-left: 3px solid #00ff88;
        }

        .conj-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }

        .other-sat {
          font-size: 14px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.9);
        }

        .risk-badge {
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .risk-badge.critical { background: rgba(255, 59, 59, 0.2); color: #ff3b3b; }
        .risk-badge.high { background: rgba(255, 136, 0, 0.2); color: #ff8800; }
        .risk-badge.medium { background: rgba(255, 204, 0, 0.2); color: #ffcc00; }
        .risk-badge.low { background: rgba(0, 255, 136, 0.2); color: #00ff88; }

        .conj-metrics {
          display: flex;
          gap: 16px;
          margin-bottom: 8px;
        }

        .conj-metrics .metric {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.6);
        }

        .conj-probability {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.4);
          font-family: 'SF Mono', Monaco, monospace;
        }

        /* Maneuver Section */
        .section-maneuver {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .optimize-section {
          padding: 14px;
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(0, 212, 255, 0.05));
          border: 1px solid rgba(139, 92, 246, 0.2);
          border-radius: 12px;
        }

        .optimize-section h4 {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 600;
          color: rgba(139, 92, 246, 1);
          margin: 0 0 8px;
        }

        .optimize-hint {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          margin: 0 0 12px;
        }

        .optimize-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 10px 16px;
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.8), rgba(59, 130, 246, 0.8));
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .optimize-btn:hover {
          background: linear-gradient(135deg, rgba(139, 92, 246, 1), rgba(59, 130, 246, 1));
          box-shadow: 0 4px 20px rgba(139, 92, 246, 0.3);
        }

        .optimize-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .optimize-result {
          margin-top: 12px;
          padding: 10px 12px;
          border-radius: 8px;
        }

        .optimize-result.success {
          background: rgba(0, 255, 136, 0.1);
          border: 1px solid rgba(0, 255, 136, 0.2);
        }

        .optimize-result.failure {
          background: rgba(255, 68, 68, 0.1);
          border: 1px solid rgba(255, 68, 68, 0.2);
        }

        .optimize-result-header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 600;
          color: var(--accent-green, #00ff88);
          margin-bottom: 8px;
        }

        .optimize-result-header.error {
          color: var(--accent-red, #ff4444);
        }

        .optimize-details {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.7);
        }

        .optimize-alts {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .alts-label {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.4);
        }

        .maneuver-group h4 {
          font-size: 12px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.8);
          margin: 0 0 10px;
        }

        .dv-inputs {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }

        .dv-input label {
          display: block;
          font-size: 10px;
          color: rgba(255, 255, 255, 0.4);
          margin-bottom: 4px;
        }

        .dv-input input,
        .param input {
          width: 100%;
          padding: 8px 10px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: white;
          font-size: 13px;
          font-variant-numeric: tabular-nums;
        }

        .dv-input input:focus,
        .param input:focus {
          outline: none;
          border-color: rgba(0, 212, 255, 0.5);
        }

        .dv-total {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          margin-top: 8px;
        }

        .advanced-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0;
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          font-size: 11px;
          cursor: pointer;
        }

        .advanced-toggle:hover {
          color: rgba(255, 255, 255, 0.8);
        }

        .advanced-toggle svg {
          transition: transform 0.2s ease;
        }

        .spacecraft-params {
          padding: 12px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 10px;
        }

        .param-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }

        .param label {
          display: block;
          font-size: 10px;
          color: rgba(255, 255, 255, 0.4);
          margin-bottom: 4px;
        }

        .fuel-estimate {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          border-radius: 10px;
          font-size: 12px;
        }

        .fuel-estimate.feasible {
          background: rgba(0, 255, 136, 0.1);
          border: 1px solid rgba(0, 255, 136, 0.2);
          color: var(--accent-green, #00ff88);
        }

        .fuel-estimate.infeasible {
          background: rgba(255, 68, 68, 0.1);
          border: 1px solid rgba(255, 68, 68, 0.2);
          color: var(--accent-red, #ff4444);
        }

        .fuel-estimate .warning {
          font-size: 10px;
          opacity: 0.8;
        }

        .simulate-btn {
          width: 100%;
          padding: 12px 16px;
          background: var(--accent-cyan, #00d4ff);
          border: none;
          border-radius: 10px;
          color: rgba(10, 15, 25, 0.95);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .simulate-btn:hover {
          background: var(--accent-green, #00ff88);
        }

        .simulate-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .maneuver-result {
          padding: 14px;
          border-radius: 12px;
        }

        .maneuver-result.success {
          background: rgba(0, 255, 136, 0.1);
          border: 1px solid rgba(0, 255, 136, 0.2);
        }

        .maneuver-result.failure {
          background: rgba(255, 68, 68, 0.1);
          border: 1px solid rgba(255, 68, 68, 0.2);
        }

        .result-header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 6px;
        }

        .maneuver-result.success .result-header {
          color: var(--accent-green, #00ff88);
        }

        .maneuver-result.failure .result-header {
          color: var(--accent-red, #ff4444);
        }

        .maneuver-result p {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.7);
          margin: 0 0 8px;
        }

        .new-miss {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.6);
        }

        .new-miss strong {
          color: var(--accent-green, #00ff88);
        }
      `}</style>
    </div>
  );
}

export const SatelliteDetailDrawer = memo(SatelliteDetailDrawerComponent);
