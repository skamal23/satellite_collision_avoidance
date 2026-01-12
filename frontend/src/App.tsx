import { useState, useEffect, useRef, useCallback } from 'react';
import { SatellitePanel, ConjunctionPanel, GlobeViewer, StatusBar, DebrisPanel } from './components';
import { useSatellites } from './hooks/useSatellites';
import type { FilterState, ConjunctionWarning, DebrisFilterState, DebrisObject } from './types';

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

const defaultDebrisFilters: DebrisFilterState = {
  showDebris: true,
  showRocketBodies: true,
  showFragments: true,
  minAltitudeKm: 0,
  maxAltitudeKm: 50000,
  showDebrisFields: false,
};

function App() {
  const { satellites, positions, conjunctions, debris, debrisStats, loading, refreshData, time } = useSatellites();

  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [debrisFilters, setDebrisFilters] = useState<DebrisFilterState>(defaultDebrisFilters);
  const [selectedDebrisId, setSelectedDebrisId] = useState<number | null>(null);
  const [fps, setFps] = useState(60);
  
  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef(performance.now());
  const animationFrameIdRef = useRef<number | null>(null);
  const fpsUpdateCounterRef = useRef(0);

  // FPS calculation - only update state every 10 frames to reduce re-renders
  useEffect(() => {
    const animate = () => {
      const now = performance.now();
      const delta = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;
      
      frameTimesRef.current.push(delta);
      if (frameTimesRef.current.length > 30) {
        frameTimesRef.current.shift();
      }
      
      // Only update FPS state every 10 frames
      fpsUpdateCounterRef.current++;
      if (fpsUpdateCounterRef.current >= 10) {
        fpsUpdateCounterRef.current = 0;
        const avgDelta = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
        setFps(Math.round(1000 / avgDelta));
      }
      
      animationFrameIdRef.current = requestAnimationFrame(animate);
    };
    
    animationFrameIdRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
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

  const handleDebrisFiltersChange = useCallback((update: Partial<DebrisFilterState>) => {
    setDebrisFilters(prev => ({ ...prev, ...update }));
  }, []);

  const handleDebrisSelect = useCallback((selected: DebrisObject | null) => {
    setSelectedDebrisId(selected?.id ?? null);
  }, []);

  if (loading && satellites.length === 0) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#030308',
        color: '#fff',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>OrbitOps</div>
          <div style={{ opacity: 0.6 }}>Loading satellite data...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* 3D Globe Background */}
      <GlobeViewer
        positions={positions}
        conjunctions={conjunctions}
        debris={debris}
        filters={filters}
        debrisFilters={debrisFilters}
        onSatelliteClick={handleSatelliteSelect}
        theme="dark"
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

      {/* Debris Panel */}
      <DebrisPanel
        debris={debris}
        statistics={debrisStats}
        filters={debrisFilters}
        onFiltersChange={handleDebrisFiltersChange}
        onDebrisSelect={handleDebrisSelect}
        selectedDebrisId={selectedDebrisId}
      />

      {/* Status Bar - Bottom */}
      <StatusBar
        time={time}
        fps={fps}
        satelliteCount={satellites.length}
        conjunctionCount={conjunctions.length}
        onRefresh={refreshData}
        loading={loading}
      />
    </div>
  );
}

export default App;
