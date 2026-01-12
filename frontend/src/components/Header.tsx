import { RefreshCw, Settings, Satellite } from 'lucide-react';

interface HeaderProps {
  satelliteCount: number;
  conjunctionCount: number;
  onRefresh: () => void;
  loading: boolean;
}

export function Header({
  satelliteCount,
  conjunctionCount,
  onRefresh,
  loading,
}: HeaderProps) {
  return (
    <header className="app-header liquid-glass">
      {/* Logo */}
      <div className="logo">
        <Satellite />
        <span>OrbitOps</span>
      </div>

      {/* Stats */}
      <div className="header-stats">
        <div className="stat">
          <span className="stat-dot green" />
          <strong>{satelliteCount}</strong> satellites
        </div>
        <div className="stat">
          <span className="stat-dot yellow" />
          <strong>{conjunctionCount}</strong> conjunctions
        </div>
      </div>

      {/* Actions */}
      <div className="header-actions">
        <button 
          onClick={onRefresh} 
          className="panel-btn" 
          title="Refresh data"
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
        <button className="panel-btn" title="Settings">
          <Settings size={14} />
        </button>
      </div>
    </header>
  );
}
