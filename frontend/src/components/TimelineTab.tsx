import { memo, useCallback, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Rewind, FastForward, Circle, History, Download, AlertTriangle, RefreshCw } from 'lucide-react';
import type { HistoryState, ConjunctionHistoryEntry, HistoryResponse, ConjunctionHistoryResponse } from '../types';

interface TimelineTabProps {
  history: HistoryState;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onSpeedChange: (speed: number) => void;
  onToggleRecording: () => void;
  // New props for server-backed history
  conjunctionHistory?: ConjunctionHistoryEntry[];
  onFetchHistory?: (startTime: number, endTime: number) => Promise<HistoryResponse>;
  onFetchConjunctionHistory?: (startTime: number, endTime: number) => Promise<ConjunctionHistoryResponse>;
  onConjunctionHistoryClick?: (entry: ConjunctionHistoryEntry) => void;
}

function TimelineTabComponent({
  history,
  onPlay,
  onPause,
  onSeek,
  onSpeedChange,
  onToggleRecording,
  conjunctionHistory = [],
  onFetchHistory,
  onFetchConjunctionHistory,
  onConjunctionHistoryClick,
}: TimelineTabProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(null);
  const [loadedTimeRange, setLoadedTimeRange] = useState<{ start: number; end: number } | null>(null);

  const formatTime = useCallback((seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  const progress = history.endTime > history.startTime
    ? ((history.currentTime - history.startTime) / (history.endTime - history.startTime)) * 100
    : 0;

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = history.startTime + percent * (history.endTime - history.startTime);
    onSeek(time);
  }, [history.startTime, history.endTime, onSeek]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    handleSeek(e);
  }, [handleSeek]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) {
      handleSeek(e);
    }
  }, [isDragging, handleSeek]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Load history from server
  const handleLoadHistory = useCallback(async () => {
    if (!onFetchHistory || !onFetchConjunctionHistory) return;

    setIsLoadingHistory(true);
    setHistoryLoadError(null);

    try {
      // Load last 24 hours of history
      const endTime = Date.now() / 1000;
      const startTime = endTime - 24 * 3600;

      await Promise.all([
        onFetchHistory(startTime, endTime),
        onFetchConjunctionHistory(startTime, endTime),
      ]);

      setLoadedTimeRange({ start: startTime, end: endTime });
    } catch (error) {
      setHistoryLoadError(error instanceof Error ? error.message : 'Failed to load history');
    } finally {
      setIsLoadingHistory(false);
    }
  }, [onFetchHistory, onFetchConjunctionHistory]);

  // Format time ago
  const formatTimeAgo = useCallback((timestamp: number) => {
    const now = Date.now() / 1000;
    const diff = now - timestamp;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }, []);

  // Get position on timeline for event marker
  const getEventMarkerPosition = useCallback((timestamp: number) => {
    if (history.endTime <= history.startTime) return 0;
    return ((timestamp - history.startTime) / (history.endTime - history.startTime)) * 100;
  }, [history.startTime, history.endTime]);

  // Get risk color for conjunction
  const getRiskColor = useCallback((probability: number) => {
    if (probability >= 1e-4) return '#ff3b3b';
    if (probability >= 1e-5) return '#ff9500';
    if (probability >= 1e-6) return '#ffd60a';
    return '#00d4ff';
  }, []);

  const speeds = [0.25, 0.5, 1, 2, 4, 8];

  return (
    <div className="tab-content timeline-tab">
      {/* Header */}
      <div className="timeline-header">
        <div className="header-left">
          <History size={16} />
          <span>History Replay</span>
          {loadedTimeRange && (
            <span className="loaded-badge">Server Data Loaded</span>
          )}
        </div>
        <div className="header-right">
          {onFetchHistory && (
            <button
              onClick={handleLoadHistory}
              className={`load-history-btn ${isLoadingHistory ? 'loading' : ''}`}
              disabled={isLoadingHistory}
              title="Load 24h history from server"
            >
              {isLoadingHistory ? (
                <>
                  <RefreshCw size={12} className="spinning" />
                  Loading...
                </>
              ) : (
                <>
                  <Download size={12} />
                  Load History
                </>
              )}
            </button>
          )}
          <button
            onClick={onToggleRecording}
            className={`record-btn ${history.isRecording ? 'recording' : ''}`}
            title={history.isRecording ? 'Stop recording' : 'Start recording'}
          >
            <Circle size={12} fill={history.isRecording ? '#ff3b3b' : 'transparent'} />
            {history.isRecording ? 'Recording' : 'Record'}
          </button>
        </div>
      </div>

      {/* Error Display */}
      {historyLoadError && (
        <div className="history-error">
          <AlertTriangle size={14} />
          <span>{historyLoadError}</span>
        </div>
      )}

      {/* Timeline Bar */}
      <div
        className="timeline-bar"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div className="timeline-track">
          <div className="timeline-progress" style={{ width: `${progress}%` }} />
          {/* Conjunction Event Markers */}
          {conjunctionHistory.map((entry, idx) => {
            const pos = getEventMarkerPosition(entry.timestamp);
            if (pos < 0 || pos > 100) return null;
            return (
              <div
                key={idx}
                className="event-marker"
                style={{
                  left: `${pos}%`,
                  backgroundColor: getRiskColor(entry.conjunction.collisionProbability),
                }}
                title={`${entry.conjunction.sat1Name} ↔ ${entry.conjunction.sat2Name} - ${(entry.conjunction.collisionProbability * 100).toFixed(4)}%`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek(entry.timestamp);
                  onConjunctionHistoryClick?.(entry);
                }}
              />
            );
          })}
          <div className="timeline-thumb" style={{ left: `${progress}%` }} />
        </div>
        <div className="timeline-times">
          <span>{formatTime(history.currentTime - history.startTime)}</span>
          <span>{formatTime(history.endTime - history.startTime)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="timeline-controls">
        {/* Playback Controls */}
        <div className="playback-controls">
          <button
            onClick={() => onSeek(history.startTime)}
            className="control-btn"
            title="Go to start (Home)"
          >
            <SkipBack size={16} />
          </button>

          <button
            onClick={() => onSeek(Math.max(history.startTime, history.currentTime - 60))}
            className="control-btn"
            title="Rewind 1 min"
          >
            <Rewind size={16} />
          </button>

          {history.isPlaying ? (
            <button onClick={onPause} className="control-btn play-btn" title="Pause (Space)">
              <Pause size={20} />
            </button>
          ) : (
            <button onClick={onPlay} className="control-btn play-btn" title="Play (Space)">
              <Play size={20} />
            </button>
          )}

          <button
            onClick={() => onSeek(Math.min(history.endTime, history.currentTime + 60))}
            className="control-btn"
            title="Forward 1 min"
          >
            <FastForward size={16} />
          </button>

          <button
            onClick={() => onSeek(history.endTime)}
            className="control-btn"
            title="Go to end (End)"
          >
            <SkipForward size={16} />
          </button>
        </div>

        {/* Speed Controls */}
        <div className="speed-controls">
          <span className="speed-label">Speed:</span>
          <div className="speed-buttons">
            {speeds.map(speed => (
              <button
                key={speed}
                onClick={() => onSpeedChange(speed)}
                className={`speed-btn ${history.playbackSpeed === speed ? 'active' : ''}`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="timeline-info">
        <div className="info-item">
          <span className="info-label">Current:</span>
          <span className="info-value">{formatTime(history.currentTime - history.startTime)}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Duration:</span>
          <span className="info-value">{formatTime(history.endTime - history.startTime)}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Speed:</span>
          <span className="info-value">{history.playbackSpeed}x</span>
        </div>
      </div>

      {/* Conjunction History Events */}
      {conjunctionHistory.length > 0 && (
        <div className="conjunction-history-section">
          <div className="section-header">
            <AlertTriangle size={14} />
            <span>Conjunction Events ({conjunctionHistory.length})</span>
          </div>
          <div className="conjunction-history-list">
            {conjunctionHistory.slice(0, 5).map((entry, idx) => (
              <div
                key={idx}
                className="conjunction-history-item"
                onClick={() => {
                  onSeek(entry.timestamp);
                  onConjunctionHistoryClick?.(entry);
                }}
              >
                <div className="conj-indicator" style={{ backgroundColor: getRiskColor(entry.conjunction.collisionProbability) }} />
                <div className="conj-details">
                  <span className="conj-names">
                    {entry.conjunction.sat1Name} ↔ {entry.conjunction.sat2Name}
                  </span>
                  <span className="conj-meta">
                    {entry.conjunction.missDistance.toFixed(2)} km • {formatTimeAgo(entry.timestamp)}
                  </span>
                </div>
                <div className="conj-prob">
                  {(entry.conjunction.collisionProbability * 100).toFixed(4)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .timeline-tab {
          display: flex;
          flex-direction: column;
          height: 100%;
          padding: 16px 20px;
          gap: 16px;
        }

        .timeline-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
        }

        .header-left svg {
          color: var(--accent-cyan, #00d4ff);
        }

        .record-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.7);
          font-size: 12px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .record-btn:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .record-btn.recording {
          border-color: rgba(255, 59, 59, 0.5);
          color: #ff3b3b;
          animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        .timeline-bar {
          flex-shrink: 0;
        }

        .timeline-track {
          position: relative;
          height: 8px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          cursor: pointer;
        }

        .timeline-progress {
          position: absolute;
          left: 0;
          top: 0;
          height: 100%;
          background: linear-gradient(90deg, var(--accent-cyan, #00d4ff), var(--accent-green, #00ff88));
          border-radius: 4px;
          transition: width 0.1s ease;
        }

        .timeline-thumb {
          position: absolute;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 16px;
          height: 16px;
          background: white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          transition: transform 0.1s ease;
        }

        .timeline-track:hover .timeline-thumb {
          transform: translate(-50%, -50%) scale(1.2);
        }

        .timeline-times {
          display: flex;
          justify-content: space-between;
          margin-top: 6px;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.4);
          font-variant-numeric: tabular-nums;
        }

        .timeline-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;
        }

        .playback-controls {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .control-btn {
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
          transition: all 0.15s ease;
        }

        .control-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: white;
        }

        .play-btn {
          width: 44px;
          height: 44px;
          background: var(--accent-cyan, #00d4ff);
          border-color: var(--accent-cyan, #00d4ff);
          color: rgba(10, 15, 25, 0.95);
        }

        .play-btn:hover {
          background: var(--accent-green, #00ff88);
          border-color: var(--accent-green, #00ff88);
        }

        .speed-controls {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .speed-label {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
        }

        .speed-buttons {
          display: flex;
        }

        .speed-btn {
          padding: 5px 10px;
          font-size: 11px;
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.5);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .speed-btn:first-child {
          border-radius: 6px 0 0 6px;
        }

        .speed-btn:last-child {
          border-radius: 0 6px 6px 0;
        }

        .speed-btn:not(:last-child) {
          border-right: none;
        }

        .speed-btn:hover {
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.8);
        }

        .speed-btn.active {
          background: var(--accent-cyan, #00d4ff);
          border-color: var(--accent-cyan, #00d4ff);
          color: rgba(10, 15, 25, 0.95);
        }

        .timeline-info {
          display: flex;
          gap: 24px;
          padding: 12px 14px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 10px;
          flex-shrink: 0;
        }

        .info-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .info-label {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.4);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .info-value {
          font-size: 14px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
          font-variant-numeric: tabular-nums;
        }

        /* Load History Button */
        .load-history-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          background: rgba(0, 212, 255, 0.1);
          border: 1px solid rgba(0, 212, 255, 0.3);
          border-radius: 8px;
          color: var(--accent-cyan, #00d4ff);
          font-size: 12px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .load-history-btn:hover:not(:disabled) {
          background: rgba(0, 212, 255, 0.2);
          border-color: rgba(0, 212, 255, 0.5);
        }

        .load-history-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .load-history-btn .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .loaded-badge {
          padding: 2px 8px;
          background: rgba(0, 255, 136, 0.15);
          border: 1px solid rgba(0, 255, 136, 0.3);
          border-radius: 6px;
          font-size: 10px;
          color: var(--accent-green, #00ff88);
          font-weight: 500;
        }

        /* Error Display */
        .history-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          background: rgba(255, 59, 59, 0.1);
          border: 1px solid rgba(255, 59, 59, 0.3);
          border-radius: 8px;
          color: #ff6b6b;
          font-size: 12px;
        }

        /* Event Markers */
        .event-marker {
          position: absolute;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 10px;
          height: 10px;
          border-radius: 50%;
          cursor: pointer;
          z-index: 5;
          box-shadow: 0 0 6px currentColor;
          transition: transform 0.15s ease;
        }

        .event-marker:hover {
          transform: translate(-50%, -50%) scale(1.4);
          z-index: 10;
        }

        /* Conjunction History Section */
        .conjunction-history-section {
          flex-shrink: 0;
          max-height: 200px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .section-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.7);
        }

        .section-header svg {
          color: var(--accent-yellow, #ffd60a);
        }

        .conjunction-history-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .conjunction-history-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .conjunction-history-item:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.1);
        }

        .conj-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .conj-details {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .conj-names {
          font-size: 12px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.9);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .conj-meta {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.4);
        }

        .conj-prob {
          font-size: 11px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.7);
          font-variant-numeric: tabular-nums;
        }
      `}</style>
    </div>
  );
}

export const TimelineTab = memo(TimelineTabComponent);
