import { useState, useEffect, useRef, useCallback } from 'react';
import { Header, SatellitePanel, ConjunctionPanel, GlobeViewer, StatusBar } from './components';
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
  
  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef(performance.now());
  const animationFrameIdRef = useRef<number | null>(null);

  // FPS calculation
  const animate = useCallback(() => {
    const now = performance.now();
    const delta = now - lastFrameTimeRef.current;
    lastFrameTimeRef.current = now;
    
    frameTimesRef.current.push(delta);
    if (frameTimesRef.current.length > 30) {
      frameTimesRef.current.shift();
    }
    
    const avgDelta = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
    setFps(1000 / avgDelta);
    
    animationFrameIdRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    animationFrameIdRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [animate]);

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

  if (loading && satellites.length === 0) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: theme === 'dark' ? '#000' : '#e8ecf0',
        color: theme === 'dark' ? '#fff' : '#333',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>OrbitOps</div>
          <div style={{ opacity: 0.6 }}>Loading satellite data...</div>
        </div>
      </div>
    );
  }

  return (
    <div 
      data-theme={theme}
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* 3D Globe Background */}
      <GlobeViewer
        positions={positions}
        conjunctions={conjunctions}
        filters={filters}
        onSatelliteClick={handleSatelliteSelect}
        theme={theme}
      />

      {/* Header */}
      <Header
        theme={theme}
        onThemeToggle={toggleTheme}
        satelliteCount={satellites.length}
        conjunctionCount={conjunctions.length}
        onRefresh={refreshData}
        loading={loading}
      />

      {/* Sidebar Panels */}
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

      {/* Status Bar */}
      <StatusBar
        time={time}
        connected={!loading}
        fps={fps}
      />
    </div>
  );
}

export default App;
