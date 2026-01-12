import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GlobeViewer } from './components/GlobeViewer';
import { TopBar } from './components/TopBar';
import { CommandDock } from './components/CommandDock';
import type { DockTab } from './components/CommandDock';
import { SatellitesTab } from './components/SatellitesTab';
import { AlertsTab } from './components/AlertsTab';
import { TimelineTab } from './components/TimelineTab';
import { DebrisTab } from './components/DebrisTab';
import { FloatingPanel } from './components/FloatingPanel';
import { SatelliteDetailDrawer } from './components/SatelliteDetailDrawer';
import { QuickTour, shouldShowTour } from './components/QuickTour';
import { useSatellites } from './hooks/useSatellites';
import type { FilterState, ConjunctionWarning, DebrisFilterState, DebrisObject, HistoryState, SpacecraftParams, ManeuverResult, SatelliteInfo, SatellitePosition } from './types';
import { Settings, X, Orbit, Tag, AlertTriangle, Trash2, Satellite, Clock, ExternalLink } from 'lucide-react';

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

type PanelType = 'satellites' | 'alerts' | 'timeline' | 'debris';

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

  // Floating panels state
  const [openPanels, setOpenPanels] = useState<Set<PanelType>>(new Set());
  const [panelZIndices, setPanelZIndices] = useState<Record<PanelType, number>>({
    satellites: 100,
    alerts: 101,
    timeline: 102,
    debris: 103,
  });
  const nextZIndexRef = useRef(104);

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

  // Panel management
  const openPanel = useCallback((panel: PanelType) => {
    setOpenPanels(prev => new Set([...prev, panel]));
    setPanelZIndices(prev => ({ ...prev, [panel]: nextZIndexRef.current++ }));
  }, []);

  const closePanel = useCallback((panel: PanelType) => {
    setOpenPanels(prev => {
      const next = new Set(prev);
      next.delete(panel);
      return next;
    });
  }, []);

  const focusPanel = useCallback((panel: PanelType) => {
    setPanelZIndices(prev => ({ ...prev, [panel]: nextZIndexRef.current++ }));
  }, []);

  const togglePanel = useCallback((panel: PanelType) => {
    if (openPanels.has(panel)) {
      closePanel(panel);
    } else {
      openPanel(panel);
    }
  }, [openPanels, openPanel, closePanel]);

  // Handle dock tab click - open as floating panel
  const handleDockTabClick = useCallback((tab: DockTab) => {
    togglePanel(tab);
  }, [togglePanel]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case '1':
          togglePanel('satellites');
          break;
        case '2':
          togglePanel('alerts');
          break;
        case '3':
          togglePanel('timeline');
          break;
        case '4':
          togglePanel('debris');
          break;
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filters.selectedSatelliteId, showSettings, togglePanel]);

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

  // Panel positions
  const panelPositions: Record<PanelType, { x: number; y: number }> = {
    satellites: { x: 20, y: 70 },
    alerts: { x: 420, y: 70 },
    timeline: { x: 200, y: 200 },
    debris: { x: 60, y: 150 },
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

      {/* Floating Panels */}
      <FloatingPanel
        id="satellites"
        title="Satellites"
        icon={<Satellite size={18} />}
        isOpen={openPanels.has('satellites')}
        onClose={() => closePanel('satellites')}
        defaultPosition={panelPositions.satellites}
        defaultSize={{ width: 380, height: 600 }}
        zIndex={panelZIndices.satellites}
        onFocus={() => focusPanel('satellites')}
      >
        <SatellitesTab
          satellites={satellites}
          positions={positions}
          filters={filters}
          onFiltersChange={handleFiltersChange}
          onSatelliteSelect={handleSatelliteSelect}
        />
      </FloatingPanel>

      <FloatingPanel
        id="alerts"
        title="Conjunction Alerts"
        icon={<AlertTriangle size={18} />}
        isOpen={openPanels.has('alerts')}
        onClose={() => closePanel('alerts')}
        defaultPosition={panelPositions.alerts}
        defaultSize={{ width: 400, height: 500 }}
        zIndex={panelZIndices.alerts}
        onFocus={() => focusPanel('alerts')}
      >
        <AlertsTab
          conjunctions={conjunctions}
          onConjunctionSelect={handleConjunctionSelect}
        />
      </FloatingPanel>

      <FloatingPanel
        id="timeline"
        title="Timeline Replay"
        icon={<Clock size={18} />}
        isOpen={openPanels.has('timeline')}
        onClose={() => closePanel('timeline')}
        defaultPosition={panelPositions.timeline}
        defaultSize={{ width: 500, height: 300 }}
        minSize={{ width: 400, height: 250 }}
        zIndex={panelZIndices.timeline}
        onFocus={() => focusPanel('timeline')}
      >
        <TimelineTab
          history={history}
          onPlay={handleTimelinePlay}
          onPause={handleTimelinePause}
          onSeek={handleTimelineSeek}
          onSpeedChange={handleSpeedChange}
          onToggleRecording={handleToggleRecording}
        />
      </FloatingPanel>

      <FloatingPanel
        id="debris"
        title="Space Debris"
        icon={<Trash2 size={18} />}
        isOpen={openPanels.has('debris')}
        onClose={() => closePanel('debris')}
        defaultPosition={panelPositions.debris}
        defaultSize={{ width: 380, height: 550 }}
        zIndex={panelZIndices.debris}
        onFocus={() => focusPanel('debris')}
      >
        <DebrisTab
          debris={debris}
          statistics={debrisStats}
          filters={debrisFilters}
          onFiltersChange={handleDebrisFiltersChange}
          onDebrisSelect={handleDebrisSelect}
          selectedDebrisId={selectedDebrisId}
        />
      </FloatingPanel>

      {/* Command Dock - Panel Launcher */}
      <CommandDock
        activeTab={activeTab}
        isExpanded={isDockExpanded}
        onTabChange={(tab) => {
          setActiveTab(tab);
          handleDockTabClick(tab);
        }}
        onExpandChange={setIsDockExpanded}
        satelliteCount={satellites.length}
        alertCount={conjunctions.length}
        debrisCount={debris.length}
      >
        {/* Dock shows quick launch buttons instead of content */}
        <div className="dock-launcher">
          <div className="launcher-hint">
            Click a tab above to open its panel, or use keyboard shortcuts:
          </div>
          <div className="launcher-shortcuts">
            <button onClick={() => togglePanel('satellites')} className={openPanels.has('satellites') ? 'active' : ''}>
              <Satellite size={16} />
              <span>Satellites</span>
              <kbd>1</kbd>
              {openPanels.has('satellites') && <ExternalLink size={12} className="open-indicator" />}
            </button>
            <button onClick={() => togglePanel('alerts')} className={openPanels.has('alerts') ? 'active' : ''}>
              <AlertTriangle size={16} />
              <span>Alerts</span>
              <kbd>2</kbd>
              {openPanels.has('alerts') && <ExternalLink size={12} className="open-indicator" />}
            </button>
            <button onClick={() => togglePanel('timeline')} className={openPanels.has('timeline') ? 'active' : ''}>
              <Clock size={16} />
              <span>Timeline</span>
              <kbd>3</kbd>
              {openPanels.has('timeline') && <ExternalLink size={12} className="open-indicator" />}
            </button>
            <button onClick={() => togglePanel('debris')} className={openPanels.has('debris') ? 'active' : ''}>
              <Trash2 size={16} />
              <span>Debris</span>
              <kbd>4</kbd>
              {openPanels.has('debris') && <ExternalLink size={12} className="open-indicator" />}
            </button>
          </div>
        </div>
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
                  <div className="shortcut"><kbd>1</kbd> Satellites panel</div>
                  <div className="shortcut"><kbd>2</kbd> Alerts panel</div>
                  <div className="shortcut"><kbd>3</kbd> Timeline panel</div>
                  <div className="shortcut"><kbd>4</kbd> Debris panel</div>
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

        /* Dock Launcher Styles */
        .dock-launcher {
          padding: 20px 24px;
        }

        .launcher-hint {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.4);
          margin-bottom: 16px;
          text-align: center;
        }

        .launcher-shortcuts {
          display: flex;
          gap: 12px;
          justify-content: center;
          flex-wrap: wrap;
        }

        .launcher-shortcuts button {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 20px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          color: rgba(255, 255, 255, 0.7);
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
        }

        .launcher-shortcuts button:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.15);
          color: white;
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
        }

        .launcher-shortcuts button.active {
          background: rgba(0, 212, 255, 0.1);
          border-color: rgba(0, 212, 255, 0.3);
          color: var(--accent-cyan, #00d4ff);
        }

        .launcher-shortcuts button svg:first-child {
          opacity: 0.7;
        }

        .launcher-shortcuts button.active svg:first-child {
          opacity: 1;
          filter: drop-shadow(0 0 6px var(--accent-cyan, #00d4ff));
        }

        .launcher-shortcuts kbd {
          padding: 4px 8px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          font-family: 'SF Mono', Monaco, monospace;
          font-size: 10px;
          color: rgba(255, 255, 255, 0.5);
          margin-left: auto;
        }

        .open-indicator {
          position: absolute;
          top: 8px;
          right: 8px;
          color: var(--accent-cyan, #00d4ff);
          opacity: 0.7;
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
