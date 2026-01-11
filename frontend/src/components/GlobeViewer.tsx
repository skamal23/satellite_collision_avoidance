import { useEffect, useRef, useCallback } from 'react';
import {
  Ion,
  Viewer,
  Cartesian3,
  Color,
  PointPrimitiveCollection,
  PolylineCollection,
  LabelCollection,
  NearFarScalar,
  VerticalOrigin,
  HorizontalOrigin,
  Cartographic,
  Math as CesiumMath,
  createWorldTerrainAsync,
  SceneMode,
  ImageryLayer,
  IonImageryProvider,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { SatellitePosition, FilterState, ConjunctionWarning } from '../types';

// Free Cesium ion token (replace with your own for production)
Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlYWE1OWUxNy1mMWZiLTQzYjYtYTQ0OS1kMWFjYmFkNjc5YzciLCJpZCI6NTc2ODksImlhdCI6MTYyNzg0MDU3NX0.NnAeUUjVKSF0eDkPCPpZgP-GnGqLLEQO_7rBs8o2UzU';

interface GlobeViewerProps {
  positions: SatellitePosition[];
  conjunctions: ConjunctionWarning[];
  filters: FilterState;
  onSatelliteClick: (id: number) => void;
  theme: 'light' | 'dark';
}

// Convert latitude/longitude/altitude to Cartesian (for display purposes)
// We'll convert ECI-like coordinates to geographic coordinates
function eciToGeographic(pos: { x: number; y: number; z: number }, time: number) {
  // Simplified conversion from ECI to ECEF (ignoring Earth rotation for now)
  const r = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
  const lat = Math.asin(pos.z / r) * (180 / Math.PI);
  const lon = Math.atan2(pos.y, pos.x) * (180 / Math.PI);
  const alt = (r - 6371) * 1000; // Convert to meters
  
  return { lat, lon, alt: Math.max(alt, 100000) }; // Minimum 100km altitude for visibility
}

export function GlobeViewer({
  positions,
  conjunctions,
  filters,
  onSatelliteClick,
  theme,
}: GlobeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const pointsRef = useRef<PointPrimitiveCollection | null>(null);
  const labelsRef = useRef<LabelCollection | null>(null);
  const linesRef = useRef<PolylineCollection | null>(null);
  const animationFrameRef = useRef<number>(0);

  // Initialize viewer once
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    const viewer = new Viewer(containerRef.current, {
      // Disable all default widgets for performance
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
      // Performance settings
      requestRenderMode: true, // Only render when needed
      maximumRenderTimeChange: Infinity,
      targetFrameRate: 30, // Cap at 30 FPS for smoothness
      useBrowserRecommendedResolution: false,
      msaaSamples: 1, // Disable MSAA for performance
    });

    // Disable unnecessary features
    viewer.scene.globe.enableLighting = false;
    viewer.scene.fog.enabled = false;
    viewer.scene.globe.showGroundAtmosphere = false;
    viewer.scene.skyAtmosphere.show = false;
    viewer.scene.sun.show = false;
    viewer.scene.moon.show = false;
    viewer.scene.skyBox.show = theme === 'dark';
    
    // Optimize globe rendering
    viewer.scene.globe.maximumScreenSpaceError = 4; // Lower quality for speed
    viewer.scene.globe.tileCacheSize = 100;
    
    // Create primitive collections for efficient rendering
    const points = new PointPrimitiveCollection();
    const labels = new LabelCollection();
    const lines = new PolylineCollection();
    
    viewer.scene.primitives.add(points);
    viewer.scene.primitives.add(labels);
    viewer.scene.primitives.add(lines);

    pointsRef.current = points;
    labelsRef.current = labels;
    linesRef.current = lines;
    viewerRef.current = viewer;

    // Set initial camera position
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(0, 0, 30000000), // 30,000 km altitude
    });

    // Hide credits
    const creditContainer = viewer.cesiumWidget.creditContainer as HTMLElement;
    creditContainer.style.display = 'none';

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  // Update theme
  useEffect(() => {
    if (!viewerRef.current) return;
    const viewer = viewerRef.current;
    
    viewer.scene.backgroundColor = theme === 'dark'
      ? Color.fromCssColorString('#080c18')
      : Color.fromCssColorString('#e8f0ff');
    viewer.scene.skyBox.show = theme === 'dark';
  }, [theme]);

  // Update satellite positions efficiently
  useEffect(() => {
    if (!viewerRef.current || !pointsRef.current || !labelsRef.current) return;
    
    const points = pointsRef.current;
    const labels = labelsRef.current;
    const viewer = viewerRef.current;
    
    // Clear existing primitives
    points.removeAll();
    labels.removeAll();

    // Limit number of satellites for performance
    const maxSatellites = 200;
    const visiblePositions = positions.slice(0, maxSatellites);

    // Add satellites as point primitives (much faster than entities)
    visiblePositions.forEach((sat) => {
      const geo = eciToGeographic(sat.position, sat.timestamp);
      const position = Cartesian3.fromDegrees(geo.lon, geo.lat, geo.alt);
      const isSelected = filters.selectedSatelliteId === sat.id;
      
      // Altitude-based coloring
      const altitude = geo.alt / 1000; // km
      let color: Color;
      if (isSelected) {
        color = Color.fromCssColorString('#60a5fa');
      } else if (altitude < 2000) {
        color = Color.fromCssColorString('#22d3ee').withAlpha(0.85);
      } else if (altitude < 20000) {
        color = Color.fromCssColorString('#facc15').withAlpha(0.85);
      } else {
        color = Color.fromCssColorString('#fb923c').withAlpha(0.85);
      }

      points.add({
        position,
        pixelSize: isSelected ? 10 : 5,
        color,
        outlineColor: Color.WHITE,
        outlineWidth: isSelected ? 2 : 0,
        scaleByDistance: new NearFarScalar(1e6, 1.2, 5e7, 0.4),
        id: sat.id,
      });

      // Only add labels for selected satellite or if labels are enabled and zoomed in
      if (isSelected || (filters.showLabels && visiblePositions.length < 50)) {
        labels.add({
          position,
          text: sat.name,
          font: '12px sans-serif',
          fillColor: Color.WHITE,
          outlineColor: Color.BLACK,
          outlineWidth: 2,
          style: 2, // FILL_AND_OUTLINE
          verticalOrigin: VerticalOrigin.BOTTOM,
          horizontalOrigin: HorizontalOrigin.CENTER,
          pixelOffset: new Cartesian3(0, -15, 0) as any,
          scaleByDistance: new NearFarScalar(1e6, 1, 3e7, 0),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });
      }
    });

    // Request a render
    viewer.scene.requestRender();
  }, [positions, filters.selectedSatelliteId, filters.showLabels]);

  // Update conjunction lines
  useEffect(() => {
    if (!viewerRef.current || !linesRef.current) return;
    
    const lines = linesRef.current;
    const viewer = viewerRef.current;
    
    lines.removeAll();

    if (!filters.showConjunctions) return;

    // Only show high-risk conjunctions
    const highRiskConjunctions = conjunctions.filter(c => c.collisionProbability >= 0.00001);

    highRiskConjunctions.forEach((conj) => {
      const sat1 = positions.find(p => p.id === conj.sat1Id);
      const sat2 = positions.find(p => p.id === conj.sat2Id);
      if (!sat1 || !sat2) return;

      const geo1 = eciToGeographic(sat1.position, sat1.timestamp);
      const geo2 = eciToGeographic(sat2.position, sat2.timestamp);
      
      const isHighRisk = conj.collisionProbability >= 0.0001;
      
      lines.add({
        positions: [
          Cartesian3.fromDegrees(geo1.lon, geo1.lat, geo1.alt),
          Cartesian3.fromDegrees(geo2.lon, geo2.lat, geo2.alt),
        ],
        width: isHighRisk ? 3 : 2,
        material: isHighRisk
          ? Color.fromCssColorString('#ef4444').withAlpha(0.7) as any
          : Color.fromCssColorString('#f59e0b').withAlpha(0.5) as any,
      });
    });

    viewer.scene.requestRender();
  }, [conjunctions, positions, filters.showConjunctions]);

  // Handle click events
  useEffect(() => {
    if (!viewerRef.current) return;
    const viewer = viewerRef.current;

    const handler = viewer.screenSpaceEventHandler;
    handler.setInputAction((click: { position: { x: number; y: number } }) => {
      const picked = viewer.scene.pick(click.position);
      if (picked?.id !== undefined && typeof picked.id === 'number') {
        onSatelliteClick(picked.id);
      }
    }, 0); // LEFT_CLICK

    return () => {
      handler.removeInputAction(0);
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
