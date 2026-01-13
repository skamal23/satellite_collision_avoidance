import { useState, useRef, useCallback, useEffect, memo } from 'react';
import type { ReactNode } from 'react';
import { Minus, Plus, X, Maximize2, Minimize2, Satellite, AlertTriangle, Clock, Trash2, GripVertical, Database } from 'lucide-react';
import type {
  SatelliteInfo,
  SatellitePosition,
  FilterState,
  ConjunctionWarning,
  DebrisObject,
  DebrisStatistics,
  DebrisFilterState,
  HistoryState,
  TLESource,
  TLEUpdateResult,
  ConjunctionHistoryEntry,
  HistoryResponse,
  ConjunctionHistoryResponse,
} from '../types';
import { SatellitesTab } from './SatellitesTab';
import { AlertsTab } from './AlertsTab';
import { TimelineTab } from './TimelineTab';
import { DebrisTab } from './DebrisTab';
import { SettingsTab } from './SettingsTab';

// Panel size constraints - defined outside component to maintain stable references
const MIN_SIZE = { width: 380, height: 400 };
const MAX_SIZE = { width: 800, height: 900 };

type TabType = 'satellites' | 'alerts' | 'timeline' | 'debris' | 'settings';

interface TabConfig {
  id: TabType;
  label: string;
  icon: ReactNode;
  badge?: number;
  badgeType?: 'normal' | 'alert';
}

interface UnifiedPanelProps {
  // Data
  satellites: SatelliteInfo[];
  positions: SatellitePosition[];
  conjunctions: ConjunctionWarning[];
  debris: DebrisObject[];
  debrisStats: DebrisStatistics;

  // Satellite filters
  filters: FilterState;
  onFiltersChange: (filters: Partial<FilterState>) => void;
  onSatelliteSelect: (id: number | null) => void;
  onSatelliteFocus?: (id: number) => void;

  // Conjunction handling
  onConjunctionSelect: (conjunction: ConjunctionWarning) => void;

  // Debris filters
  debrisFilters: DebrisFilterState;
  onDebrisFiltersChange: (filters: Partial<DebrisFilterState>) => void;
  selectedDebrisId: number | null;
  onDebrisSelect: (debris: DebrisObject | null) => void;
  onDebrisFocus?: (id: number) => void;

  // Timeline
  history: HistoryState;
  onTimelinePlay: () => void;
  onTimelinePause: () => void;
  onTimelineSeek: (time: number) => void;
  onSpeedChange: (speed: number) => void;
  onToggleRecording: () => void;

  // Server-backed history (Phase 6.2)
  conjunctionHistory?: ConjunctionHistoryEntry[];
  onFetchHistory?: (startTime: number, endTime: number) => Promise<HistoryResponse>;
  onFetchConjunctionHistory?: (startTime: number, endTime: number) => Promise<ConjunctionHistoryResponse>;
  onConjunctionHistoryClick?: (entry: ConjunctionHistoryEntry) => void;

  // TLE Settings
  tleSources?: TLESource[];
  lastTLEUpdate?: number | null;
  onUpdateTLEs?: (sourceNames?: string[]) => Promise<TLEUpdateResult[]>;
  onToggleTLESource?: (sourceName: string, enabled: boolean) => void;

  // Panel state
  isOpen: boolean;
  onClose: () => void;
  defaultPosition?: { x: number; y: number };
  defaultSize?: { width: number; height: number };
}

