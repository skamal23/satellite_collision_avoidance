import { useState, useCallback } from 'react';
import { Header, SatellitePanel, ConjunctionPanel, StatusBar } from './components';
import { useTheme } from './hooks/useTheme';
import { useSatellites } from './hooks/useSatellites';
import type { FilterState, ConjunctionWarning } from './types';
import { GlobeViewer } from './components/GlobeViewer';

const defaultFilters: FilterState = {
  searchQuery: '',
  showOrbits: false,
  showLabels: false,
  minInclination: 0,
  maxInclination: 180,
  showConjunctions: true,
  conjunctionThreshold: 10,
  selectedSatelliteId: null,
  orbitType: 'all',
};

function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const { satellites, positions, conjunctions, loading, refreshData, time } = useSatellites();
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [fps] = useState(60);

  const handleFiltersChange = useCallback((update: Partial<FilterState>) => {
    setFilters(prev => ({ ...prev, ...update }));
  }, []);

  const handleSatelliteSelect = useCallback((id: number | null) => {
    setFilters(prev => ({ ...prev, selectedSatelliteId: id }));
  }, []);

  const handleConjunctionSelect = useCallback((conjunction: ConjunctionWarning) => {
    setFilters(prev => ({ 
      ...prev, 
      selectedSatelliteId: conjunction.sat1Id,
    }));
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* 3D Globe Background - Layer 0 */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <GlobeViewer
          positions={positions}
          conjunctions={conjunctions}
          filters={filters}
          onSatelliteClick={handleSatelliteSelect}
          theme={theme}
        />
      </div>

      {/* UI Overlay - Layer 1 */}
      <div style={{ position: 'relative', zIndex: 1, pointerEvents: 'none', height: '100%' }}>
        <div style={{ pointerEvents: 'auto' }}>
          <Header
            theme={theme}
            onThemeToggle={toggleTheme}
            satelliteCount={satellites.length}
            conjunctionCount={conjunctions.length}
            onRefresh={refreshData}
            loading={loading}
          />
        </div>

        <div style={{ pointerEvents: 'auto' }}>
          <SatellitePanel
            satellites={satellites}
            positions={positions}
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onSatelliteSelect={handleSatelliteSelect}
          />
        </div>

        <div style={{ pointerEvents: 'auto' }}>
          <ConjunctionPanel
            conjunctions={conjunctions}
            onConjunctionSelect={handleConjunctionSelect}
          />
        </div>

        <div style={{ pointerEvents: 'auto' }}>
          <StatusBar
            time={time}
            connected={!loading}
            fps={fps}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
