import { useState, useMemo, memo, useCallback } from 'react';
import { Search, ChevronDown, Orbit, Eye, EyeOff } from 'lucide-react';
import type { SatelliteInfo, SatellitePosition, FilterState } from '../types';

interface SatellitesTabProps {
  satellites: SatelliteInfo[];
  positions: SatellitePosition[];
  filters: FilterState;
  onFiltersChange: (filters: Partial<FilterState>) => void;
  onSatelliteSelect: (id: number | null) => void;
}

const SatelliteItem = memo(function SatelliteItem({
  sat,
  altitude,
  isSelected,
  onSelect,
}: {
  sat: SatelliteInfo;
  altitude: number | null;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`satellite-list-item ${isSelected ? 'selected' : ''}`}
    >
      <div className="sat-info">
        <div className="sat-name">{sat.name}</div>
        <div className="sat-designator">{sat.intlDesignator}</div>
      </div>
      <div className="sat-metrics">
        <div className="sat-altitude">
          {altitude !== null ? `${altitude.toFixed(0)} km` : '—'}
        </div>
        <div className="sat-inclination">{sat.inclination.toFixed(1)}°</div>
      </div>
    </button>
  );
});

function SatellitesTabComponent({
  satellites,
  positions,
  filters,
  onFiltersChange,
  onSatelliteSelect,
}: SatellitesTabProps) {
  const [showFilters, setShowFilters] = useState(false);

  const altitudeMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const pos of positions) {
      const r = Math.sqrt(pos.position.x ** 2 + pos.position.y ** 2 + pos.position.z ** 2);
      map.set(pos.id, r - 6371);
    }
    return map;
  }, [positions]);

  const filteredSatellites = useMemo(() => {
    return satellites.filter(sat => {
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        if (!sat.name.toLowerCase().includes(query) &&
            !sat.intlDesignator.toLowerCase().includes(query)) {
          return false;
        }
      }
      if (sat.inclination < filters.minInclination || sat.inclination > filters.maxInclination) {
        return false;
      }
      if (filters.orbitType !== 'all') {
        const period = 1440 / sat.meanMotion;
        if (filters.orbitType === 'leo' && period > 128) return false;
        if (filters.orbitType === 'meo' && (period < 128 || period > 1400)) return false;
        if (filters.orbitType === 'geo' && period < 1400) return false;
      }
      return true;
    });
  }, [satellites, filters.searchQuery, filters.minInclination, filters.maxInclination, filters.orbitType]);

  const displayedSatellites = useMemo(() =>
    filteredSatellites.slice(0, 100),
    [filteredSatellites]
  );

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ searchQuery: e.target.value });
  }, [onFiltersChange]);

  const handleToggleOrbits = useCallback(() => {
    onFiltersChange({ showOrbits: !filters.showOrbits });
  }, [onFiltersChange, filters.showOrbits]);

  const handleToggleLabels = useCallback(() => {
    onFiltersChange({ showLabels: !filters.showLabels });
  }, [onFiltersChange, filters.showLabels]);

  const handleOrbitTypeChange = useCallback((type: 'all' | 'leo' | 'meo' | 'geo') => {
    onFiltersChange({ orbitType: type });
  }, [onFiltersChange]);

  const handleInclinationChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ maxInclination: Number(e.target.value) });
  }, [onFiltersChange]);

  const handleSatelliteSelect = useCallback((sat: SatelliteInfo) => {
    onSatelliteSelect(filters.selectedSatelliteId === sat.id ? null : sat.id);
  }, [onSatelliteSelect, filters.selectedSatelliteId]);

  return (
    <div className="tab-content satellites-tab">
      {/* Search Bar */}
      <div className="tab-search">
        <Search size={14} className="search-icon" />
        <input
          type="text"
          placeholder="Search satellites by name or designator..."
          value={filters.searchQuery}
          onChange={handleSearchChange}
          className="search-input"
          autoFocus
        />
      </div>

      {/* Quick Filters Row */}
      <div className="tab-filters-row">
        <div className="filter-group">
          <button
            onClick={handleToggleOrbits}
            className={`filter-btn ${filters.showOrbits ? 'active' : ''}`}
          >
            <Orbit size={12} />
            Orbits
          </button>
          <button
            onClick={handleToggleLabels}
            className={`filter-btn ${filters.showLabels ? 'active' : ''}`}
          >
            {filters.showLabels ? <Eye size={12} /> : <EyeOff size={12} />}
            Labels
          </button>
        </div>

        <div className="filter-group">
          {(['all', 'leo', 'meo', 'geo'] as const).map(type => (
            <button
              key={type}
              onClick={() => handleOrbitTypeChange(type)}
              className={`filter-btn orbit-type ${filters.orbitType === type ? 'active' : ''}`}
            >
              {type.toUpperCase()}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className="filter-toggle"
        >
          <ChevronDown size={12} style={{ transform: showFilters ? 'rotate(180deg)' : 'none' }} />
          More
        </button>
      </div>

      {/* Advanced Filters */}
      {showFilters && (
        <div className="advanced-filters">
          <div className="filter-slider">
            <label>
              Inclination: {filters.minInclination.toFixed(0)}° - {filters.maxInclination.toFixed(0)}°
            </label>
            <input
              type="range"
              min="0"
              max="180"
              value={filters.maxInclination}
              onChange={handleInclinationChange}
            />
          </div>
        </div>
      )}

      {/* Results Header */}
      <div className="tab-results-header">
        <span>{filteredSatellites.length.toLocaleString()} satellites</span>
        {filteredSatellites.length > 100 && (
          <span className="showing-hint">showing first 100</span>
        )}
      </div>

      {/* Satellite List */}
      <div className="tab-list">
        {displayedSatellites.map((sat) => (
          <SatelliteItem
            key={sat.id}
            sat={sat}
            altitude={altitudeMap.get(sat.id) ?? null}
            isSelected={filters.selectedSatelliteId === sat.id}
            onSelect={() => handleSatelliteSelect(sat)}
          />
        ))}
        {displayedSatellites.length === 0 && (
          <div className="empty-state">No satellites match your search</div>
        )}
      </div>

      <style>{`
        .satellites-tab {
          display: flex;
          flex-direction: column;
          height: 100%;
          padding: 12px 16px;
          gap: 10px;
        }

        .tab-search {
          position: relative;
          flex-shrink: 0;
        }

        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: rgba(255, 255, 255, 0.4);
        }

        .search-input {
          width: 100%;
          padding: 10px 12px 10px 36px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: white;
          font-size: 13px;
          outline: none;
          transition: all 0.15s ease;
        }

        .search-input:focus {
          border-color: rgba(0, 212, 255, 0.5);
          background: rgba(255, 255, 255, 0.08);
        }

        .search-input::placeholder {
          color: rgba(255, 255, 255, 0.35);
        }

        .tab-filters-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
          flex-wrap: wrap;
        }

        .filter-group {
          display: flex;
          gap: 4px;
        }

        .filter-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 6px 10px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.6);
          font-size: 11px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .filter-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.8);
        }

        .filter-btn.active {
          background: rgba(0, 212, 255, 0.15);
          border-color: rgba(0, 212, 255, 0.4);
          color: var(--accent-cyan, #00d4ff);
        }

        .filter-btn.orbit-type {
          padding: 5px 8px;
          font-size: 10px;
          font-weight: 600;
        }

        .filter-toggle {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 5px 8px;
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.5);
          font-size: 11px;
          cursor: pointer;
        }

        .filter-toggle:hover {
          color: rgba(255, 255, 255, 0.8);
        }

        .filter-toggle svg {
          transition: transform 0.2s ease;
        }

        .advanced-filters {
          padding: 10px 12px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          flex-shrink: 0;
        }

        .filter-slider label {
          display: block;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          margin-bottom: 6px;
        }

        .filter-slider input {
          width: 100%;
          accent-color: var(--accent-cyan, #00d4ff);
        }

        .tab-results-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
          flex-shrink: 0;
        }

        .showing-hint {
          color: rgba(255, 255, 255, 0.35);
        }

        .tab-list {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .satellite-list-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid transparent;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: left;
        }

        .satellite-list-item:hover {
          background: rgba(255, 255, 255, 0.06);
        }

        .satellite-list-item.selected {
          background: rgba(0, 212, 255, 0.1);
          border-color: rgba(0, 212, 255, 0.3);
        }

        .sat-info {
          min-width: 0;
          flex: 1;
        }

        .sat-name {
          font-size: 13px;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.9);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .sat-designator {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.4);
          margin-top: 2px;
        }

        .sat-metrics {
          text-align: right;
          flex-shrink: 0;
        }

        .sat-altitude {
          font-size: 12px;
          color: var(--accent-cyan, #00d4ff);
          font-weight: 500;
        }

        .sat-inclination {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.4);
          margin-top: 2px;
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

export const SatellitesTab = memo(SatellitesTabComponent);