function UnifiedPanelComponent({
  satellites,
  positions,
  conjunctions,
  debris,
  debrisStats,
  filters,
  onFiltersChange,
  onSatelliteSelect,
  onSatelliteFocus,
  onConjunctionSelect,
  debrisFilters,
  onDebrisFiltersChange,
  selectedDebrisId,
  onDebrisSelect,
  onDebrisFocus,
  history,
  onTimelinePlay,
  onTimelinePause,
  onTimelineSeek,
  onSpeedChange,
  onToggleRecording,
  conjunctionHistory = [],
  onFetchHistory,
  onFetchConjunctionHistory,
  onConjunctionHistoryClick,
  tleSources = [],
  lastTLEUpdate = null,
  onUpdateTLEs,
  onToggleTLESource,
  isOpen,
  onClose,
  defaultPosition = { x: 20, y: 70 },
  defaultSize = { width: 420, height: 600 },
}: UnifiedPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('satellites');
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [position, setPosition] = useState(defaultPosition);
  const [size, setSize] = useState(defaultSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [preMaxState, setPreMaxState] = useState<{ pos: typeof position; size: typeof size } | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0, panelX: 0, panelY: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0, panelX: 0, panelY: 0 });

  const tabs: TabConfig[] = [
    { id: 'satellites', label: 'Satellites', icon: <Satellite size={16} />, badge: satellites.length },
    { id: 'alerts', label: 'Alerts', icon: <AlertTriangle size={16} />, badge: conjunctions.length, badgeType: conjunctions.length > 0 ? 'alert' : 'normal' },
    { id: 'timeline', label: 'Timeline', icon: <Clock size={16} /> },
    { id: 'debris', label: 'Debris', icon: <Trash2 size={16} />, badge: debris.length },
    { id: 'settings', label: 'Data', icon: <Database size={16} /> },
  ];

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.panel-btn') ||
      (e.target as HTMLElement).closest('.resize-handle') ||
      (e.target as HTMLElement).closest('.tab-btn')) return;

    if (isMaximized) return;

    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panelX: position.x,
      panelY: position.y,
    };
    e.preventDefault();
  }, [position, isMaximized]);

  const handleResizeStart = useCallback((e: React.MouseEvent, direction: string) => {
    if (isMaximized) return;
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(direction);
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
      panelX: position.x,
      panelY: position.y,
    };
  }, [size, position, isMaximized]);

  const handleMaximize = useCallback(() => {
    if (isMaximized) {
      if (preMaxState) {
        setPosition(preMaxState.pos);
        setSize(preMaxState.size);
      }
      setIsMaximized(false);
    } else {
      setPreMaxState({ pos: position, size });
      setPosition({ x: 10, y: 10 });
      setSize({ width: window.innerWidth - 20, height: window.innerHeight - 80 });
      setIsMaximized(true);
    }
  }, [isMaximized, preMaxState, position, size]);

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    let lastUpdate = 0;
    const throttleMs = 16; // ~60fps

    const handleMouseMove = (e: MouseEvent) => {
      const now = performance.now();
      if (now - lastUpdate < throttleMs) return;
      lastUpdate = now;

      if (isDragging) {
        const deltaX = e.clientX - dragStartRef.current.x;
        const deltaY = e.clientY - dragStartRef.current.y;

        const newX = Math.max(0, Math.min(
          window.innerWidth - 100,
          dragStartRef.current.panelX + deltaX
        ));
        const newY = Math.max(0, Math.min(
          window.innerHeight - 100,
          dragStartRef.current.panelY + deltaY
        ));

        setPosition({ x: newX, y: newY });
      }

      if (isResizing) {
        const deltaX = e.clientX - resizeStartRef.current.x;
        const deltaY = e.clientY - resizeStartRef.current.y;

        let newWidth = resizeStartRef.current.width;
        let newHeight = resizeStartRef.current.height;
        let newX = resizeStartRef.current.panelX;
        let newY = resizeStartRef.current.panelY;

        if (isResizing.includes('e')) {
          newWidth = Math.min(MAX_SIZE.width, Math.max(MIN_SIZE.width, resizeStartRef.current.width + deltaX));
        }
        if (isResizing.includes('w')) {
          const widthDelta = -deltaX;
          newWidth = Math.min(MAX_SIZE.width, Math.max(MIN_SIZE.width, resizeStartRef.current.width + widthDelta));
          if (newWidth !== resizeStartRef.current.width) {
            newX = resizeStartRef.current.panelX - (newWidth - resizeStartRef.current.width);
          }
        }
        if (isResizing.includes('s')) {
          newHeight = Math.min(MAX_SIZE.height, Math.max(MIN_SIZE.height, resizeStartRef.current.height + deltaY));
        }
        if (isResizing.includes('n')) {
          const heightDelta = -deltaY;
          newHeight = Math.min(MAX_SIZE.height, Math.max(MIN_SIZE.height, resizeStartRef.current.height + heightDelta));
          if (newHeight !== resizeStartRef.current.height) {
            newY = resizeStartRef.current.panelY - (newHeight - resizeStartRef.current.height);
          }
        }

        setSize({ width: newWidth, height: newHeight });
        setPosition({ x: Math.max(0, newX), y: Math.max(0, newY) });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing]);

  // Keyboard shortcuts for tabs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case '1': setActiveTab('satellites'); break;
        case '2': setActiveTab('alerts'); break;
        case '3': setActiveTab('timeline'); break;
        case '4': setActiveTab('debris'); break;
        case '5': setActiveTab('settings'); break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'satellites':
        return (
          <SatellitesTab
            satellites={satellites}
            positions={positions}
            filters={filters}
            onFiltersChange={onFiltersChange}
            onSatelliteSelect={onSatelliteSelect}
            onSatelliteFocus={onSatelliteFocus}
          />
        );
      case 'alerts':
        return (
          <AlertsTab
            conjunctions={conjunctions}
            onConjunctionSelect={onConjunctionSelect}
            onConjunctionFocus={onSatelliteFocus}
          />
        );
      case 'timeline':
        return (
          <TimelineTab
            history={history}
            onPlay={onTimelinePlay}
            onPause={onTimelinePause}
            onSeek={onTimelineSeek}
            onSpeedChange={onSpeedChange}
            onToggleRecording={onToggleRecording}
            conjunctionHistory={conjunctionHistory}
            onFetchHistory={onFetchHistory}
            onFetchConjunctionHistory={onFetchConjunctionHistory}
            onConjunctionHistoryClick={onConjunctionHistoryClick}
          />
        );
      case 'debris':
        return (
          <DebrisTab
            debris={debris}
            statistics={debrisStats}
            filters={debrisFilters}
            onFiltersChange={onDebrisFiltersChange}
            onDebrisSelect={onDebrisSelect}
            onDebrisFocus={onDebrisFocus}
            selectedDebrisId={selectedDebrisId}
          />
        );
      case 'settings':
        return onUpdateTLEs && onToggleTLESource ? (
          <SettingsTab
            tleSources={tleSources}
            lastUpdateTime={lastTLEUpdate}
            totalSatellites={satellites.length}
            onUpdateTLEs={onUpdateTLEs}
            onToggleSource={onToggleTLESource}
          />
        ) : (
          <div style={{ padding: 20, textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
            TLE updates not configured
          </div>
        );
    }
  };

  return (
    <div
      ref={panelRef}
      className={`unified-panel liquid-glass ${isMinimized ? 'minimized' : ''} ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''} ${isMaximized ? 'maximized' : ''}`}
      style={{
        left: isMaximized ? 10 : position.x,
        top: isMaximized ? 10 : position.y,
        width: isMinimized ? 320 : (isMaximized ? window.innerWidth - 20 : size.width),
        height: isMinimized ? 52 : (isMaximized ? window.innerHeight - 80 : size.height),
      }}
    >
      {/* Resize handles */}
      {!isMinimized && !isMaximized && (
        <>
          <div className="resize-handle resize-n" onMouseDown={(e) => handleResizeStart(e, 'n')} />
          <div className="resize-handle resize-s" onMouseDown={(e) => handleResizeStart(e, 's')} />
          <div className="resize-handle resize-e" onMouseDown={(e) => handleResizeStart(e, 'e')} />
          <div className="resize-handle resize-w" onMouseDown={(e) => handleResizeStart(e, 'w')} />
          <div className="resize-handle resize-nw" onMouseDown={(e) => handleResizeStart(e, 'nw')} />
          <div className="resize-handle resize-ne" onMouseDown={(e) => handleResizeStart(e, 'ne')} />
          <div className="resize-handle resize-sw" onMouseDown={(e) => handleResizeStart(e, 'sw')} />
          <div className="resize-handle resize-se" onMouseDown={(e) => handleResizeStart(e, 'se')} />
        </>
      )}

      {/* Header */}
      <div className="panel-header" onMouseDown={handleMouseDown}>
        <div className="header-drag">
          <GripVertical size={14} className="drag-icon" />
          <span className="panel-title">OrbitOps Control</span>
        </div>
        <div className="panel-controls">
          <button
            className="panel-btn"
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? <Plus size={14} /> : <Minus size={14} />}
          </button>
          <button
            className="panel-btn"
            onClick={handleMaximize}
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            className="panel-btn close"
            onClick={onClose}
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      {!isMinimized && (
        <div className="panel-tabs">
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              title={`${tab.label} (${index + 1})`}
            >
              {tab.icon}
              <span className="tab-label">{tab.label}</span>
              {tab.badge !== undefined && (
                <span className={`tab-badge ${tab.badgeType === 'alert' ? 'alert' : ''}`}>
                  {tab.badge > 999 ? '999+' : tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {!isMinimized && (
        <div className="panel-content">
          {renderTabContent()}
        </div>
      )}

      <style>{`
        .unified-panel {
          position: fixed;
          z-index: 200;
          display: flex;
          flex-direction: column;
          transition: box-shadow 0.2s ease;
          touch-action: none;
        }

        .unified-panel.minimized {
          overflow: hidden;
        }

        .unified-panel.dragging {
          cursor: grabbing !important;
          user-select: none;
          transition: none;
          box-shadow:
            0 0 0 2px var(--accent-cyan, #00d4ff),
            0 25px 80px rgba(0, 212, 255, 0.25),
            var(--glass-shadow);
        }

        .unified-panel.dragging * {
          cursor: grabbing !important;
          user-select: none;
        }

        .unified-panel.resizing {
          transition: none;
          user-select: none;
        }

        .unified-panel.maximized {
          border-radius: 16px;
        }

        .unified-panel .panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          cursor: grab;
          user-select: none;
          flex-shrink: 0;
        }

        .unified-panel .panel-header:active {
          cursor: grabbing;
        }

        .header-drag {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .drag-icon {
          color: rgba(255, 255, 255, 0.3);
        }

        .panel-title {
          font-size: 14px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
          letter-spacing: -0.01em;
        }

        .panel-controls {
          display: flex;
          gap: 6px;
        }

        .unified-panel .panel-btn {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.5);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .unified-panel .panel-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.15);
          color: rgba(255, 255, 255, 0.9);
        }

        .unified-panel .panel-btn.close:hover {
          background: rgba(255, 68, 68, 0.15);
          border-color: rgba(255, 68, 68, 0.4);
          color: var(--accent-red, #ff3b3b);
        }

        .panel-tabs {
          display: flex;
          padding: 8px 12px;
          gap: 6px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          flex-shrink: 0;
          overflow-x: auto;
        }

        .tab-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 10px;
          color: rgba(255, 255, 255, 0.5);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
          flex: 1;
          justify-content: center;
        }

        .tab-btn:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.8);
        }

        .tab-btn.active {
          background: rgba(0, 212, 255, 0.1);
          border-color: rgba(0, 212, 255, 0.3);
          color: var(--accent-cyan, #00d4ff);
          box-shadow: 0 0 20px rgba(0, 212, 255, 0.1);
        }

        .tab-btn.active svg {
          filter: drop-shadow(0 0 6px var(--accent-cyan, #00d4ff));
        }

        .tab-label {
          display: none;
        }

        @media (min-width: 500px) {
          .tab-label {
            display: inline;
          }
        }

        .tab-badge {
          padding: 2px 7px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          font-size: 10px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }

        .tab-badge.alert {
          background: rgba(255, 136, 0, 0.2);
          color: #ff8800;
          animation: badgePulse 2s ease infinite;
        }

        @keyframes badgePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        .unified-panel .panel-content {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .unified-panel .panel-content > * {
          flex: 1;
          overflow-y: auto;
        }

        /* Resize handles */
        .resize-handle {
          position: absolute;
          z-index: 10;
        }

        .resize-n { top: -4px; left: 10px; right: 10px; height: 8px; cursor: ns-resize; }
        .resize-s { bottom: -4px; left: 10px; right: 10px; height: 8px; cursor: ns-resize; }
        .resize-e { right: -4px; top: 10px; bottom: 10px; width: 8px; cursor: ew-resize; }
        .resize-w { left: -4px; top: 10px; bottom: 10px; width: 8px; cursor: ew-resize; }
        .resize-nw { top: -4px; left: -4px; width: 16px; height: 16px; cursor: nwse-resize; }
        .resize-ne { top: -4px; right: -4px; width: 16px; height: 16px; cursor: nesw-resize; }
        .resize-sw { bottom: -4px; left: -4px; width: 16px; height: 16px; cursor: nesw-resize; }
        .resize-se { bottom: -4px; right: -4px; width: 16px; height: 16px; cursor: nwse-resize; }
      `}</style>
    </div>
  );
}

export const UnifiedPanel = memo(UnifiedPanelComponent);
