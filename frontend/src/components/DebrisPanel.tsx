import { memo, useMemo, useState, useCallback } from 'react';
import { Trash2, Filter, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { SidebarPanel } from './SidebarPanel';
import type { DebrisObject, DebrisStatistics, DebrisFilterState, DebrisType } from '../types';

interface DebrisPanelProps {
  debris: DebrisObject[];
  statistics: DebrisStatistics;
  filters: DebrisFilterState;
  onFiltersChange: (filters: Partial<DebrisFilterState>) => void;
  onDebrisSelect: (debris: DebrisObject | null) => void;
  selectedDebrisId: number | null;
}

const DEBRIS_TYPE_COLORS: Record<DebrisType, string> = {
  rocket_body: 'text-orange-400',
  payload_debris: 'text-red-400',
  fragmentation: 'text-yellow-400',
  mission_debris: 'text-gray-400',
  unknown: 'text-gray-500',
};

const DEBRIS_TYPE_LABELS: Record<DebrisType, string> = {
  rocket_body: 'Rocket Body',
  payload_debris: 'Payload Debris',
  fragmentation: 'Fragment',
  mission_debris: 'Mission Debris',
  unknown: 'Unknown',
};

// Memoized debris item component
const DebrisItem = memo(function DebrisItem({
  debris,
  isSelected,
  onClick,
}: {
  debris: DebrisObject;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-2 rounded-lg transition-all ${
        isSelected
          ? 'bg-[rgba(255,100,100,0.3)] border border-[rgba(255,100,100,0.5)]'
          : 'bg-[rgba(0,0,0,0.2)] hover:bg-[rgba(255,100,100,0.1)]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[var(--text-primary)] truncate">
            {debris.name}
          </div>
          <div className="flex items-center gap-2 text-xs mt-0.5">
            <span className={DEBRIS_TYPE_COLORS[debris.type]}>
              {DEBRIS_TYPE_LABELS[debris.type]}
            </span>
            <span className="text-[var(--text-muted)]">•</span>
            <span className="text-[var(--text-muted)]">{debris.origin}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-[var(--accent-cyan)]">
            {debris.altitudeKm.toFixed(0)} km
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            {debris.size}
          </div>
        </div>
      </div>
    </button>
  );
});

export const DebrisPanel = memo(function DebrisPanel({
  debris,
  statistics,
  filters,
  onFiltersChange,
  onDebrisSelect,
  selectedDebrisId,
}: DebrisPanelProps) {
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
    <SidebarPanel
      title="Space Debris"
      icon={<Trash2 size={16} />}
      side="left"
      defaultPosition={{ x: 360, y: 20 }}
      defaultSize={{ width: 320, height: 500 }}
    >
      <div className="p-4 flex flex-col h-full">
        {/* Toggle & Stats Summary */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={handleToggleDebris}
            className={`glass-btn ${filters.showDebris ? 'active' : ''}`}
          >
            {filters.showDebris ? <Eye size={14} /> : <EyeOff size={14} />}
            {filters.showDebris ? 'Visible' : 'Hidden'}
          </button>
          <div className="text-xs text-[var(--text-muted)]">
            <span className="text-[var(--text-primary)] font-semibold">{statistics.totalDebris}</span> tracked objects
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-[rgba(0,0,0,0.2)] rounded-lg p-2 text-center">
            <div className="text-xs text-[var(--text-muted)]">LEO</div>
            <div className="text-sm font-semibold text-[var(--accent-cyan)]">{statistics.leoDebris}</div>
          </div>
          <div className="bg-[rgba(0,0,0,0.2)] rounded-lg p-2 text-center">
            <div className="text-xs text-[var(--text-muted)]">MEO</div>
            <div className="text-sm font-semibold text-yellow-400">{statistics.meoDebris}</div>
          </div>
          <div className="bg-[rgba(0,0,0,0.2)] rounded-lg p-2 text-center">
            <div className="text-xs text-[var(--text-muted)]">GEO</div>
            <div className="text-sm font-semibold text-orange-400">{statistics.geoDebris}</div>
          </div>
        </div>

        {/* Type Distribution */}
        <div className="flex gap-2 mb-3 text-xs">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-orange-400"></span>
            <span className="text-[var(--text-muted)]">{statistics.rocketBodies} R/B</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
            <span className="text-[var(--text-muted)]">{statistics.fragments} Frag</span>
          </div>
        </div>

        {/* Filters Toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] mb-2 flex items-center gap-1 p-0 bg-transparent border-none cursor-pointer"
        >
          <Filter size={12} />
          {showFilters ? 'Hide' : 'Show'} filters
          <ChevronDown size={12} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="mb-3 p-3 bg-[rgba(0,0,0,0.2)] rounded-lg space-y-3">
            {/* Type Filters */}
            <div className="flex gap-2">
              <button
                onClick={() => onFiltersChange({ showRocketBodies: !filters.showRocketBodies })}
                className={`glass-btn flex-1 text-xs ${filters.showRocketBodies ? 'active' : ''}`}
              >
                R/B
              </button>
              <button
                onClick={() => onFiltersChange({ showFragments: !filters.showFragments })}
                className={`glass-btn flex-1 text-xs ${filters.showFragments ? 'active' : ''}`}
              >
                Fragments
              </button>
              <button
                onClick={() => onFiltersChange({ showDebrisFields: !filters.showDebrisFields })}
                className={`glass-btn flex-1 text-xs ${filters.showDebrisFields ? 'active' : ''}`}
              >
                Fields
              </button>
            </div>

            {/* Altitude Range */}
            <div>
              <label className="text-xs text-[var(--text-muted)] mb-1 block">
                Altitude: {filters.minAltitudeKm.toFixed(0)} - {filters.maxAltitudeKm.toFixed(0)} km
              </label>
              <div className="flex gap-2">
                <input
                  type="range"
                  min="0"
                  max="2000"
                  value={filters.minAltitudeKm}
                  onChange={(e) => onFiltersChange({ minAltitudeKm: Number(e.target.value) })}
                  className="flex-1 accent-[var(--accent-cyan)]"
                />
                <input
                  type="range"
                  min="200"
                  max="50000"
                  value={filters.maxAltitudeKm}
                  onChange={(e) => onFiltersChange({ maxAltitudeKm: Number(e.target.value) })}
                  className="flex-1 accent-[var(--accent-cyan)]"
                />
              </div>
            </div>
          </div>
        )}

        {/* Debris Count */}
        <div className="text-xs text-[var(--text-muted)] mb-2">
          Showing {filteredDebris.length} of {debris.length} debris objects
        </div>

        {/* Debris List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
          {filteredDebris.slice(0, 50).map((d) => (
            <DebrisItem
              key={d.id}
              debris={d}
              isSelected={selectedDebrisId === d.id}
              onClick={() => onDebrisSelect(selectedDebrisId === d.id ? null : d)}
            />
          ))}
        </div>

        {filteredDebris.length > 50 && (
          <div className="text-xs text-center text-[var(--text-muted)] py-2">
            +{filteredDebris.length - 50} more debris objects
          </div>
        )}

        {filteredDebris.length === 0 && (
          <div className="text-center p-5 text-sm text-[var(--text-muted)]">
            No debris matches filters
          </div>
        )}
      </div>
    </SidebarPanel>
  );
});

