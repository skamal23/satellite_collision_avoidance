import { memo, useMemo, useState, useCallback } from 'react';
import { Eye, EyeOff, ChevronDown, Trash2, Info } from 'lucide-react';
import type { DebrisObject, DebrisStatistics, DebrisFilterState, DebrisType } from '../types';

interface DebrisTabProps {
  debris: DebrisObject[];
  statistics: DebrisStatistics;
  filters: DebrisFilterState;
  onFiltersChange: (filters: Partial<DebrisFilterState>) => void;
  onDebrisSelect: (debris: DebrisObject | null) => void;
  onDebrisFocus?: (id: number) => void;
  selectedDebrisId: number | null;
}

const DEBRIS_TYPE_COLORS: Record<DebrisType, string> = {
  rocket_body: '#ff8800',
  payload_debris: '#ff4444',
  fragmentation: '#ffcc00',
  mission_debris: '#888888',
  unknown: '#666666',
};

const DEBRIS_TYPE_LABELS: Record<DebrisType, string> = {
  rocket_body: 'Rocket Body',
  payload_debris: 'Payload',
  fragmentation: 'Fragment',
  mission_debris: 'Mission',
  unknown: 'Unknown',
};

const DebrisItem = memo(function DebrisItem({
  debris,
  isSelected,
  onFocus,
  onInfo,
}: {
  debris: DebrisObject;
  isSelected: boolean;
  onFocus: () => void;
  onInfo: () => void;
}) {
  return (
    <div className={`debris-item ${isSelected ? 'selected' : ''}`}>
      <button
        onClick={onFocus}
        className="debris-main"
      >
        <div
          className="debris-type-indicator"
          style={{ backgroundColor: DEBRIS_TYPE_COLORS[debris.type] }}
        />
        <div className="debris-info">
          <div className="debris-name">{debris.name}</div>
          <div className="debris-meta">
            <span style={{ color: DEBRIS_TYPE_COLORS[debris.type] }}>
              {DEBRIS_TYPE_LABELS[debris.type]}
            </span>
            <span className="dot">•</span>
            <span>{debris.origin}</span>
          </div>
        </div>
        <div className="debris-metrics">
          <div className="debris-altitude">{debris.altitudeKm.toFixed(0)} km</div>
          <div className="debris-size">{debris.size}</div>
        </div>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onInfo(); }}
        className="debris-info-btn"
        title="View details"
      >
        <Info size={14} />
      </button>
    </div>
  );
});

