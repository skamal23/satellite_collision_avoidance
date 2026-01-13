import { memo, useState, useCallback } from 'react';
import { RefreshCw, Database, Check, X, Clock, Satellite, ExternalLink } from 'lucide-react';
import type { TLESource, TLEUpdateResult } from '../types';

interface SettingsTabProps {
  tleSources: TLESource[];
  lastUpdateTime: number | null;
  totalSatellites: number;
  onUpdateTLEs: (sourceNames?: string[]) => Promise<TLEUpdateResult[]>;
  onToggleSource: (sourceName: string, enabled: boolean) => void;
}

function SettingsTabComponent({
  tleSources,
  lastUpdateTime,
  totalSatellites,
  onUpdateTLEs,
  onToggleSource,
}: SettingsTabProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateResults, setUpdateResults] = useState<TLEUpdateResult[] | null>(null);
  const [updatingSource, setUpdatingSource] = useState<string | null>(null);

  const handleUpdateAll = useCallback(async () => {
    setIsUpdating(true);
    setUpdateResults(null);
    try {
      const results = await onUpdateTLEs();
      setUpdateResults(results);
    } finally {
      setIsUpdating(false);
    }
  }, [onUpdateTLEs]);

  const handleUpdateSingle = useCallback(async (sourceName: string) => {
    setUpdatingSource(sourceName);
    try {
      const results = await onUpdateTLEs([sourceName]);
      setUpdateResults(results);
    } finally {
      setUpdatingSource(null);
    }
  }, [onUpdateTLEs]);

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor(Date.now() / 1000 - timestamp);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div className="tab-content settings-tab">
      {/* Header */}
      <div className="settings-header">
        <div className="header-left">
          <Database size={16} />
          <span>TLE Data Sources</span>
        </div>
        <button
          onClick={handleUpdateAll}
          disabled={isUpdating}
          className={`update-all-btn ${isUpdating ? 'updating' : ''}`}
        >
          <RefreshCw size={14} className={isUpdating ? 'spinning' : ''} />
          {isUpdating ? 'Updating...' : 'Update All'}
        </button>
      </div>

      {/* Stats */}
      <div className="tle-stats">
        <div className="stat">
          <Satellite size={14} />
          <span className="stat-value">{totalSatellites.toLocaleString()}</span>
          <span className="stat-label">Total Satellites</span>
        </div>
        <div className="stat">
          <Clock size={14} />
          <span className="stat-value">
            {lastUpdateTime ? formatTimeAgo(lastUpdateTime) : 'Never'}
          </span>
          <span className="stat-label">Last Update</span>
        </div>
      </div>

      {/* Update Results */}
      {updateResults && (
        <div className="update-results">
          <div className="results-header">
            {updateResults.every(r => r.success) ? (
              <><Check size={14} /> All sources updated successfully</>
            ) : (
              <><X size={14} /> Some updates failed</>
            )}
          </div>
          <div className="results-list">
            {updateResults.map((result, i) => (
              <div key={i} className={`result-item ${result.success ? 'success' : 'error'}`}>
                <span className="result-source">{result.sourceName}</span>
                {result.success ? (
                  <span className="result-count">+{result.satellitesUpdated}</span>
                ) : (
                  <span className="result-error">{result.errorMessage}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sources List */}
      <div className="sources-list">
        {tleSources.map((source) => (
          <div key={source.name} className={`source-card ${source.enabled ? '' : 'disabled'}`}>
            <div className="source-header">
              <div className="source-info">
                <span className="source-name">{source.name}</span>
                {source.lastUpdate && (
                  <span className="source-updated">
                    Updated {formatTimeAgo(source.lastUpdate)}
                  </span>
                )}
              </div>
              <div className="source-actions">
                <button
                  onClick={() => handleUpdateSingle(source.name)}
                  disabled={updatingSource === source.name || !source.enabled}
                  className="source-refresh"
                  title="Refresh this source"
                >
                  <RefreshCw size={12} className={updatingSource === source.name ? 'spinning' : ''} />
                </button>
                <button
                  onClick={() => onToggleSource(source.name, !source.enabled)}
                  className={`source-toggle ${source.enabled ? 'active' : ''}`}
                >
                  <div className="toggle-knob" />
                </button>
              </div>
            </div>
            <div className="source-details">
              <span className="source-count">
                {source.satelliteCount?.toLocaleString() ?? '—'} satellites
              </span>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="source-link"
              >
                <ExternalLink size={10} />
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Info */}
      <div className="tle-info">
        <p>
          TLE (Two-Line Element) data is updated from CelesTrak.
          Data accuracy degrades over time; refresh every 12-24 hours for best results.
        </p>
      </div>

      <style>{`
        .settings-tab {
          display: flex;
          flex-direction: column;
          height: 100%;
          padding: 16px 20px;
          gap: 16px;
          overflow-y: auto;
        }

        .settings-header {
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

        .update-all-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          background: var(--accent-cyan, #00d4ff);
          border: none;
          border-radius: 8px;
          color: rgba(10, 15, 25, 0.95);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .update-all-btn:hover {
          background: var(--accent-green, #00ff88);
        }

        .update-all-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .update-all-btn.updating {
          background: rgba(0, 212, 255, 0.3);
          color: var(--accent-cyan, #00d4ff);
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .tle-stats {
          display: flex;
          gap: 12px;
          flex-shrink: 0;
        }

        .stat {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 14px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
        }

        .stat svg {
          color: var(--accent-cyan, #00d4ff);
          margin-bottom: 8px;
        }

        .stat-value {
          font-size: 18px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.95);
          font-variant-numeric: tabular-nums;
        }

        .stat-label {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.4);
          text-transform: uppercase;
          margin-top: 4px;
        }

        .update-results {
          padding: 12px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 10px;
          flex-shrink: 0;
        }

        .results-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 10px;
          color: var(--accent-green, #00ff88);
        }

        .results-header svg {
          color: inherit;
        }

        .results-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .result-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 10px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 6px;
          font-size: 11px;
        }

        .result-item.success .result-count {
          color: var(--accent-green, #00ff88);
        }

        .result-item.error {
          border-left: 2px solid var(--accent-red, #ff4444);
        }

        .result-error {
          color: var(--accent-red, #ff4444);
          font-size: 10px;
        }

        .sources-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex: 1;
          overflow-y: auto;
        }

        .source-card {
          padding: 12px 14px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 10px;
          transition: all 0.15s ease;
        }

        .source-card:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .source-card.disabled {
          opacity: 0.5;
        }

        .source-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .source-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .source-name {
          font-size: 13px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
        }

        .source-updated {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.4);
        }

        .source-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .source-refresh {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: rgba(255, 255, 255, 0.5);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .source-refresh:hover {
          background: rgba(255, 255, 255, 0.1);
          color: white;
        }

        .source-refresh:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .source-toggle {
          width: 40px;
          height: 22px;
          border-radius: 11px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.15);
          cursor: pointer;
          position: relative;
          transition: all 0.2s ease;
        }

        .source-toggle.active {
          background: rgba(0, 212, 255, 0.3);
          border-color: rgba(0, 212, 255, 0.5);
        }

        .toggle-knob {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: white;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          transition: transform 0.2s ease;
        }

        .source-toggle.active .toggle-knob {
          transform: translateX(18px);
        }

        .source-details {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .source-count {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
        }

        .source-link {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          color: rgba(255, 255, 255, 0.3);
          transition: color 0.15s ease;
        }

        .source-link:hover {
          color: var(--accent-cyan, #00d4ff);
        }

        .tle-info {
          padding: 12px;
          background: rgba(0, 212, 255, 0.05);
          border: 1px solid rgba(0, 212, 255, 0.1);
          border-radius: 10px;
          flex-shrink: 0;
        }

        .tle-info p {
          margin: 0;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}

export const SettingsTab = memo(SettingsTabComponent);
