import { memo, useCallback, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Rewind, FastForward, Circle } from 'lucide-react';
import type { HistoryState } from '../types';

interface TimelineControlProps {
  history: HistoryState;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onSpeedChange: (speed: number) => void;
  onToggleRecording: () => void;
}

function TimelineControlComponent({
  history,
  onPlay,
  onPause,
  onSeek,
  onSpeedChange,
  onToggleRecording,
}: TimelineControlProps) {
  const [isDragging, setIsDragging] = useState(false);
  
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
  
  const speeds = [0.25, 0.5, 1, 2, 4, 8];
  
  return (
    <div className="timeline-control liquid-glass">
      {/* Timeline bar */}
      <div 
        className="timeline-bar"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div className="timeline-progress" style={{ width: `${progress}%` }} />
        <div className="timeline-thumb" style={{ left: `${progress}%` }} />
      </div>
      
      {/* Controls */}
      <div className="timeline-controls">
        {/* Left: Time display */}
        <div className="time-display">
          <span className="current-time">{formatTime(history.currentTime - history.startTime)}</span>
          <span className="time-separator">/</span>
          <span className="total-time">{formatTime(history.endTime - history.startTime)}</span>
        </div>
        
        {/* Center: Playback controls */}
        <div className="playback-controls">
          <button 
            onClick={() => onSeek(history.startTime)} 
            className="control-btn"
            title="Go to start"
          >
            <SkipBack size={16} />
          </button>
          
          <button 
            onClick={() => onSeek(Math.max(history.startTime, history.currentTime - 60))}
            className="control-btn"
            title="Rewind 1 minute"
          >
            <Rewind size={16} />
          </button>
          
          {history.isPlaying ? (
            <button onClick={onPause} className="control-btn play-btn" title="Pause">
              <Pause size={20} />
            </button>
          ) : (
            <button onClick={onPlay} className="control-btn play-btn" title="Play">
              <Play size={20} />
            </button>
          )}
          
          <button 
            onClick={() => onSeek(Math.min(history.endTime, history.currentTime + 60))}
            className="control-btn"
            title="Forward 1 minute"
          >
            <FastForward size={16} />
          </button>
          
          <button 
            onClick={() => onSeek(history.endTime)} 
            className="control-btn"
            title="Go to end"
          >
            <SkipForward size={16} />
          </button>
        </div>
        
        {/* Right: Speed & Recording */}
        <div className="speed-controls">
          {/* Speed selector */}
          <div className="speed-selector">
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
          
          {/* Recording indicator */}
          <button 
            onClick={onToggleRecording}
            className={`control-btn record-btn ${history.isRecording ? 'recording' : ''}`}
            title={history.isRecording ? 'Stop recording' : 'Start recording'}
          >
            <Circle size={14} fill={history.isRecording ? '#ff3b3b' : 'transparent'} />
          </button>
        </div>
      </div>
      
      <style>{`
        .timeline-control {
          position: fixed;
          bottom: 80px;
          left: 50%;
          transform: translateX(-50%);
          width: min(800px, calc(100vw - 40px));
          padding: 12px 16px;
          z-index: 150;
        }
        
        .timeline-bar {
          position: relative;
          height: 8px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          cursor: pointer;
          margin-bottom: 12px;
        }
        
        .timeline-progress {
          position: absolute;
          left: 0;
          top: 0;
          height: 100%;
          background: linear-gradient(90deg, var(--accent-cyan), var(--accent-green));
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
        
        .timeline-bar:hover .timeline-thumb {
          transform: translate(-50%, -50%) scale(1.2);
        }
        
        .timeline-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        
        .time-display {
          font-size: 12px;
          font-family: 'JetBrains Mono', monospace;
          color: var(--text-secondary);
          min-width: 100px;
        }
        
        .current-time {
          color: var(--text-primary);
          font-weight: 600;
        }
        
        .time-separator {
          margin: 0 4px;
          opacity: 0.5;
        }
        
        .playback-controls {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .control-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        
        .control-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: var(--text-primary);
        }
        
        .play-btn {
          width: 40px;
          height: 40px;
          background: var(--accent-cyan);
          border-color: var(--accent-cyan);
          color: var(--bg-space);
        }
        
        .play-btn:hover {
          background: var(--accent-green);
          border-color: var(--accent-green);
        }
        
        .record-btn.recording {
          border-color: var(--accent-red);
          animation: pulse 1s infinite;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        .speed-controls {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .speed-selector {
          display: flex;
          gap: 2px;
        }
        
        .speed-btn {
          padding: 4px 8px;
          font-size: 10px;
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.15s ease;
        }
        
        .speed-btn:first-child {
          border-radius: 6px 0 0 6px;
        }
        
        .speed-btn:last-child {
          border-radius: 0 6px 6px 0;
        }
        
        .speed-btn:hover {
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-secondary);
        }
        
        .speed-btn.active {
          background: var(--accent-cyan);
          border-color: var(--accent-cyan);
          color: var(--bg-space);
        }
      `}</style>
    </div>
  );
}

export const TimelineControl = memo(TimelineControlComponent);

