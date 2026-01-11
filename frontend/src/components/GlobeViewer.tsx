import { useEffect, useRef, memo } from 'react';
import {
  Viewer,
  Cartesian3,
  Color,
  PointPrimitiveCollection,
  NearFarScalar,
  OpenStreetMapImageryProvider,
  SceneMode,
  defined,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { SatellitePosition, FilterState, ConjunctionWarning } from '../types';

// Set CESIUM_BASE_URL for workers
window.CESIUM_BASE_URL = '/cesium';

interface GlobeViewerProps {
  positions: SatellitePosition[];
  conjunctions: ConjunctionWarning[];
  filters: FilterState;
  onSatelliteClick: (id: number) => void;
  theme: 'light' | 'dark';
}

// Convert ECI-like coordinates to geographic
function eciToGeographic(pos: { x: number; y: number; z: number }) {
  const r = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
  const lat = Math.asin(pos.z / r) * (180 / Math.PI);
  const lon = Math.atan2(pos.y, pos.x) * (180 / Math.PI);
  const alt = (r - 6371) * 1000; // Convert km to meters
  return { lat, lon, alt: Math.max(alt, 100000) };
}

function GlobeViewerComponent({
  positions,
  filters,
  onSatelliteClick,
  theme,
}: GlobeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const pointsRef = useRef<PointPrimitiveCollection | null>(null);
  const isInitialized = useRef(false);

  // Initialize viewer once
  useEffect(() => {
    if (!containerRef.current || isInitialized.current) return;
    isInitialized.current = true;

    try {
      const viewer = new Viewer(containerRef.current, {
        animation: false,
        timeline: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        selectionIndicator: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        vrButton: false,
        sceneMode: SceneMode.SCENE3D,
        // Performance
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity,
        targetFrameRate: 30,
        msaaSamples: 1,
        // Use OpenStreetMap instead of Cesium Ion
        imageryProvider: new OpenStreetMapImageryProvider({
          url: 'https://tile.openstreetmap.org/',
        }),
      });

      // Disable heavy features
      viewer.scene.globe.enableLighting = false;
      viewer.scene.fog.enabled = false;
      viewer.scene.globe.showGroundAtmosphere = false;
      viewer.scene.skyAtmosphere.show = false;
      viewer.scene.sun.show = false;
      viewer.scene.moon.show = false;
      viewer.scene.skyBox.show = false;
      viewer.scene.globe.maximumScreenSpaceError = 4;

      // Create point collection
      const points = new PointPrimitiveCollection();
      viewer.scene.primitives.add(points);
      pointsRef.current = points;

      // Set camera
      viewer.camera.setView({
        destination: Cartesian3.fromDegrees(0, 20, 25000000),
      });

      // Hide credits
      const credits = viewer.cesiumWidget.creditContainer as HTMLElement;
      if (credits) credits.style.display = 'none';

      viewerRef.current = viewer;

      // Request initial render
      viewer.scene.requestRender();
    } catch (err) {
      console.error('Failed to initialize Cesium viewer:', err);
    }

    return () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        try {
          // Clean up primitives first
          if (pointsRef.current) {
            pointsRef.current.removeAll();
          }
          viewerRef.current.destroy();
        } catch (e) {
          console.warn('Error during viewer cleanup:', e);
        }
      }
      viewerRef.current = null;
      pointsRef.current = null;
      isInitialized.current = false;
    };
  }, []);

  // Update theme
  useEffect(() => {
    if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
    
    viewerRef.current.scene.backgroundColor = theme === 'dark'
      ? Color.fromCssColorString('#080c18')
      : Color.fromCssColorString('#e8f0ff');
    
    viewerRef.current.scene.requestRender();
  }, [theme]);

  // Update satellites
  useEffect(() => {
    if (!viewerRef.current || viewerRef.current.isDestroyed() || !pointsRef.current) return;
    
    const points = pointsRef.current;
    const viewer = viewerRef.current;
    
    // Clear and rebuild
    points.removeAll();

    // Limit for performance
    const maxSats = 150;
    const toRender = positions.slice(0, maxSats);

    toRender.forEach((sat) => {
      try {
        const geo = eciToGeographic(sat.position);
        const position = Cartesian3.fromDegrees(geo.lon, geo.lat, geo.alt);
        const isSelected = filters.selectedSatelliteId === sat.id;
        
        // Color by altitude
        const altKm = geo.alt / 1000;
        let color: Color;
        if (isSelected) {
          color = Color.fromCssColorString('#60a5fa');
        } else if (altKm < 2000) {
          color = Color.fromCssColorString('#22d3ee').withAlpha(0.85);
        } else if (altKm < 20000) {
          color = Color.fromCssColorString('#facc15').withAlpha(0.85);
        } else {
          color = Color.fromCssColorString('#fb923c').withAlpha(0.85);
        }

        points.add({
          position,
          pixelSize: isSelected ? 12 : 5,
          color,
          outlineColor: Color.WHITE,
          outlineWidth: isSelected ? 2 : 0,
          scaleByDistance: new NearFarScalar(1e6, 1.5, 5e7, 0.3),
          id: sat.id,
        });
      } catch (e) {
        // Skip invalid positions
      }
    });

    viewer.scene.requestRender();
  }, [positions, filters.selectedSatelliteId]);

  // Handle clicks
  useEffect(() => {
    if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
    
    const handler = viewerRef.current.screenSpaceEventHandler;
    
    handler.setInputAction((click: { position: { x: number; y: number } }) => {
      if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
      
      const picked = viewerRef.current.scene.pick(click.position);
      if (defined(picked) && picked.id !== undefined && typeof picked.id === 'number') {
        onSatelliteClick(picked.id);
      }
    }, 0); // LEFT_CLICK

    return () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        try {
          viewerRef.current.screenSpaceEventHandler.removeInputAction(0);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, [onSatelliteClick]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: theme === 'dark' ? '#080c18' : '#e8f0ff',
      }}
    />
  );
}

// Memoize to prevent unnecessary re-renders
export const GlobeViewer = memo(GlobeViewerComponent);
