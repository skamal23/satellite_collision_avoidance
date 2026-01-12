import { Clock, Globe, Wifi, Gauge } from 'lucide-react';

interface StatusBarProps {
  time: number;
  connected: boolean;
  fps: number;
}

function formatUTC(): string {
  return new Date().toISOString().substr(11, 8);
}

function formatMET(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `T+${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function StatusBar({ time, connected, fps }: StatusBarProps) {
  return (
    <footer className="status-bar liquid-glass">
      <div className="status-item">
        <Clock size={14} className="status-icon" />
        <span>UTC: {formatUTC()}</span>
      </div>
      
      <div className="status-item">
        <Globe size={14} className="status-icon" />
        <span>MET: {formatMET(time)}</span>
      </div>
      
      <div className="live-indicator">
        <Wifi size={14} />
        <div className="live-dot" />
        <span>{connected ? 'Live' : 'Offline'}</span>
      </div>
      
      <div className="status-item">
        <Gauge size={14} className="status-icon" />
        <span>{fps} FPS</span>
      </div>
    </footer>
  );
}
