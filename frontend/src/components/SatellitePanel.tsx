import { useState, useMemo } from 'react';
import { Search, Orbit, Eye, EyeOff, ChevronDown } from 'lucide-react';
import { DraggablePanel } from './DraggablePanel';
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
    <DraggablePanel
      title="Satellites"
      icon={<Orbit size={16} style={{ color: 'var(--accent-primary)' }} />}
      defaultPosition={{ x: 16, y: 80 }}
    >
      {/* Search */}
      <div className="relative mb-3">
        <Search 
          size={14} 
          className="absolute left-3 top-1/2 -translate-y-1/2" 
          style={{ color: 'var(--text-muted)' }} 
        />
        <input
          type="text"
          placeholder="Search satellites..."
          value={filters.searchQuery}
          onChange={(e) => onFiltersChange({ searchQuery: e.target.value })}
          className="glass-input pl-9 text-sm"
        />
      </div>

      {/* Quick Filters */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => onFiltersChange({ showOrbits: !filters.showOrbits })}
          className={`glass-btn flex-1 text-xs ${filters.showOrbits ? 'active' : ''}`}
        >
          <Orbit size={12} />
          Orbits
        </button>
        <button
          onClick={() => onFiltersChange({ showLabels: !filters.showLabels })}
          className={`glass-btn flex-1 text-xs ${filters.showLabels ? 'active' : ''}`}
        >
          {filters.showLabels ? <Eye size={12} /> : <EyeOff size={12} />}
          Labels
        </button>
      </div>

      {/* Advanced Filters Toggle */}
      <button
        onClick={() => setShowFilters(!showFilters)}
        className="flex items-center gap-1 text-xs mb-3"
        style={{ color: 'var(--text-muted)' }}
      >
        {showFilters ? 'Hide' : 'Show'} filters
        <ChevronDown 
          size={12} 
          style={{ 
            transform: showFilters ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease'
          }} 
        />
      </button>

      {/* Advanced Filters */}
      {showFilters && (
        <div className="space-y-3 mb-3 p-3 rounded-xl" style={{ background: 'var(--glass-bg)' }}>
          <div>
            <label className="text-xs mb-2 block" style={{ color: 'var(--text-muted)' }}>
              Orbit Type
            </label>
            <div className="flex gap-1">
              {(['all', 'leo', 'meo', 'geo'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => onFiltersChange({ orbitType: type })}
                  className={`glass-btn text-xs py-1.5 px-3 flex-1 ${filters.orbitType === type ? 'active' : ''}`}
                >
                  {type.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs mb-2 block" style={{ color: 'var(--text-muted)' }}>
              Inclination: {filters.minInclination.toFixed(0)}° - {filters.maxInclination.toFixed(0)}°
            </label>
            <input
              type="range"
              min="0"
              max="180"
              value={filters.maxInclination}
              onChange={(e) => onFiltersChange({ maxInclination: Number(e.target.value) })}
              className="w-full"
              style={{ accentColor: 'var(--accent-primary)' }}
            />
          </div>
        </div>
      )}

      {/* Satellite List */}
      <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
        {filteredSatellites.length} of {satellites.length} satellites
      </div>
      
      <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
        {filteredSatellites.slice(0, 50).map((sat) => {
          const altitude = getAltitude(sat.id);
          const isSelected = filters.selectedSatelliteId === sat.id;
          
          return (
            <button
              key={sat.id}
              onClick={() => onSatelliteSelect(isSelected ? null : sat.id)}
              className={`satellite-item ${isSelected ? 'selected' : ''}`}
            >
              <div>
                <div className="sat-name">{sat.name}</div>
                <div className="sat-designator">{sat.intlDesignator}</div>
              </div>
              <div className="text-right">
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
        <div className="text-xs text-center py-3" style={{ color: 'var(--text-muted)' }}>
          +{filteredSatellites.length - 50} more satellites
        </div>
      )}
    </DraggablePanel>
  );
}
