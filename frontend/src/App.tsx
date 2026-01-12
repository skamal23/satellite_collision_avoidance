import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GlobeViewer } from './components/GlobeViewer';
import { TopBar } from './components/TopBar';
import { CommandDock } from './components/CommandDock';
import type { DockTab } from './components/CommandDock';
import { SatellitesTab } from './components/SatellitesTab';
import { AlertsTab } from './components/AlertsTab';
import { TimelineTab } from './components/TimelineTab';
import { DebrisTab } from './components/DebrisTab';
import { SatelliteDetailDrawer } from './components/SatelliteDetailDrawer';
import { QuickTour, shouldShowTour } from './components/QuickTour';
import { useSatellites } from './hooks/useSatellites';
import type { FilterState, ConjunctionWarning, DebrisFilterState, DebrisObject, HistoryState, SpacecraftParams, ManeuverResult, SatelliteInfo, SatellitePosition } from './types';
import { Settings, X, Orbit, Tag, AlertTriangle, Trash2 } from 'lucide-react';

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
  const { satellites, positions, conjunctions, debris, debrisStats, loading } = useSatellites();

  // UI State
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [debrisFilters, setDebrisFilters] = useState<DebrisFilterState>(defaultDebrisFilters);
  const [selectedDebrisId, setSelectedDebrisId] = useState<number | null>(null);
  const [fps, setFps] = useState(60);

  // Command Dock state
  const [activeTab, setActiveTab] = useState<DockTab>('satellites');
  const [isDockExpanded, setIsDockExpanded] = useState(false);

  // Modals
  const [showSettings, setShowSettings] = useState(false);
  const [showTour, setShowTour] = useState(false);

  // Check for first-time tour
  useEffect(() => {
    if (shouldShowTour()) {
      // Small delay to let the app render first
      const timer = setTimeout(() => setShowTour(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  // History state for timeline
  const [history, setHistory] = useState<HistoryState>({
    isRecording: true,
    isPlaying: false,
    currentTime: Date.now() / 1000,
    startTime: Date.now() / 1000,
    endTime: Date.now() / 1000 + 3600,
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

  // Get selected satellite position
  const selectedPosition = useMemo<SatellitePosition | null>(() => {
    if (filters.selectedSatelliteId === null) return null;
    return positions.find(p => p.id === filters.selectedSatelliteId) || null;
  }, [filters.selectedSatelliteId, positions]);

  // FPS calculation
  useEffect(() => {
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
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case '1':
          setActiveTab('satellites');
          setIsDockExpanded(true);
          break;
        case '2':
          setActiveTab('alerts');
          setIsDockExpanded(true);
          break;
        case '3':
          setActiveTab('timeline');
          setIsDockExpanded(true);
          break;
        case '4':
          setActiveTab('debris');
          setIsDockExpanded(true);
          break;
        case 'Escape':
          if (filters.selectedSatelliteId !== null) {
            setFilters(prev => ({ ...prev, selectedSatelliteId: null }));
          } else if (isDockExpanded) {
            setIsDockExpanded(false);
          } else if (showSettings) {
            setShowSettings(false);
          }
          break;
        case ' ':
          e.preventDefault();
          if (history.isPlaying) {
            setHistory(h => ({ ...h, isPlaying: false }));
          } else {
            setHistory(h => ({ ...h, isPlaying: true }));
          }
          break;
        case '/':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            setActiveTab('satellites');
            setIsDockExpanded(true);
          }
          break;
        case '?':
          setShowTour(true);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filters.selectedSatelliteId, isDockExpanded, showSettings, history.isPlaying]);

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

  const handleDebrisFiltersChange = useCallback((update: Partial<DebrisFilterState>) => {
    setDebrisFilters(prev => ({ ...prev, ...update }));
  }, []);

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

  // Timeline handlers
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

  // Loading state
  if (loading && satellites.length === 0) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="loading-logo">OrbitOps</div>
          <div className="loading-text">Loading satellite data...</div>
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
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 12px;
            color: var(--accent-cyan, #00d4ff);
          }
          .loading-text {
            opacity: 0.6;
            font-size: 14px;
          }
        `}</style>
      </div>
    );
  }

  // Render active tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'satellites':
        return (
          <SatellitesTab
            satellites={satellites}
            positions={positions}
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onSatelliteSelect={handleSatelliteSelect}
          />
        );
      case 'alerts':
        return (
          <AlertsTab
            conjunctions={conjunctions}
            onConjunctionSelect={handleConjunctionSelect}
          />
        );
      case 'timeline':
        return (
          <TimelineTab
            history={history}
            onPlay={handleTimelinePlay}
            onPause={handleTimelinePause}
            onSeek={handleTimelineSeek}
            onSpeedChange={handleSpeedChange}
            onToggleRecording={handleToggleRecording}
          />
        );
      case 'debris':
        return (
          <DebrisTab
            debris={debris}
            statistics={debrisStats}
            filters={debrisFilters}
            onFiltersChange={handleDebrisFiltersChange}
            onDebrisSelect={handleDebrisSelect}
            selectedDebrisId={selectedDebrisId}
          />
        );
    }
  };

  return (
    <div className="app-container">
      {/* TopBar */}
      <TopBar
        satelliteCount={satellites.length}
        conjunctionCount={conjunctions.length}
        fps={fps}
        onSettingsClick={() => setShowSettings(true)}
        onHelpClick={() => setShowTour(true)}
      />

      {/* 3D Globe (full screen hero) */}
      <GlobeViewer
        positions={positions}
        conjunctions={conjunctions}
        debris={debris}
        filters={filters}
        debrisFilters={debrisFilters}
        onSatelliteClick={handleSatelliteSelect}
        theme="dark"
      />

      {/* Command Dock */}
      <CommandDock
        activeTab={activeTab}
        isExpanded={isDockExpanded}
        onTabChange={setActiveTab}
        onExpandChange={setIsDockExpanded}
        satelliteCount={satellites.length}
        alertCount={conjunctions.length}
        debrisCount={debris.length}
      >
        {renderTabContent()}
      </CommandDock>

      {/* Satellite Detail Drawer */}
      {selectedSatellite && (
        <SatelliteDetailDrawer
          satellite={selectedSatellite}
          position={selectedPosition}
          conjunctions={conjunctions}
          onClose={handleCloseDrawer}
          onSimulateManeuver={handleSimulateManeuver}
          onConjunctionSelect={handleConjunctionSelect}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay">
          <div className="modal-backdrop" onClick={() => setShowSettings(false)} />
          <div className="settings-modal">
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
                  <div className="shortcut"><kbd>Space</kbd> Play/Pause</div>
                  <div className="shortcut"><kbd>Esc</kbd> Close/Deselect</div>
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
          background: #030308;
        }

        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 400;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .modal-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
        }

        .settings-modal {
          position: relative;
          width: 90%;
          max-width: 450px;
          max-height: 80vh;
          background: rgba(15, 20, 30, 0.95);
          backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .modal-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 16px;
          font-weight: 600;
          color: white;
        }

        .modal-title svg {
          color: var(--accent-cyan, #00d4ff);
        }

        .modal-close {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
        }

        .modal-close:hover {
          background: rgba(255, 255, 255, 0.1);
          color: white;
        }

        .modal-body {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
        }

        .settings-group {
          margin-bottom: 24px;
        }

        .settings-group:last-child {
          margin-bottom: 0;
        }

        .settings-group h3 {
          font-size: 12px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.5);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 0 0 12px;
        }

        .settings-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .setting-toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .setting-toggle span {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.8);
        }

        .toggle {
          width: 44px;
          height: 24px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          cursor: pointer;
          position: relative;
          transition: background 0.2s ease;
        }

        .toggle.active {
          background: var(--accent-cyan, #00d4ff);
        }

        .toggle-knob {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          transition: transform 0.2s ease;
        }

        .toggle.active .toggle-knob {
          transform: translateX(20px);
        }

        .setting-slider {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .setting-slider label {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.8);
        }

        .setting-slider input {
          width: 100%;
          accent-color: var(--accent-cyan, #00d4ff);
        }

        .shortcuts-list {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }

        .shortcut {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.6);
        }

        .shortcut kbd {
          padding: 3px 8px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 6px;
          font-family: 'SF Mono', Monaco, monospace;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.8);
        }
      `}</style>
    </div>
  );
}

export default App;
