import { useState, useCallback, useEffect, useRef } from 'react';
import { Header, SatellitePanel, ConjunctionPanel, StatusBar, GlobeViewer } from './components';
import { useTheme } from './hooks/useTheme';
import { useSatellites } from './hooks/useSatellites';
import type { FilterState, ConjunctionWarning } from './types';

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
  const [fps, setFps] = useState(60);
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());

  // FPS counter
  useEffect(() => {
    const countFps = () => {
      frameCount.current++;
      const now = performance.now();
      if (now - lastTime.current >= 1000) {
        setFps(frameCount.current);
        frameCount.current = 0;
        lastTime.current = now;
      }
      requestAnimationFrame(countFps);
    };
    const id = requestAnimationFrame(countFps);
    return () => cancelAnimationFrame(id);
  }, []);

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
    <div 
      className="w-full h-full overflow-hidden"
      data-theme={theme}
      style={{ position: 'relative' }}
    >
      {/* 3D Globe Background */}
      <GlobeViewer
        positions={positions}
        conjunctions={conjunctions}
        filters={filters}
        onSatelliteClick={handleSatelliteSelect}
        theme={theme}
      />

      {/* UI Overlay */}
      <Header
        theme={theme}
        onThemeToggle={toggleTheme}
        satelliteCount={satellites.length}
        conjunctionCount={conjunctions.length}
        onRefresh={refreshData}
        loading={loading}
      />

      <SatellitePanel
        satellites={satellites}
        positions={positions}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onSatelliteSelect={handleSatelliteSelect}
      />

      <ConjunctionPanel
        conjunctions={conjunctions}
        onConjunctionSelect={handleConjunctionSelect}
      />

      <StatusBar
        time={time}
        connected={!loading}
        fps={fps}
      />
    </div>
  );
}

export default App;
