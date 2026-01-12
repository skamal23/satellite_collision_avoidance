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

// Detect Chromium-based browsers for true liquid glass support
function isChromium(): boolean {
  const userAgent = navigator.userAgent;
  // Chrome, Edge, Opera, Brave all use Chromium
  return /Chrome/.test(userAgent) && !/Edg/.test(userAgent) 
    || /Edg/.test(userAgent) 
    || /OPR/.test(userAgent);
}

// SVG Filter for True Liquid Glass Effect
function LiquidGlassSVG() {
  return (
    <svg className="liquid-glass-svg" xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* Liquid Glass Refraction Filter */}
        <filter id="liquid-glass-filter" x="-50%" y="-50%" width="200%" height="200%">
          {/* Create turbulence for subtle distortion */}
          <feTurbulence 
            type="fractalNoise" 
            baseFrequency="0.015" 
            numOctaves="3" 
            result="noise"
          />
          
          {/* Use noise for subtle displacement/refraction at edges */}
          <feDisplacementMap 
            in="SourceGraphic" 
            in2="noise" 
            scale="3" 
            xChannelSelector="R" 
            yChannelSelector="G"
            result="displaced"
          />
          
          {/* Gaussian blur for glass effect */}
          <feGaussianBlur in="displaced" stdDeviation="0.5" result="blurred" />
          
          {/* Create specular lighting for glass shine */}
          <feSpecularLighting 
            in="blurred" 
            specularExponent="20" 
            lightingColor="#ffffff" 
            result="specular"
            surfaceScale="2"
          >
            <fePointLight x="-1000" y="-1000" z="2000" />
          </feSpecularLighting>
          
          {/* Composite specular with original */}
          <feComposite 
            in="specular" 
            in2="SourceGraphic" 
            operator="arithmetic" 
            k1="0" k2="1" k3="0.3" k4="0"
            result="specularComposite"
          />
          
          {/* Blend everything together */}
          <feBlend in="SourceGraphic" in2="specularComposite" mode="screen" />
        </filter>

        {/* Simpler fallback filter */}
        <filter id="glass-blur" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" />
        </filter>
      </defs>
    </svg>
  );
}

function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const { satellites, positions, conjunctions, loading, refreshData, time } = useSatellites();

  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [fps, setFps] = useState(60);
  const [isChromiumBrowser, setIsChromiumBrowser] = useState(false);
  
  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef(performance.now());
  const animationFrameIdRef = useRef<number | null>(null);

  // Detect Chromium on mount
  useEffect(() => {
    setIsChromiumBrowser(isChromium());
    
    // Add class to body for CSS targeting
    if (isChromium()) {
      document.body.classList.add('is-chromium');
    }
    
    return () => {
      document.body.classList.remove('is-chromium');
    };
  }, []);

  // FPS calculation with smoothing
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
      {/* SVG Filter Definitions for Liquid Glass (Chromium only) */}
      {isChromiumBrowser && <LiquidGlassSVG />}

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

      {/* Sidebar Panels - Now draggable, resizable, minimizable */}
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
