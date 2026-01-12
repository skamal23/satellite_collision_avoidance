import { useState, useEffect } from 'react';
import { Clock, Timer, Wifi, Cpu } from 'lucide-react';

interface StatusBarProps {
  time: number;
  connected: boolean;
  fps: number;
}

export function StatusBar({ time, connected, fps }: StatusBarProps) {
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

  return (
    <footer className="status-bar liquid-glass">
      <div className="status-item">
        <Clock size={12} />
        <span>UTC: {utcTime.toLocaleTimeString('en-US', { hour12: false })}</span>
      </div>
      
      <div className="status-item">
        <Timer size={12} />
        <span>MET: {formatMET(time)}</span>
      </div>
      
      <div className={`live-badge ${connected ? '' : 'disconnected'}`}>
        <span className="live-dot" />
        <Wifi size={12} />
        <span>{connected ? 'Live' : 'Offline'}</span>
      </div>
      
      <div className="status-item">
        <Cpu size={12} />
        <span>{fps.toFixed(0)} FPS</span>
      </div>
    </footer>
  );
}