function DebrisTabComponent({
  debris,
  statistics,
  filters,
  onFiltersChange,
  onDebrisSelect,
  onDebrisFocus,
  selectedDebrisId,
}: DebrisTabProps) {
  const [showFilters, setShowFilters] = useState(false);

  const filteredDebris = useMemo(() => {
    return debris.filter(d => {
      if (d.altitudeKm < filters.minAltitudeKm || d.altitudeKm > filters.maxAltitudeKm) {
        return false;
      }
      if (d.type === 'rocket_body' && !filters.showRocketBodies) {
        return false;
      }
      if ((d.type === 'fragmentation' || d.type === 'payload_debris') && !filters.showFragments) {
        return false;
      }
      return true;
    });
  }, [debris, filters]);

  const handleToggleDebris = useCallback(() => {
    onFiltersChange({ showDebris: !filters.showDebris });
  }, [filters.showDebris, onFiltersChange]);

  return (
    <div className="tab-content debris-tab">
      {/* Header Row */}
      <div className="debris-header">
        <div className="header-left">
          <Trash2 size={16} />
          <span className="header-title">Space Debris</span>
          <span className="debris-count">{statistics.totalDebris.toLocaleString()} objects</span>
        </div>
        <button
          onClick={handleToggleDebris}
          className={`visibility-btn ${filters.showDebris ? 'visible' : ''}`}
        >
          {filters.showDebris ? <Eye size={14} /> : <EyeOff size={14} />}
          {filters.showDebris ? 'Visible' : 'Hidden'}
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="debris-stats">
        <div className="stat-card">
          <div className="stat-label">LEO</div>
          <div className="stat-value leo">{statistics.leoDebris.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">MEO</div>
          <div className="stat-value meo">{statistics.meoDebris.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">GEO</div>
          <div className="stat-value geo">{statistics.geoDebris.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">R/B</div>
          <div className="stat-value rb">{statistics.rocketBodies}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Frag</div>
          <div className="stat-value frag">{statistics.fragments}</div>
        </div>
      </div>

      {/* Filter Toggle */}
      <button
        onClick={() => setShowFilters(!showFilters)}
        className="filter-toggle"
      >
        <ChevronDown size={12} style={{ transform: showFilters ? 'rotate(180deg)' : 'none' }} />
        {showFilters ? 'Hide' : 'Show'} filters
      </button>

      {/* Filters */}
      {showFilters && (
        <div className="debris-filters">
          <div className="filter-row">
            <button
              onClick={() => onFiltersChange({ showRocketBodies: !filters.showRocketBodies })}
              className={`filter-chip ${filters.showRocketBodies ? 'active' : ''}`}
            >
              <span className="chip-dot" style={{ backgroundColor: DEBRIS_TYPE_COLORS.rocket_body }} />
              Rocket Bodies
            </button>
            <button
              onClick={() => onFiltersChange({ showFragments: !filters.showFragments })}
              className={`filter-chip ${filters.showFragments ? 'active' : ''}`}
            >
              <span className="chip-dot" style={{ backgroundColor: DEBRIS_TYPE_COLORS.fragmentation }} />
              Fragments
            </button>
            <button
              onClick={() => onFiltersChange({ showDebrisFields: !filters.showDebrisFields })}
              className={`filter-chip ${filters.showDebrisFields ? 'active' : ''}`}
            >
              Debris Fields
            </button>
          </div>

          <div className="altitude-filter">
            <label>
              Altitude: {filters.minAltitudeKm.toFixed(0)} - {filters.maxAltitudeKm.toFixed(0)} km
            </label>
            <div className="range-inputs">
              <input
                type="range"
                min="0"
                max="2000"
                value={filters.minAltitudeKm}
                onChange={(e) => onFiltersChange({ minAltitudeKm: Number(e.target.value) })}
              />
              <input
                type="range"
                min="200"
                max="50000"
                value={filters.maxAltitudeKm}
                onChange={(e) => onFiltersChange({ maxAltitudeKm: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>
      )}

      {/* Results Header */}
      <div className="results-header">
        {filteredDebris.length.toLocaleString()} of {debris.length.toLocaleString()} objects
      </div>

      {/* Debris List */}
      <div className="tab-list">
        {filteredDebris.map((d) => (
          <DebrisItem
            key={d.id}
            debris={d}
            isSelected={selectedDebrisId === d.id}
            onFocus={() => onDebrisFocus?.(d.id)}
            onInfo={() => onDebrisSelect(selectedDebrisId === d.id ? null : d)}
          />
        ))}
        {filteredDebris.length === 0 && (
          <div className="empty-state">No debris matches filters</div>
        )}
      </div>

      <style>{`
        .debris-tab {
          display: flex;
          flex-direction: column;
          height: 100%;
          padding: 12px 16px;
          gap: 12px;
        }

        .debris-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .header-left svg {
          color: #ff8800;
        }

        .header-title {
          font-size: 14px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
        }

        .debris-count {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.5);
        }

        .visibility-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.6);
          font-size: 12px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .visibility-btn:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .visibility-btn.visible {
          background: rgba(0, 212, 255, 0.1);
          border-color: rgba(0, 212, 255, 0.3);
          color: var(--accent-cyan, #00d4ff);
        }

        .debris-stats {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
        }

        .stat-card {
          flex: 1;
          padding: 8px 10px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          text-align: center;
        }

        .stat-label {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.4);
          text-transform: uppercase;
          margin-bottom: 2px;
        }

        .stat-value {
          font-size: 14px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
        }

        .stat-value.leo { color: var(--accent-cyan, #00d4ff); }
        .stat-value.meo { color: #ffcc00; }
        .stat-value.geo { color: #ff8800; }
        .stat-value.rb { color: #ff8800; }
        .stat-value.frag { color: #ffcc00; }

        .filter-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0;
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          font-size: 11px;
          cursor: pointer;
          flex-shrink: 0;
        }

        .filter-toggle:hover {
          color: rgba(255, 255, 255, 0.8);
        }

        .filter-toggle svg {
          transition: transform 0.2s ease;
        }

        .debris-filters {
          padding: 12px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 10px;
          flex-shrink: 0;
        }

        .filter-row {
          display: flex;
          gap: 6px;
          margin-bottom: 12px;
        }

        .filter-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.6);
          font-size: 11px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .filter-chip:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .filter-chip.active {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
          color: rgba(255, 255, 255, 0.9);
        }

        .chip-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .altitude-filter label {
          display: block;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          margin-bottom: 8px;
        }

        .range-inputs {
          display: flex;
          gap: 8px;
        }

        .range-inputs input {
          flex: 1;
          accent-color: var(--accent-cyan, #00d4ff);
        }

        .results-header {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          flex-shrink: 0;
        }

        .tab-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .debris-item {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 4px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 12px;
          transition: all 0.15s ease;
        }

        .debris-item:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(255, 255, 255, 0.06);
        }

        .debris-item.selected {
          background: rgba(255, 136, 0, 0.08);
          border-color: rgba(255, 136, 0, 0.25);
          box-shadow: inset 0 0 30px rgba(255, 136, 0, 0.05);
        }

        .debris-main {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          background: transparent;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          text-align: left;
          transition: all 0.15s ease;
        }

        .debris-main:hover {
          background: rgba(255, 255, 255, 0.03);
        }

        .debris-info-btn {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.5);
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0.15s ease;
        }

        .debris-info-btn:hover {
          background: rgba(255, 136, 0, 0.15);
          border-color: rgba(255, 136, 0, 0.4);
          color: #ff8800;
        }

        .debris-type-indicator {
          width: 4px;
          height: 32px;
          border-radius: 2px;
          flex-shrink: 0;
        }

        .debris-info {
          flex: 1;
          min-width: 0;
        }

        .debris-name {
          font-size: 13px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.9);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .debris-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          margin-top: 2px;
        }

        .debris-meta .dot {
          color: rgba(255, 255, 255, 0.3);
        }

        .debris-meta span:last-child {
          color: rgba(255, 255, 255, 0.4);
        }

        .debris-metrics {
          text-align: right;
          flex-shrink: 0;
        }

        .debris-altitude {
          font-size: 12px;
          color: var(--accent-cyan, #00d4ff);
          font-weight: 500;
        }

        .debris-size {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.4);
          margin-top: 2px;
        }

        .more-indicator {
          padding: 12px;
          text-align: center;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.4);
        }

        .empty-state {
          padding: 40px 20px;
          text-align: center;
          color: rgba(255, 255, 255, 0.4);
          font-size: 13px;
        }
      `}</style>
    </div>
  );
}

export const DebrisTab = memo(DebrisTabComponent);
