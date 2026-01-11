import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronDown, ChevronUp, Target, Orbit, Eye, EyeOff } from 'lucide-react';
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
  const [expanded, setExpanded] = useState(true);
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
        const period = 1440 / sat.meanMotion; // minutes
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
    return r - 6371; // Earth radius
  };

  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="fixed left-4 top-24 bottom-4 w-80 z-40"
    >
      <div className="glass-panel h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border-glass)]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Orbit className="w-5 h-5 text-[var(--accent-primary)]" />
              Satellites
            </h2>
            <button
              onClick={() => setExpanded(!expanded)}
              className="glass-button p-1.5"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search satellites..."
              value={filters.searchQuery}
              onChange={(e) => onFiltersChange({ searchQuery: e.target.value })}
              className="glass-input pl-10 text-sm"
            />
          </div>

          {/* Quick Filters */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => onFiltersChange({ showOrbits: !filters.showOrbits })}
              className={`glass-button text-xs flex items-center gap-1.5 flex-1 justify-center ${filters.showOrbits ? 'glass-button-primary' : ''}`}
            >
              <Orbit className="w-3.5 h-3.5" />
              Orbits
            </button>
            <button
              onClick={() => onFiltersChange({ showLabels: !filters.showLabels })}
              className={`glass-button text-xs flex items-center gap-1.5 flex-1 justify-center ${filters.showLabels ? 'glass-button-primary' : ''}`}
            >
              {filters.showLabels ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              Labels
            </button>
          </div>

          {/* Advanced Filters Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] mt-3 flex items-center gap-1"
          >
            {showFilters ? 'Hide' : 'Show'} filters
            <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>

          {/* Advanced Filters */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-3 space-y-3">
                  <div>
                    <label className="text-xs text-[var(--text-muted)] mb-1 block">Orbit Type</label>
                    <div className="flex gap-1">
                      {(['all', 'leo', 'meo', 'geo'] as const).map(type => (
                        <button
                          key={type}
                          onClick={() => onFiltersChange({ orbitType: type })}
                          className={`glass-button text-xs py-1.5 px-3 flex-1 ${filters.orbitType === type ? 'glass-button-primary' : ''}`}
                        >
                          {type.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-muted)] mb-1 block">
                      Inclination: {filters.minInclination.toFixed(0)}° - {filters.maxInclination.toFixed(0)}°
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="180"
                      value={filters.maxInclination}
                      onChange={(e) => onFiltersChange({ maxInclination: Number(e.target.value) })}
                      className="w-full accent-[var(--accent-primary)]"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Satellite List */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 overflow-y-auto p-2"
            >
              <div className="text-xs text-[var(--text-muted)] px-2 py-1 mb-1">
                {filteredSatellites.length} of {satellites.length} satellites
              </div>
              <div className="space-y-1">
                {filteredSatellites.slice(0, 50).map((sat) => {
                  const altitude = getAltitude(sat.id);
                  const isSelected = filters.selectedSatelliteId === sat.id;
                  
                  return (
                    <motion.button
                      key={sat.id}
                      layout
                      onClick={() => onSatelliteSelect(isSelected ? null : sat.id)}
                      className={`w-full text-left p-3 rounded-xl transition-all ${
                        isSelected 
                          ? 'bg-[var(--accent-primary)]/20 border border-[var(--accent-primary)]/30' 
                          : 'glass-subtle hover:bg-[var(--bg-glass-hover)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate">{sat.name}</div>
                          <div className="text-xs text-[var(--text-muted)] text-mono">
                            {sat.intlDesignator}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-medium text-[var(--accent-primary)]">
                            {altitude ? `${altitude.toFixed(0)} km` : '—'}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {sat.inclination.toFixed(1)}°
                          </div>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
              {filteredSatellites.length > 50 && (
                <div className="text-xs text-center text-[var(--text-muted)] py-4">
                  +{filteredSatellites.length - 50} more satellites
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}


