import { memo } from 'react';
import { Orbit, AlertTriangle, HelpCircle, Settings, Cpu } from 'lucide-react';

interface TopBarProps {
  satelliteCount: number;
  conjunctionCount: number;
  fps: number;
  onSettingsClick: () => void;
  onHelpClick: () => void;
}

function TopBarComponent({
  satelliteCount,
  conjunctionCount,
  fps,
  onSettingsClick,
  onHelpClick,
}: TopBarProps) {
  return (
    <header className="top-bar">
      {/* Logo */}
      <div className="top-bar-logo">
        <Orbit className="logo-icon" />
        <span className="logo-text">OrbitOps</span>
      </div>

      {/* Quick Stats */}
      <div className="top-bar-stats">
        <div className="stat-item">
          <span className="stat-label">Satellites</span>
          <span className="stat-value">{satelliteCount.toLocaleString()}</span>
        </div>
        <div className="stat-divider" />
        <div className="stat-item alerts">
          <AlertTriangle size={14} />
          <span className="stat-label">Alerts</span>
          <span className={`stat-value ${conjunctionCount > 0 ? 'alert-active' : ''}`}>
            {conjunctionCount}
          </span>
        </div>
        <div className="stat-divider" />
        <div className="stat-item">
          <Cpu size={14} />
          <span className={`stat-value fps ${fps >= 50 ? 'good' : fps >= 30 ? 'ok' : 'bad'}`}>
            {fps} FPS
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="top-bar-actions">
        <button
          className="top-bar-btn"
          onClick={onHelpClick}
          title="Help & Tour"
        >
          <HelpCircle size={18} />
        </button>
        <button
          className="top-bar-btn"
          onClick={onSettingsClick}
          title="Settings"
        >
          <Settings size={18} />
        </button>
      </div>

      <style>{`
        .top-bar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 16px;
          background: rgba(10, 15, 25, 0.8);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          z-index: 200;
        }

        .top-bar-logo {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .logo-icon {
          width: 24px;
          height: 24px;
          color: var(--accent-cyan, #00d4ff);
        }

        .logo-text {
          font-size: 18px;
          font-weight: 700;
          color: white;
          letter-spacing: -0.5px;
        }

        .top-bar-stats {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .stat-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
        }

        .stat-item.alerts svg {
          color: var(--accent-yellow, #ffcc00);
        }

        .stat-label {
          color: rgba(255, 255, 255, 0.5);
        }

        .stat-value {
          color: white;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }

        .stat-value.alert-active {
          color: var(--accent-red, #ff4444);
          animation: pulse-color 2s ease infinite;
        }

        .stat-value.fps.good { color: var(--accent-green, #00ff88); }
        .stat-value.fps.ok { color: var(--accent-yellow, #ffcc00); }
        .stat-value.fps.bad { color: var(--accent-red, #ff4444); }

        .stat-divider {
          width: 1px;
          height: 20px;
          background: rgba(255, 255, 255, 0.15);
        }

        .top-bar-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .top-bar-btn {
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

        .top-bar-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: white;
          border-color: rgba(255, 255, 255, 0.2);
        }

        @keyframes pulse-color {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        @media (max-width: 640px) {
          .stat-label { display: none; }
          .top-bar-stats { gap: 12px; }
        }
      `}</style>
    </header>
  );
}

export const TopBar = memo(TopBarComponent);
