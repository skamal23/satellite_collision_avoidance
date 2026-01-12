import { useState, useMemo } from 'react';
import { Search, ChevronDown, Orbit, Eye, EyeOff } from 'lucide-react';
import { SidebarPanel } from './SidebarPanel';
import type { SatelliteInfo, SatellitePosition, FilterState } from '../types';

interface SatellitePanelProps {
  satellites: SatelliteInfo[];
  positions: SatellitePosition[];
  filters: FilterState;
  onFiltersChange: (filters: Partial<FilterState>) => void;
  onSatelliteSelect: (id: number | null) => void;
}

export function SatellitePanel({
  satellites,
  positions,
  filters,
  onFiltersChange,
  onSatelliteSelect,
}: SatellitePanelProps) {
  const [showFilters, setShowFilters] = useState(false);

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
  }, [satellites, filters]);

  const getAltitude = (satId: number) => {
    const pos = positions.find(p => p.id === satId);
    if (!pos) return null;
    const r = Math.sqrt(pos.position.x ** 2 + pos.position.y ** 2 + pos.position.z ** 2);
    return r - 6371;
  };

  return (
    <SidebarPanel
      title="Satellites"
      icon={<Orbit size={16} />}
      side="left"
      defaultPosition={{ x: 20, y: 100 }}
    >
      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <Search 
          size={14} 
          style={{ 
            position: 'absolute', 
            left: 12, 
            top: '50%', 
            transform: 'translateY(-50%)',
            color: 'var(--text-muted)'
          }} 
        />
        <input
          type="text"
          placeholder="Search satellites..."
          value={filters.searchQuery}
          onChange={(e) => onFiltersChange({ searchQuery: e.target.value })}
          className="glass-input"
        />
      </div>

      {/* Quick Filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button
          onClick={() => onFiltersChange({ showOrbits: !filters.showOrbits })}
          className={`glass-btn ${filters.showOrbits ? 'active' : ''}`}
          style={{ flex: 1 }}
        >
          <Orbit size={12} />
          Orbits
        </button>
        <button
          onClick={() => onFiltersChange({ showLabels: !filters.showLabels })}
          className={`glass-btn ${filters.showLabels ? 'active' : ''}`}
          style={{ flex: 1 }}
        >
          {filters.showLabels ? <Eye size={12} /> : <EyeOff size={12} />}
          Labels
        </button>
      </div>

      {/* Advanced Filters Toggle */}
      <button
        onClick={() => setShowFilters(!showFilters)}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-muted)',
          fontSize: 11,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          marginBottom: 8,
          padding: 0,
        }}
      >
        {showFilters ? 'Hide' : 'Show'} filters
        <ChevronDown size={12} style={{ transform: showFilters ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {/* Advanced Filters */}
      {showFilters && (
        <div style={{ marginBottom: 12, padding: 10, background: 'rgba(0,0,0,0.2)', borderRadius: 10 }}>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
              Orbit Type
            </label>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['all', 'leo', 'meo', 'geo'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => onFiltersChange({ orbitType: type })}
                  className={`glass-btn ${filters.orbitType === type ? 'active' : ''}`}
                  style={{ flex: 1, padding: '5px 8px', fontSize: 10 }}
                >
                  {type.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
              Inclination: {filters.minInclination.toFixed(0)}° - {filters.maxInclination.toFixed(0)}°
            </label>
            <input
              type="range"
              min="0"
              max="180"
              value={filters.maxInclination}
              onChange={(e) => onFiltersChange({ maxInclination: Number(e.target.value) })}
              style={{ width: '100%', accentColor: 'var(--accent-cyan)' }}
            />
          </div>
        </div>
      )}

      {/* Count */}
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
        {filteredSatellites.length} of {satellites.length} satellites
      </div>

      {/* Satellite List */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {filteredSatellites.slice(0, 50).map((sat) => {
          const altitude = getAltitude(sat.id);
          const isSelected = filters.selectedSatelliteId === sat.id;

          return (
            <button
              key={sat.id}
              onClick={() => onSatelliteSelect(isSelected ? null : sat.id)}
              className={`satellite-item ${isSelected ? 'selected' : ''}`}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="sat-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sat.name}
                </div>
                <div className="sat-designator">{sat.intlDesignator}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="sat-altitude">
                  {altitude ? `${altitude.toFixed(0)} km` : '—'}
                </div>
                <div className="sat-inclination">{sat.inclination.toFixed(1)}°</div>
              </div>
            </button>
          );
        })}
      </div>

      {filteredSatellites.length > 50 && (
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', padding: '12px 0' }}>
          +{filteredSatellites.length - 50} more satellites
        </div>
      )}
    </SidebarPanel>
  );
}
