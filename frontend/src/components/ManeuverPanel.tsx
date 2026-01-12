import { memo, useState, useCallback } from 'react';
import { Rocket, Target, Fuel, AlertTriangle, Check, X } from 'lucide-react';
import { SidebarPanel } from './SidebarPanel';
import type { SatelliteInfo, ConjunctionWarning, ManeuverResult, SpacecraftParams } from '../types';

interface ManeuverPanelProps {
  selectedSatellite: SatelliteInfo | null;
  activeConjunction: ConjunctionWarning | null;
  onSimulateManeuver: (
    satelliteId: number,
    deltaV: { x: number; y: number; z: number },
    spacecraft: SpacecraftParams
  ) => Promise<ManeuverResult>;
}

const defaultSpacecraft: SpacecraftParams = {
  massKg: 1000,
  ispS: 300,
  maxThrustN: 100,
  fuelMassKg: 50,
};

function ManeuverPanelComponent({
  selectedSatellite,
  activeConjunction,
  onSimulateManeuver,
}: ManeuverPanelProps) {
  const [deltaV, setDeltaV] = useState({ x: 0, y: 0, z: 0 });
  const [spacecraft, setSpacecraft] = useState<SpacecraftParams>(defaultSpacecraft);
  const [result, setResult] = useState<ManeuverResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSimulate = useCallback(async () => {
    if (!selectedSatellite) return;
    
    setIsSimulating(true);
    setResult(null);
    
    try {
      const res = await onSimulateManeuver(selectedSatellite.id, deltaV, spacecraft);
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
  }, [selectedSatellite, deltaV, spacecraft, onSimulateManeuver]);

  const totalDeltaV = Math.sqrt(deltaV.x ** 2 + deltaV.y ** 2 + deltaV.z ** 2);
  const fuelEstimate = spacecraft.massKg * (1 - 1 / Math.exp((totalDeltaV * 1000) / (spacecraft.ispS * 9.80665)));
  const canExecute = fuelEstimate <= spacecraft.fuelMassKg;

  return (
    <SidebarPanel
      title="Maneuver"
      icon={<Rocket size={16} />}
      side="right"
      defaultPosition={{ x: typeof window !== 'undefined' ? window.innerWidth - 360 : 1000, y: 500 }}
      defaultSize={{ width: 320, height: 400 }}
    >
      {!selectedSatellite ? (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
          Select a satellite to plan a maneuver
        </div>
      ) : (
        <div style={{ padding: 12 }}>
          {/* Target info */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
              {selectedSatellite.name}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {selectedSatellite.intlDesignator}
            </div>
          </div>

          {/* Active conjunction warning */}
          {activeConjunction && (
            <div style={{
              padding: 10,
              marginBottom: 16,
              background: 'rgba(255, 68, 68, 0.1)',
              borderRadius: 10,
              border: '1px solid rgba(255, 68, 68, 0.3)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--accent-red)', marginBottom: 6 }}>
                <AlertTriangle size={12} />
                Active Conjunction
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                vs {activeConjunction.sat2Name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Miss: {activeConjunction.missDistance.toFixed(2)} km • 
                Pc: {activeConjunction.collisionProbability.toExponential(2)}
              </div>
            </div>
          )}

          {/* Delta-V inputs */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
              Delta-V (km/s)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {(['x', 'y', 'z'] as const).map(axis => (
                <div key={axis}>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>
                    {axis.toUpperCase()} (RIC)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={deltaV[axis]}
                    onChange={(e) => setDeltaV(prev => ({ ...prev, [axis]: parseFloat(e.target.value) || 0 }))}
                    className="glass-input"
                    style={{ fontSize: 12, padding: '6px 8px' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              Total: {(totalDeltaV * 1000).toFixed(1)} m/s
            </div>
          </div>

          {/* Advanced spacecraft params */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 11,
              cursor: 'pointer',
              padding: 0,
              marginBottom: 12,
            }}
          >
            {showAdvanced ? '▼' : '▶'} Spacecraft Parameters
          </button>

          {showAdvanced && (
            <div style={{ marginBottom: 16, padding: 10, background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Mass (kg)</label>
                  <input
                    type="number"
                    value={spacecraft.massKg}
                    onChange={(e) => setSpacecraft(prev => ({ ...prev, massKg: parseFloat(e.target.value) || 0 }))}
                    className="glass-input"
                    style={{ fontSize: 11, padding: '4px 6px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Isp (s)</label>
                  <input
                    type="number"
                    value={spacecraft.ispS}
                    onChange={(e) => setSpacecraft(prev => ({ ...prev, ispS: parseFloat(e.target.value) || 0 }))}
                    className="glass-input"
                    style={{ fontSize: 11, padding: '4px 6px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Thrust (N)</label>
                  <input
                    type="number"
                    value={spacecraft.maxThrustN}
                    onChange={(e) => setSpacecraft(prev => ({ ...prev, maxThrustN: parseFloat(e.target.value) || 0 }))}
                    className="glass-input"
                    style={{ fontSize: 11, padding: '4px 6px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: 'var(--text-muted)' }}>Fuel (kg)</label>
                  <input
                    type="number"
                    value={spacecraft.fuelMassKg}
                    onChange={(e) => setSpacecraft(prev => ({ ...prev, fuelMassKg: parseFloat(e.target.value) || 0 }))}
                    className="glass-input"
                    style={{ fontSize: 11, padding: '4px 6px' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Fuel estimate */}
          <div style={{
            padding: 10,
            marginBottom: 16,
            background: canExecute ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 68, 68, 0.1)',
            borderRadius: 8,
            border: `1px solid ${canExecute ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 68, 68, 0.3)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <Fuel size={14} style={{ color: canExecute ? 'var(--accent-green)' : 'var(--accent-red)' }} />
              <span style={{ color: 'var(--text-secondary)' }}>
                Est. fuel: <strong style={{ color: canExecute ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                  {fuelEstimate.toFixed(2)} kg
                </strong>
              </span>
            </div>
            {!canExecute && (
              <div style={{ fontSize: 10, color: 'var(--accent-red)', marginTop: 4 }}>
                Insufficient fuel ({spacecraft.fuelMassKg} kg available)
              </div>
            )}
          </div>

          {/* Simulate button */}
          <button
            onClick={handleSimulate}
            disabled={isSimulating || totalDeltaV === 0}
            className="glass-btn"
            style={{
              width: '100%',
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              opacity: (isSimulating || totalDeltaV === 0) ? 0.5 : 1,
            }}
          >
            {isSimulating ? 'Simulating...' : 'Simulate Maneuver'}
          </button>

          {/* Result */}
          {result && (
            <div style={{
              marginTop: 16,
              padding: 12,
              background: result.success ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 68, 68, 0.1)',
              borderRadius: 10,
              border: `1px solid ${result.success ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 68, 68, 0.3)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                {result.success ? (
                  <Check size={14} style={{ color: 'var(--accent-green)' }} />
                ) : (
                  <X size={14} style={{ color: 'var(--accent-red)' }} />
                )}
                <span style={{ fontSize: 12, fontWeight: 600, color: result.success ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                  {result.success ? 'Maneuver Feasible' : 'Maneuver Failed'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {result.message}
              </div>
              {result.success && result.newMissDistance > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  <Target size={10} /> New miss distance: <strong style={{ color: 'var(--accent-green)' }}>
                    {result.newMissDistance.toFixed(2)} km
                  </strong>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </SidebarPanel>
  );
}

export const ManeuverPanel = memo(ManeuverPanelComponent);

