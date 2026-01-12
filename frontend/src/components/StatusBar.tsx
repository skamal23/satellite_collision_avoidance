import { useState, useEffect, memo } from 'react';
import { Clock, Timer, Cpu, RefreshCw, Settings, Satellite, AlertTriangle, Gauge } from 'lucide-react';

interface StatusBarProps {
  time: number;
  fps: number;
  satelliteCount: number;
  conjunctionCount: number;
  onRefresh: () => void;
  loading: boolean;
  onSettingsClick?: () => void;
  onPerformanceClick?: () => void;
}

function StatusBarComponent({
  time,
  fps,
  satelliteCount,
  conjunctionCount,
  onRefresh,
  loading,
  onSettingsClick,
  onPerformanceClick,
}: StatusBarProps) {
  const [utcTime, setUtcTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setUtcTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatMET = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `T+${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Pad FPS to prevent layout shift
  const fpsDisplay = fps.toString().padStart(2, ' ');

  return (
    <footer className="status-bar liquid-glass">
      {/* Left: Time info */}
      <div className="status-item">
        <Clock size={16} />
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          UTC: {utcTime.toLocaleTimeString('en-US', { hour12: false })}
        </span>
      </div>
      
      <div className="status-item">
        <Timer size={16} />
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          MET: {formatMET(time)}
        </span>
      </div>

      <div className="status-divider" />

      {/* Center: Counts */}
      <div className="status-item">
        <Satellite size={16} className="text-cyan" />
        <strong style={{ fontVariantNumeric: 'tabular-nums', minWidth: 32 }}>
          {satelliteCount}
        </strong>
        <span>satellites</span>
      </div>

      <div className="status-item">
        <AlertTriangle size={16} className="text-yellow" />
        <strong style={{ fontVariantNumeric: 'tabular-nums', minWidth: 20 }}>
          {conjunctionCount}
        </strong>
        <span>conjunctions</span>
      </div>

      <div className="status-divider" />

      {/* Right: Actions & FPS */}
      <button
        onClick={onRefresh}
        className="panel-btn"
        title="Refresh data"
        disabled={loading}
      >
        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
      </button>

      <button
        className="panel-btn"
        title="Settings"
        onClick={onSettingsClick}
      >
        <Settings size={16} />
      </button>

      <button
        className="panel-btn"
        title="Performance Metrics"
        onClick={onPerformanceClick}
      >
        <Gauge size={16} />
      </button>

      <div className="status-item" style={{ minWidth: 70 }}>
        <Cpu size={16} />
        <span style={{ fontVariantNumeric: 'tabular-nums', minWidth: 45, textAlign: 'right' }}>
          {fpsDisplay} FPS
        </span>
      </div>
    </footer>
  );
}

export const StatusBar = memo(StatusBarComponent);
