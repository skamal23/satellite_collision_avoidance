import { RefreshCw, Settings, Sun, Moon } from 'lucide-react';

interface HeaderProps {
  theme: 'light' | 'dark';
  onThemeToggle: () => void;
  satelliteCount: number;
  conjunctionCount: number;
  onRefresh: () => void;
  loading: boolean;
}

export function Header({
  theme,
  onThemeToggle,
  satelliteCount,
  conjunctionCount,
  onRefresh,
  loading,
}: HeaderProps) {
  return (
    <header className="app-header liquid-glass">
      {/* Logo */}
      <div className="logo">
        <svg className="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <ellipse cx="12" cy="12" rx="10" ry="4" />
          <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)" />
          <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)" />
        </svg>
        <span>
          Orbit<span style={{ color: 'var(--accent-primary)' }}>Ops</span>
        </span>
      </div>

      {/* Stats */}
      <div className="stats">
        <div className="stat">
          <div className="stat-dot active" />
          <span>{satelliteCount} satellites</span>
        </div>
        <div className="stat">
          <div className="stat-dot warning" />
          <span>{conjunctionCount} conjunctions</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onRefresh}
          className="panel-btn"
          title="Refresh data"
          disabled={loading}
        >
          <RefreshCw 
            size={16} 
            style={{ 
              animation: loading ? 'spin 1s linear infinite' : 'none' 
            }} 
          />
        </button>
        <button className="panel-btn" title="Settings">
          <Settings size={16} />
        </button>
        <button
          onClick={onThemeToggle}
          className="panel-btn"
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </header>
  );
}
