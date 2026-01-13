import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GlobeViewer } from './components/GlobeViewer';
import { StatusBar } from './components/StatusBar';
import { UnifiedPanel } from './components/UnifiedPanel';
import { SatelliteDetailDrawer } from './components/SatelliteDetailDrawer';
import { QuickTour } from './components/QuickTour';
import { shouldShowTour } from './utils/tourStorage';
import { useSatellites } from './hooks/useSatellites';
import type { FilterState, ConjunctionWarning, DebrisFilterState, DebrisObject, HistoryState, SpacecraftParams, ManeuverResult, SatelliteInfo, SatellitePosition, OptimizeManeuverResult, TLESource, TLEUpdateResult, ConjunctionHistoryEntry, HistoryResponse, ConjunctionHistoryResponse, PositionSnapshot } from './types';
import { Settings, X, Orbit, Tag, AlertTriangle, Trash2, Layers } from 'lucide-react';

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

  // UI State
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [debrisFilters, setDebrisFilters] = useState<DebrisFilterState>(defaultDebrisFilters);
  const [selectedDebrisId, setSelectedDebrisId] = useState<number | null>(null);
  const [fps, setFps] = useState(60);

  // Panel state
  const [isPanelOpen, setIsPanelOpen] = useState(true);

  // Focus state for fly-to animation
  const [focusSatelliteId, setFocusSatelliteId] = useState<number | null>(null);

  // Modals
  const [showSettings, setShowSettings] = useState(false);
  const [showTour, setShowTour] = useState(false);

  // Check for first-time tour
  useEffect(() => {
    if (shouldShowTour()) {
      const timer = setTimeout(() => setShowTour(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  // History state for timeline - using lazy initialization to avoid impure calls during render
  const [history, setHistory] = useState<HistoryState>(() => {
    const now = Date.now() / 1000;
    return {
      isRecording: true,
      isPlaying: false,
      currentTime: now,
      startTime: now,
      endTime: now + 3600,
      playbackSpeed: 1,
      snapshots: [],
    };
  });

  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef<number>(0); // Initialized in useEffect
  const animationFrameIdRef = useRef<number | null>(null);
  const fpsUpdateCounterRef = useRef(0);

  // Get selected satellite info
  const selectedSatellite = useMemo<SatelliteInfo | null>(() => {
    if (filters.selectedSatelliteId === null) return null;
    return satellites.find(s => s.id === filters.selectedSatelliteId) || null;
  }, [filters.selectedSatelliteId, satellites]);

  // Get selected satellite position
  const selectedPosition = useMemo<SatellitePosition | null>(() => {
    if (filters.selectedSatelliteId === null) return null;
    return positions.find(p => p.id === filters.selectedSatelliteId) || null;
  }, [filters.selectedSatelliteId, positions]);

  // FPS calculation
  useEffect(() => {
    // Initialize the ref with current time inside effect (not during render)
    lastFrameTimeRef.current = performance.now();

    const animate = () => {
      const now = performance.now();
      const delta = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;

      frameTimesRef.current.push(delta);
      if (frameTimesRef.current.length > 30) {
        frameTimesRef.current.shift();
      }

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'Escape':
          if (filters.selectedSatelliteId !== null) {
            setFilters(prev => ({ ...prev, selectedSatelliteId: null }));
          } else if (showSettings) {
            setShowSettings(false);
          }
          break;
        case ' ':
          e.preventDefault();
          setHistory(h => ({ ...h, isPlaying: !h.isPlaying }));
          break;
        case '?':
          setShowTour(true);
          break;
        case 'p':
        case 'P':
          setIsPanelOpen(prev => !prev);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filters.selectedSatelliteId, showSettings]);

  // Handlers
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

  // Focus handler - triggers camera fly-to without opening drawer
  const handleSatelliteFocus = useCallback((id: number) => {
    setFocusSatelliteId(id);
    setFilters(prev => ({ ...prev, selectedSatelliteId: id }));
  }, []);

  const handleDebrisFiltersChange = useCallback((update: Partial<DebrisFilterState>) => {
    setDebrisFilters(prev => ({ ...prev, ...update }));
  }, []);

  // Debris focus handler - reuses satellite focus mechanism
  const handleDebrisFocus = useCallback((id: number) => {
    // For debris, we find matching position by ID from debris array
    const debrisItem = debris.find(d => d.id === id);
    if (debrisItem) {
      // Use focusSatelliteId to trigger camera fly-to (works for any ECI position)
      setFocusSatelliteId(id);
      setSelectedDebrisId(id);
    }
  }, [debris]);

  const handleDebrisSelect = useCallback((selected: DebrisObject | null) => {
    setSelectedDebrisId(selected?.id ?? null);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setFilters(prev => ({ ...prev, selectedSatelliteId: null }));
  }, []);

  // Maneuver simulation
  const handleSimulateManeuver = useCallback(async (
    satelliteId: number,
    deltaV: { x: number; y: number; z: number },
    spacecraft: SpacecraftParams
  ): Promise<ManeuverResult> => {
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

    const activeConjunction = conjunctions.find(c =>
      c.sat1Id === satelliteId || c.sat2Id === satelliteId
    );

    return {
      success: true,
      message: 'Maneuver successfully simulated',
      predictedPath,
      newMissDistance: activeConjunction ? activeConjunction.missDistance + totalDV * 10 : 0,
      totalDeltaV: totalDV,
      fuelCostKg: fuelCost,
      alternatives: [],
    };
  }, [positions, conjunctions]);

  // Optimize maneuver handler (Phase 6.3 - calculates optimal δV)
  const handleOptimizeManeuver = useCallback(async (
    satelliteId: number,
    threatId: number,
    targetMissDistance: number,
    _timeToTca: number,
    spacecraft: SpacecraftParams
  ): Promise<OptimizeManeuverResult> => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800));

    // Mock optimal δV calculation
    // In real implementation, this would call the gRPC OptimizeManeuver endpoint
    const conjunction = conjunctions.find(c =>
      (c.sat1Id === satelliteId && c.sat2Id === threatId) ||
      (c.sat2Id === satelliteId && c.sat1Id === threatId)
    );

    if (!conjunction) {
      return {
        success: false,
        message: 'No active conjunction with the specified threat',
        recommendedDeltaV: { x: 0, y: 0, z: 0 },
        burnTime: 0,
        totalDeltaV: 0,
        fuelCostKg: 0,
        expectedMissDistance: 0,
        alternatives: [],
      };
    }

    // Calculate a plausible optimal δV (simplified physics)
    const missDeficit = targetMissDistance - conjunction.missDistance;
    const scaleFactor = missDeficit / (conjunction.relativeVelocity * 1000);
    const optimalDv = Math.abs(scaleFactor) * 0.001; // ~1 m/s per km of miss distance needed

    const recommendedDeltaV = {
      x: -optimalDv * 0.707, // Radial component
      y: optimalDv * 0.5,    // In-track component
      z: optimalDv * 0.5,    // Cross-track component
    };

    const totalDv = Math.sqrt(recommendedDeltaV.x ** 2 + recommendedDeltaV.y ** 2 + recommendedDeltaV.z ** 2);
    const fuelCost = spacecraft.massKg * (1 - 1 / Math.exp((totalDv * 1000) / (spacecraft.ispS * 9.80665)));

    if (fuelCost > spacecraft.fuelMassKg) {
      return {
        success: false,
        message: `Insufficient fuel. Need ${fuelCost.toFixed(2)} kg, have ${spacecraft.fuelMassKg} kg`,
        recommendedDeltaV,
        burnTime: Date.now() / 1000,
        totalDeltaV: totalDv,
        fuelCostKg: fuelCost,
        expectedMissDistance: targetMissDistance,
        alternatives: [],
      };
    }

    return {
      success: true,
      message: 'Optimal avoidance maneuver calculated',
      recommendedDeltaV,
      burnTime: Date.now() / 1000 + 1800, // 30 minutes from now
      totalDeltaV: totalDv,
      fuelCostKg: fuelCost,
      expectedMissDistance: targetMissDistance,
      alternatives: [
        {
          deltaV: { x: recommendedDeltaV.x * 1.5, y: recommendedDeltaV.y * 1.5, z: recommendedDeltaV.z * 1.5 },
          burnTime: Date.now() / 1000 + 1200,
          newMissDistance: targetMissDistance * 1.5,
          fuelCostKg: fuelCost * 1.5,
          description: 'Earlier burn, higher delta-V'
        },
        {
          deltaV: { x: recommendedDeltaV.x * 0.7, y: recommendedDeltaV.y * 0.7, z: recommendedDeltaV.z * 0.7 },
          burnTime: Date.now() / 1000 + 2700,
          newMissDistance: targetMissDistance * 0.7,
          fuelCostKg: fuelCost * 0.7,
          description: 'Fuel efficient, smaller margin'
        }
      ],
    };
  }, [conjunctions]);

  // TLE Sources state and handlers (Phase 6.4)
  const [tleSources, setTleSources] = useState<TLESource[]>([
    { name: 'Space Stations', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations', refreshIntervalMinutes: 60, enabled: true, satelliteCount: 35 },
    { name: 'Starlink', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink', refreshIntervalMinutes: 120, enabled: true, satelliteCount: 5800 },
    { name: 'Active Satellites', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active', refreshIntervalMinutes: 240, enabled: true, satelliteCount: 8500 },
    { name: 'Space Debris', url: 'https://celestrak.org/NORAD/elements/gp.php?SPECIAL=debris', refreshIntervalMinutes: 360, enabled: true, satelliteCount: 2200 },
    { name: 'Weather Satellites', url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=weather', refreshIntervalMinutes: 240, enabled: false, satelliteCount: 180 },
  ]);
  const [lastTLEUpdate, setLastTLEUpdate] = useState<number | null>(() => Date.now() / 1000 - 7200); // 2 hours ago

  const handleUpdateTLEs = useCallback(async (sourceNames?: string[]): Promise<TLEUpdateResult[]> => {
    // Mock TLE update - in real implementation, calls gRPC UpdateTLEs
    await new Promise(resolve => setTimeout(resolve, 1500));

    const sourcesToUpdate = sourceNames
      ? tleSources.filter(s => sourceNames.includes(s.name) && s.enabled)
      : tleSources.filter(s => s.enabled);

    const results: TLEUpdateResult[] = sourcesToUpdate.map(source => ({
      sourceName: source.name,
      success: Math.random() > 0.1, // 90% success rate simulation
      satellitesUpdated: source.satelliteCount || 0,
      fetchTime: Date.now() / 1000,
      errorMessage: Math.random() > 0.1 ? undefined : 'Connection timeout',
    }));

    // Update last update time
    setLastTLEUpdate(Date.now() / 1000);

    // Update source last update times
    setTleSources(prev => prev.map(source => {
      const result = results.find(r => r.sourceName === source.name);
      if (result?.success) {
        return { ...source, lastUpdate: Date.now() / 1000 };
      }
      return source;
    }));

    return results;
  }, [tleSources]);

  const handleToggleTLESource = useCallback((sourceName: string, enabled: boolean) => {
    setTleSources(prev => prev.map(source =>
      source.name === sourceName ? { ...source, enabled } : source
    ));
  }, []);

  // Timeline handlers
  const handleTimelinePlay = useCallback(() => {
    setHistory(h => ({ ...h, isPlaying: true }));
  }, []);

  const handleTimelinePause = useCallback(() => {
    setHistory(h => ({ ...h, isPlaying: false }));
  }, []);

  const handleTimelineSeek = useCallback((newTime: number) => {
    setHistory(h => ({ ...h, currentTime: newTime }));
  }, []);

  const handleSpeedChange = useCallback((speed: number) => {
    setHistory(h => ({ ...h, playbackSpeed: speed }));
  }, []);

  const handleToggleRecording = useCallback(() => {
    setHistory(h => ({ ...h, isRecording: !h.isRecording }));
  }, []);

  // Server-backed history (Phase 6.2)
  const [conjunctionHistory, setConjunctionHistory] = useState<ConjunctionHistoryEntry[]>([]);

  // Mock handler for GetHistory RPC
  const handleFetchHistory = useCallback(async (startTime: number, endTime: number): Promise<HistoryResponse> => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Generate mock historical snapshots
    const snapshots: PositionSnapshot[] = [];
    const intervalSeconds = 300; // 5-minute intervals
    const numSnapshots = Math.floor((endTime - startTime) / intervalSeconds);

    for (let i = 0; i < Math.min(numSnapshots, 100); i++) {
      const timestamp = startTime + i * intervalSeconds;
      snapshots.push({
        timestamp,
        satelliteIds: satellites.slice(0, 50).map(s => s.id),
        positionsX: satellites.slice(0, 50).map(() => Math.random() * 10000 - 5000),
        positionsY: satellites.slice(0, 50).map(() => Math.random() * 10000 - 5000),
        positionsZ: satellites.slice(0, 50).map(() => Math.random() * 10000 - 5000),
      });
    }

    // Update history state with loaded range
    setHistory(h => ({
      ...h,
      startTime,
      endTime,
      currentTime: startTime,
      snapshots,
    }));

    return {
      snapshots,
      totalSnapshots: snapshots.length,
      startTime,
      endTime,
    };
  }, [satellites]);

  // Mock handler for GetConjunctionHistory RPC
  const handleFetchConjunctionHistory = useCallback(async (startTime: number, endTime: number): Promise<ConjunctionHistoryResponse> => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800));

    // Generate mock conjunction history based on current conjunctions
    const entries: ConjunctionHistoryEntry[] = conjunctions.map((conj, idx) => ({
      conjunction: conj,
      timestamp: startTime + ((endTime - startTime) * (idx + 1)) / (conjunctions.length + 1),
    }));

    // Add some additional historical events
    for (let i = 0; i < 5; i++) {
      const mockConj: ConjunctionWarning = {
        sat1Id: Math.floor(Math.random() * 1000),
        sat1Name: `SAT-${Math.floor(Math.random() * 1000)}`,
        sat2Id: Math.floor(Math.random() * 1000) + 1000,
        sat2Name: `DEBRIS-${Math.floor(Math.random() * 100)}`,
        tca: startTime + Math.random() * (endTime - startTime),
        missDistance: 0.5 + Math.random() * 5,
        relativeVelocity: 5 + Math.random() * 10,
        collisionProbability: Math.random() * 1e-4,
      };
      entries.push({
        conjunction: mockConj,
        timestamp: mockConj.tca,
      });
    }

    // Sort by timestamp
    entries.sort((a, b) => a.timestamp - b.timestamp);

    setConjunctionHistory(entries);

    return {
      entries,
      totalEntries: entries.length,
    };
  }, [conjunctions]);

  // Handler when user clicks a conjunction in timeline
  const handleConjunctionHistoryClick = useCallback((entry: ConjunctionHistoryEntry) => {
    // Select the primary satellite and focus on it
    setFilters(prev => ({ ...prev, selectedSatelliteId: entry.conjunction.sat1Id }));
    setFocusSatelliteId(entry.conjunction.sat1Id);
  }, []);

  // Loading state
  if (loading && satellites.length === 0) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="loading-logo">OrbitOps</div>
          <div className="loading-text">Loading satellite data...</div>
          <div className="loading-bar">
            <div className="loading-progress" />
          </div>
        </div>
        <style>{`
          .loading-screen {
            width: 100vw;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #030308;
            color: #fff;
          }
          .loading-content {
            text-align: center;
          }
          .loading-logo {
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 16px;
            color: var(--accent-cyan, #00d4ff);
            text-shadow: 0 0 30px rgba(0, 212, 255, 0.5);
          }
          .loading-text {
            opacity: 0.6;
            font-size: 14px;
            margin-bottom: 20px;
          }
          .loading-bar {
            width: 200px;
            height: 4px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 2px;
            overflow: hidden;
          }
          .loading-progress {
            width: 30%;
            height: 100%;
            background: linear-gradient(90deg, var(--accent-cyan, #00d4ff), var(--accent-green, #00ff88));
            border-radius: 2px;
            animation: loadingMove 1.5s ease infinite;
          }
          @keyframes loadingMove {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(400%); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* 3D Globe (full screen hero) */}
      <GlobeViewer
        positions={positions}
        conjunctions={conjunctions}
        debris={debris}
        filters={filters}
        debrisFilters={debrisFilters}
        onSatelliteClick={handleSatelliteSelect}
        theme="dark"
        focusSatelliteId={focusSatelliteId}
      />

      {/* Unified Control Panel */}
      <UnifiedPanel
        satellites={satellites}
        positions={positions}
        conjunctions={conjunctions}
        debris={debris}
        debrisStats={debrisStats}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onSatelliteSelect={handleSatelliteSelect}
        onSatelliteFocus={handleSatelliteFocus}
        onConjunctionSelect={handleConjunctionSelect}
        debrisFilters={debrisFilters}
        onDebrisFiltersChange={handleDebrisFiltersChange}
        selectedDebrisId={selectedDebrisId}
        onDebrisSelect={handleDebrisSelect}
        onDebrisFocus={handleDebrisFocus}
        history={history}
        onTimelinePlay={handleTimelinePlay}
        onTimelinePause={handleTimelinePause}
        onTimelineSeek={handleTimelineSeek}
        onSpeedChange={handleSpeedChange}
        onToggleRecording={handleToggleRecording}
        conjunctionHistory={conjunctionHistory}
        onFetchHistory={handleFetchHistory}
        onFetchConjunctionHistory={handleFetchConjunctionHistory}
        onConjunctionHistoryClick={handleConjunctionHistoryClick}
        tleSources={tleSources}
        lastTLEUpdate={lastTLEUpdate}
        onUpdateTLEs={handleUpdateTLEs}
        onToggleTLESource={handleToggleTLESource}
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        defaultPosition={{ x: 20, y: 20 }}
        defaultSize={{ width: 420, height: 600 }}
      />

      {/* Panel toggle button (when panel is closed) */}
      {!isPanelOpen && (
        <button
          className="panel-open-btn liquid-glass"
          onClick={() => setIsPanelOpen(true)}
          title="Open Control Panel (P)"
        >
          <Layers size={20} />
        </button>
      )}

      {/* Satellite Detail Drawer */}
      {selectedSatellite && (
        <SatelliteDetailDrawer
          satellite={selectedSatellite}
          position={selectedPosition}
          conjunctions={conjunctions}
          onClose={handleCloseDrawer}
          onSimulateManeuver={handleSimulateManeuver}
          onOptimizeManeuver={handleOptimizeManeuver}
          onConjunctionSelect={handleConjunctionSelect}
        />
      )}

      {/* Status Bar at bottom */}
      <StatusBar
        time={time}
        fps={fps}
        satelliteCount={satellites.length}
        conjunctionCount={conjunctions.length}
        onRefresh={refreshData}
        loading={loading}
        onSettingsClick={() => setShowSettings(true)}
        onPerformanceClick={() => { }}
      />

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay">
          <div className="modal-backdrop" onClick={() => setShowSettings(false)} />
          <div className="settings-modal liquid-glass">
            <div className="modal-header">
              <div className="modal-title">
                <Settings size={18} />
                <span>Settings</span>
              </div>
              <button onClick={() => setShowSettings(false)} className="modal-close">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              {/* Visualization Settings */}
              <div className="settings-group">
                <h3>Visualization</h3>
                <div className="settings-list">
                  <label className="setting-toggle">
                    <span><Orbit size={14} /> Show Orbital Paths</span>
                    <button
                      onClick={() => handleFiltersChange({ showOrbits: !filters.showOrbits })}
                      className={`toggle ${filters.showOrbits ? 'active' : ''}`}
                    >
                      <div className="toggle-knob" />
                    </button>
                  </label>
                  <label className="setting-toggle">
                    <span><Tag size={14} /> Show Satellite Labels</span>
                    <button
                      onClick={() => handleFiltersChange({ showLabels: !filters.showLabels })}
                      className={`toggle ${filters.showLabels ? 'active' : ''}`}
                    >
                      <div className="toggle-knob" />
                    </button>
                  </label>
                  <label className="setting-toggle">
                    <span><AlertTriangle size={14} /> Show Conjunctions</span>
                    <button
                      onClick={() => handleFiltersChange({ showConjunctions: !filters.showConjunctions })}
                      className={`toggle ${filters.showConjunctions ? 'active' : ''}`}
                    >
                      <div className="toggle-knob" />
                    </button>
                  </label>
                  <label className="setting-toggle">
                    <span><Trash2 size={14} /> Show Space Debris</span>
                    <button
                      onClick={() => handleDebrisFiltersChange({ showDebris: !debrisFilters.showDebris })}
                      className={`toggle ${debrisFilters.showDebris ? 'active' : ''}`}
                    >
                      <div className="toggle-knob" />
                    </button>
                  </label>
                </div>
              </div>

              {/* Conjunction Threshold */}
              <div className="settings-group">
                <h3>Conjunction Detection</h3>
                <div className="setting-slider">
                  <label>Threshold Distance: {filters.conjunctionThreshold} km</label>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    value={filters.conjunctionThreshold}
                    onChange={(e) => handleFiltersChange({ conjunctionThreshold: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              {/* Keyboard Shortcuts */}
              <div className="settings-group">
                <h3>Keyboard Shortcuts</h3>
                <div className="shortcuts-list">
                  <div className="shortcut"><kbd>1</kbd> Satellites tab</div>
                  <div className="shortcut"><kbd>2</kbd> Alerts tab</div>
                  <div className="shortcut"><kbd>3</kbd> Timeline tab</div>
                  <div className="shortcut"><kbd>4</kbd> Debris tab</div>
                  <div className="shortcut"><kbd>5</kbd> Data tab</div>
                  <div className="shortcut"><kbd>P</kbd> Toggle panel</div>
                  <div className="shortcut"><kbd>Space</kbd> Play/Pause</div>
                  <div className="shortcut"><kbd>Esc</kbd> Close drawer</div>
                  <div className="shortcut"><kbd>?</kbd> Show tour</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Tour */}
      <QuickTour isOpen={showTour} onClose={() => setShowTour(false)} />

      <style>{`
        .app-container {
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          position: relative;
          background: var(--bg-space, #030308);
        }

        /* Panel open button */
        .panel-open-btn {
          position: fixed;
          top: 20px;
          left: 20px;
          z-index: 150;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: rgba(255, 255, 255, 0.8);
          transition: all 0.2s ease;
        }

        .panel-open-btn:hover {
          background: rgba(0, 212, 255, 0.15);
          border-color: rgba(0, 212, 255, 0.4);
          color: var(--accent-cyan, #00d4ff);
          box-shadow: 0 0 30px rgba(0, 212, 255, 0.2);
        }

        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 500;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .modal-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(8px);
        }

        .settings-modal {
          position: relative;
          width: 90%;
          max-width: 480px;
          max-height: 80vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .modal-title {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 17px;
          font-weight: 600;
          color: white;
        }

        .modal-title svg {
          color: var(--accent-cyan, #00d4ff);
          filter: drop-shadow(0 0 8px rgba(0, 212, 255, 0.5));
        }

        .modal-close {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          color: rgba(255, 255, 255, 0.5);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .modal-close:hover {
          background: rgba(255, 68, 68, 0.1);
          border-color: rgba(255, 68, 68, 0.3);
          color: var(--accent-red, #ff3b3b);
        }

        .modal-body {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
        }

        .settings-group {
          margin-bottom: 28px;
        }

        .settings-group:last-child {
          margin-bottom: 0;
        }

        .settings-group h3 {
          font-size: 11px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.4);
          text-transform: uppercase;
          letter-spacing: 1px;
          margin: 0 0 14px;
        }

        .settings-list {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .setting-toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .setting-toggle span {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.8);
        }

        .setting-toggle span svg {
          opacity: 0.6;
        }

        .toggle {
          width: 48px;
          height: 26px;
          border-radius: 13px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
          cursor: pointer;
          position: relative;
          transition: all 0.2s ease;
        }

        .toggle.active {
          background: rgba(0, 212, 255, 0.3);
          border-color: rgba(0, 212, 255, 0.5);
          box-shadow: 0 0 20px rgba(0, 212, 255, 0.2);
        }

        .toggle-knob {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          transition: transform 0.2s ease;
        }

        .toggle.active .toggle-knob {
          transform: translateX(22px);
          box-shadow: 0 0 10px rgba(0, 212, 255, 0.5);
        }

        .setting-slider {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .setting-slider label {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.7);
        }

        .setting-slider input {
          width: 100%;
          accent-color: var(--accent-cyan, #00d4ff);
          height: 6px;
        }

        .shortcuts-list {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }

        .shortcut {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.6);
        }

        .shortcut kbd {
          padding: 4px 10px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          font-family: 'SF Mono', Monaco, monospace;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.7);
        }
      `}</style>
    </div>
  );
}

export default App;
