import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { SatellitePanel, ConjunctionPanel, GlobeViewer, StatusBar, DebrisPanel, ManeuverPanel, TimelineControl } from './components';
import { useSatellites } from './hooks/useSatellites';
import type { FilterState, ConjunctionWarning, DebrisFilterState, DebrisObject, HistoryState, SpacecraftParams, ManeuverResult, SatelliteInfo } from './types';
import { Settings, X, Orbit, Tag, AlertTriangle, Trash2, Gauge } from 'lucide-react';

const defaultFilters: FilterState = {
  searchQuery: '',
  showOrbits: false,
  showLabels: false,
  minInclination: 0,
  maxInclination: 180,
  showConjunctions: true,
  conjunctionThreshold: 10,
  selectedSatelliteId: null,
  orbitType: 'all',
};

const defaultDebrisFilters: DebrisFilterState = {
  showDebris: true,
  showRocketBodies: true,
  showFragments: true,
  minAltitudeKm: 0,
  maxAltitudeKm: 50000,
  showDebrisFields: false,
};

function App() {
  const { satellites, positions, conjunctions, debris, debrisStats, loading, refreshData, time } = useSatellites();

  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [debrisFilters, setDebrisFilters] = useState<DebrisFilterState>(defaultDebrisFilters);
  const [selectedDebrisId, setSelectedDebrisId] = useState<number | null>(null);
  const [fps, setFps] = useState(60);
  const [showSettings, setShowSettings] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showPerformance, setShowPerformance] = useState(false);

  // History state for timeline
  const [history, setHistory] = useState<HistoryState>({
    isRecording: true,
    isPlaying: false,
    currentTime: Date.now() / 1000,
    startTime: Date.now() / 1000,
    endTime: Date.now() / 1000 + 3600, // 1 hour window
    playbackSpeed: 1,
    snapshots: [],
  });


  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef(performance.now());
  const animationFrameIdRef = useRef<number | null>(null);
  const fpsUpdateCounterRef = useRef(0);

  // Get selected satellite info
  const selectedSatellite = useMemo<SatelliteInfo | null>(() => {
    if (filters.selectedSatelliteId === null) return null;
    return satellites.find(s => s.id === filters.selectedSatelliteId) || null;
  }, [filters.selectedSatelliteId, satellites]);

  // Get active conjunction for selected satellite
  const activeConjunction = useMemo<ConjunctionWarning | null>(() => {
    if (filters.selectedSatelliteId === null) return null;
    return conjunctions.find(c =>
      c.sat1Id === filters.selectedSatelliteId || c.sat2Id === filters.selectedSatelliteId
    ) || null;
  }, [filters.selectedSatelliteId, conjunctions]);

  // FPS calculation - only update state every 10 frames to reduce re-renders
  useEffect(() => {
    const animate = () => {
      const now = performance.now();
      const delta = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;
      
      frameTimesRef.current.push(delta);
      if (frameTimesRef.current.length > 30) {
        frameTimesRef.current.shift();
      }
      
      // Only update FPS state every 10 frames
      fpsUpdateCounterRef.current++;
      if (fpsUpdateCounterRef.current >= 10) {
        fpsUpdateCounterRef.current = 0;
        const avgDelta = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
        setFps(Math.round(1000 / avgDelta));
      }
      
      animationFrameIdRef.current = requestAnimationFrame(animate);
    };
    
    animationFrameIdRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, []);

  const handleFiltersChange = useCallback((update: Partial<FilterState>) => {
    setFilters(prev => ({ ...prev, ...update }));
  }, []);

  const handleSatelliteSelect = useCallback((id: number | null) => {
    setFilters(prev => ({ ...prev, selectedSatelliteId: id }));
  }, []);

  const handleConjunctionSelect = useCallback((conjunction: ConjunctionWarning) => {
    setFilters(prev => ({
      ...prev,
      selectedSatelliteId: conjunction.sat1Id,
    }));
  }, []);

  const handleDebrisFiltersChange = useCallback((update: Partial<DebrisFilterState>) => {
    setDebrisFilters(prev => ({ ...prev, ...update }));
  }, []);

  const handleDebrisSelect = useCallback((selected: DebrisObject | null) => {
    setSelectedDebrisId(selected?.id ?? null);
  }, []);

  // Maneuver simulation callback
  const handleSimulateManeuver = useCallback(async (
    satelliteId: number,
    deltaV: { x: number; y: number; z: number },
    spacecraft: SpacecraftParams
  ): Promise<ManeuverResult> => {
    // Simulate maneuver (mock implementation for now)
    await new Promise(resolve => setTimeout(resolve, 500));

    const totalDV = Math.sqrt(deltaV.x ** 2 + deltaV.y ** 2 + deltaV.z ** 2);
    const fuelCost = spacecraft.massKg * (1 - 1 / Math.exp((totalDV * 1000) / (spacecraft.ispS * 9.80665)));

    if (fuelCost > spacecraft.fuelMassKg) {
      return {
        success: false,
        message: 'Insufficient fuel for this maneuver',
        predictedPath: [],
        newMissDistance: 0,
        totalDeltaV: totalDV,
        fuelCostKg: fuelCost,
        alternatives: [],
      };
    }

    // Generate predicted path (simplified)
    const predictedPath = [];
    const sat = positions.find(p => p.id === satelliteId);
    if (sat) {
      for (let i = 0; i < 90; i++) {
        const angle = (i / 90) * Math.PI * 2;
        predictedPath.push({
          id: satelliteId,
          name: sat.name,
          position: {
            x: sat.position.x * Math.cos(angle) - sat.position.y * Math.sin(angle),
            y: sat.position.x * Math.sin(angle) + sat.position.y * Math.cos(angle),
            z: sat.position.z,
          },
          velocity: sat.velocity,
          timestamp: Date.now() / 1000 + i * 60,
        });
      }
    }

    return {
      success: true,
      message: 'Maneuver successfully simulated',
      predictedPath,
      newMissDistance: activeConjunction ? activeConjunction.missDistance + totalDV * 10 : 0,
      totalDeltaV: totalDV,
      fuelCostKg: fuelCost,
      alternatives: [
        {
          deltaV: { x: deltaV.x * 0.8, y: deltaV.y * 0.8, z: deltaV.z * 0.8 },
          burnTime: Date.now() / 1000 + 3600,
          newMissDistance: activeConjunction ? activeConjunction.missDistance + totalDV * 8 : 0,
          fuelCostKg: fuelCost * 0.8,
          description: 'Conservative maneuver (80% delta-V)',
        },
      ],
    };
  }, [positions, activeConjunction]);

  // Timeline callbacks
  const handleTimelinePlay = useCallback(() => {
    setHistory(h => ({ ...h, isPlaying: true }));
  }, []);

  const handleTimelinePause = useCallback(() => {
    setHistory(h => ({ ...h, isPlaying: false }));
  }, []);

  const handleTimelineSeek = useCallback((time: number) => {
    setHistory(h => ({ ...h, currentTime: time }));
  }, []);

  const handleSpeedChange = useCallback((speed: number) => {
    setHistory(h => ({ ...h, playbackSpeed: speed }));
  }, []);

  const handleToggleRecording = useCallback(() => {
    setHistory(h => ({ ...h, isRecording: !h.isRecording }));
  }, []);

  if (loading && satellites.length === 0) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#030308',
        color: '#fff',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>OrbitOps</div>
          <div style={{ opacity: 0.6 }}>Loading satellite data...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* 3D Globe Background */}
      <GlobeViewer
        positions={positions}
        conjunctions={conjunctions}
        debris={debris}
        filters={filters}
        debrisFilters={debrisFilters}
        onSatelliteClick={handleSatelliteSelect}
        theme="dark"
      />

      {/* Sidebar Panels */}
      <SatellitePanel
        satellites={satellites}
        positions={positions}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onSatelliteSelect={handleSatelliteSelect}
      />

      <ConjunctionPanel
        conjunctions={conjunctions}
        onConjunctionSelect={handleConjunctionSelect}
      />

      {/* Debris Panel */}
      <DebrisPanel
        debris={debris}
        statistics={debrisStats}
        filters={debrisFilters}
        onFiltersChange={handleDebrisFiltersChange}
        onDebrisSelect={handleDebrisSelect}
        selectedDebrisId={selectedDebrisId}
      />

      {/* Maneuver Panel */}
      <ManeuverPanel
        selectedSatellite={selectedSatellite}
        activeConjunction={activeConjunction}
        onSimulateManeuver={handleSimulateManeuver}
      />

      {/* Timeline Control */}
      {showTimeline && (
        <TimelineControl
          history={history}
          onPlay={handleTimelinePlay}
          onPause={handleTimelinePause}
          onSeek={handleTimelineSeek}
          onSpeedChange={handleSpeedChange}
          onToggleRecording={handleToggleRecording}
        />
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="liquid-glass w-[400px] max-h-[80vh] overflow-auto" style={{
            background: 'rgba(20, 25, 35, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 16,
          }}>
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Settings size={18} className="text-cyan-400" />
                <span className="text-white font-semibold">Settings</span>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X size={18} className="text-white/60" />
              </button>
            </div>
            <div className="p-4 space-y-6">
              {/* Visualization Settings */}
              <div>
                <h3 className="text-sm font-semibold text-white/80 mb-3">Visualization</h3>
                <div className="space-y-3">
                  <label className="flex items-center justify-between">
                    <span className="text-sm text-white/60 flex items-center gap-2">
                      <Orbit size={14} />
                      Show Orbital Paths
                    </span>
                    <button
                      onClick={() => handleFiltersChange({ showOrbits: !filters.showOrbits })}
                      className={`w-10 h-6 rounded-full transition-colors ${filters.showOrbits ? 'bg-cyan-500' : 'bg-white/20'}`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${filters.showOrbits ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </label>
                  <label className="flex items-center justify-between">
                    <span className="text-sm text-white/60 flex items-center gap-2">
                      <Tag size={14} />
                      Show Satellite Labels
                    </span>
                    <button
                      onClick={() => handleFiltersChange({ showLabels: !filters.showLabels })}
                      className={`w-10 h-6 rounded-full transition-colors ${filters.showLabels ? 'bg-cyan-500' : 'bg-white/20'}`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${filters.showLabels ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </label>
                  <label className="flex items-center justify-between">
                    <span className="text-sm text-white/60 flex items-center gap-2">
                      <AlertTriangle size={14} />
                      Show Conjunctions
                    </span>
                    <button
                      onClick={() => handleFiltersChange({ showConjunctions: !filters.showConjunctions })}
                      className={`w-10 h-6 rounded-full transition-colors ${filters.showConjunctions ? 'bg-cyan-500' : 'bg-white/20'}`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${filters.showConjunctions ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </label>
                  <label className="flex items-center justify-between">
                    <span className="text-sm text-white/60 flex items-center gap-2">
                      <Trash2 size={14} />
                      Show Space Debris
                    </span>
                    <button
                      onClick={() => handleDebrisFiltersChange({ showDebris: !debrisFilters.showDebris })}
                      className={`w-10 h-6 rounded-full transition-colors ${debrisFilters.showDebris ? 'bg-cyan-500' : 'bg-white/20'}`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${debrisFilters.showDebris ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </label>
                </div>
              </div>

              {/* Conjunction Threshold */}
              <div>
                <h3 className="text-sm font-semibold text-white/80 mb-3">Conjunction Detection</h3>
                <div>
                  <label className="text-sm text-white/60">
                    Threshold Distance: {filters.conjunctionThreshold} km
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    value={filters.conjunctionThreshold}
                    onChange={(e) => handleFiltersChange({ conjunctionThreshold: parseInt(e.target.value) })}
                    className="w-full mt-2 accent-cyan-500"
                  />
                </div>
              </div>

              {/* Debris Filters */}
              <div>
                <h3 className="text-sm font-semibold text-white/80 mb-3">Debris Filters</h3>
                <div className="space-y-3">
                  <label className="flex items-center justify-between">
                    <span className="text-sm text-white/60">Rocket Bodies</span>
                    <button
                      onClick={() => handleDebrisFiltersChange({ showRocketBodies: !debrisFilters.showRocketBodies })}
                      className={`w-10 h-6 rounded-full transition-colors ${debrisFilters.showRocketBodies ? 'bg-orange-500' : 'bg-white/20'}`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${debrisFilters.showRocketBodies ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </label>
                  <label className="flex items-center justify-between">
                    <span className="text-sm text-white/60">Fragments</span>
                    <button
                      onClick={() => handleDebrisFiltersChange({ showFragments: !debrisFilters.showFragments })}
                      className={`w-10 h-6 rounded-full transition-colors ${debrisFilters.showFragments ? 'bg-yellow-500' : 'bg-white/20'}`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${debrisFilters.showFragments ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </label>
                  <div>
                    <label className="text-sm text-white/60">
                      Altitude Range: {debrisFilters.minAltitudeKm} - {debrisFilters.maxAltitudeKm} km
                    </label>
                    <div className="flex gap-2 mt-2">
                      <input
                        type="number"
                        value={debrisFilters.minAltitudeKm}
                        onChange={(e) => handleDebrisFiltersChange({ minAltitudeKm: parseInt(e.target.value) || 0 })}
                        className="w-20 px-2 py-1 bg-white/10 border border-white/20 rounded text-sm text-white"
                        placeholder="Min"
                      />
                      <span className="text-white/40">-</span>
                      <input
                        type="number"
                        value={debrisFilters.maxAltitudeKm}
                        onChange={(e) => handleDebrisFiltersChange({ maxAltitudeKm: parseInt(e.target.value) || 50000 })}
                        className="w-20 px-2 py-1 bg-white/10 border border-white/20 rounded text-sm text-white"
                        placeholder="Max"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Timeline Toggle */}
              <div>
                <h3 className="text-sm font-semibold text-white/80 mb-3">Playback</h3>
                <label className="flex items-center justify-between">
                  <span className="text-sm text-white/60">Show Timeline Control</span>
                  <button
                    onClick={() => setShowTimeline(!showTimeline)}
                    className={`w-10 h-6 rounded-full transition-colors ${showTimeline ? 'bg-cyan-500' : 'bg-white/20'}`}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${showTimeline ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Performance Metrics Overlay (Phase 7) */}
      {showPerformance && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 liquid-glass px-4 py-3 rounded-xl" style={{
          background: 'rgba(20, 25, 35, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}>
          <div className="flex items-center gap-6 text-xs">
            <div className="flex items-center gap-2">
              <Gauge size={14} className="text-cyan-400" />
              <span className="text-white/80 font-semibold">Performance</span>
            </div>
            <div>
              <span className="text-white/50">FPS:</span>
              <span className={`ml-1 font-mono ${fps >= 50 ? 'text-green-400' : fps >= 30 ? 'text-yellow-400' : 'text-red-400'}`}>
                {fps}
              </span>
            </div>
            <div>
              <span className="text-white/50">Satellites:</span>
              <span className="ml-1 font-mono text-cyan-400">{positions.length}</span>
            </div>
            <div>
              <span className="text-white/50">Debris:</span>
              <span className="ml-1 font-mono text-orange-400">{debris.length}</span>
            </div>
            <div>
              <span className="text-white/50">Conjunctions:</span>
              <span className="ml-1 font-mono text-red-400">{conjunctions.length}</span>
            </div>
            <button
              onClick={() => setShowPerformance(false)}
              className="ml-2 p-1 hover:bg-white/10 rounded transition-colors"
            >
              <X size={12} className="text-white/60" />
            </button>
          </div>
        </div>
      )}

      {/* Status Bar - Bottom */}
      <StatusBar
        time={time}
        fps={fps}
        satelliteCount={satellites.length}
        conjunctionCount={conjunctions.length}
        onRefresh={refreshData}
        loading={loading}
        onSettingsClick={() => setShowSettings(true)}
        onPerformanceClick={() => setShowPerformance(!showPerformance)}
      />
    </div>
  );
}

export default App;
