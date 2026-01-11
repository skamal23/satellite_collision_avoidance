import { motion } from 'framer-motion';
import { Clock, Wifi, Database, Cpu, Globe } from 'lucide-react';

interface StatusBarProps {
  time: number;
  connected: boolean;
  fps: number;
}

export function StatusBar({ time, connected, fps }: StatusBarProps) {
  const currentTime = new Date();
  
  return (
    <motion.footer
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40"
    >
      <div className="glass-panel px-4 py-2.5 flex items-center gap-6">
        {/* Simulation Time */}
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[var(--text-muted)]" />
          <div className="text-sm">
            <span className="text-[var(--text-muted)]">UTC: </span>
            <span className="text-mono font-medium">
              {currentTime.toISOString().slice(11, 19)}
            </span>
          </div>
        </div>

        <div className="w-px h-4 bg-[var(--border-glass)]" />

        {/* Mission Elapsed Time */}
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-[var(--text-muted)]" />
          <div className="text-sm">
            <span className="text-[var(--text-muted)]">MET: </span>
            <span className="text-mono font-medium">
              T+{Math.floor(time / 60).toString().padStart(2, '0')}:{(time % 60).toString().padStart(2, '0')}
            </span>
          </div>
        </div>

        <div className="w-px h-4 bg-[var(--border-glass)]" />

        {/* Connection Status */}
        <div className="flex items-center gap-2">
          <Wifi className={`w-4 h-4 ${connected ? 'text-[var(--accent-success)]' : 'text-[var(--accent-danger)]'}`} />
          <span className="text-sm text-[var(--text-muted)]">
            {connected ? 'Live' : 'Offline'}
          </span>
        </div>

        <div className="w-px h-4 bg-[var(--border-glass)]" />

        {/* Performance */}
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[var(--text-muted)]" />
          <span className="text-sm text-mono text-[var(--text-muted)]">
            {fps} FPS
          </span>
        </div>
      </div>
    </motion.footer>
  );
}


