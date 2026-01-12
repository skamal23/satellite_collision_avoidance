import { useEffect, useRef, memo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SatellitePosition, FilterState, ConjunctionWarning, DebrisObject, DebrisFilterState } from '../types';

interface GlobeViewerProps {
  positions: SatellitePosition[];
  conjunctions: ConjunctionWarning[];
  debris: DebrisObject[];
  filters: FilterState;
  debrisFilters: DebrisFilterState;
  onSatelliteClick: (id: number) => void;
  theme: 'light' | 'dark';
}

const EARTH_RADIUS = 1;
const SCALE_FACTOR = 6371;

// Pre-allocated colors to avoid creating new THREE.Color objects
const LEO_COLOR = new THREE.Color(0x00d4ff);
const MEO_COLOR = new THREE.Color(0xffcc00);
const GEO_COLOR = new THREE.Color(0xff6600);
const SELECTED_COLOR = new THREE.Color(0xffffff);

// Debris colors
const DEBRIS_ROCKET_BODY = new THREE.Color(0xff6600);
const DEBRIS_PAYLOAD = new THREE.Color(0xff3333);
const DEBRIS_FRAGMENT = new THREE.Color(0xffcc00);
const DEBRIS_OTHER = new THREE.Color(0x888888);

function GlobeViewerComponent({
  positions,
  debris,
  filters,
  debrisFilters,
  onSatelliteClick,
}: GlobeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const satellitesRef = useRef<THREE.Points | null>(null);
  const debrisRef = useRef<THREE.Points | null>(null);
  const earthRef = useRef<THREE.Mesh | null>(null);
  const cloudsRef = useRef<THREE.Mesh | null>(null);
  const animationIdRef = useRef<number>(0);
  const isInitialized = useRef(false);
  
  // Track previous positions count for buffer resizing
  const prevPositionCountRef = useRef(0);

  // Convert ECI coordinates to spherical for rendering
  const eciToSpherical = useCallback((pos: { x: number; y: number; z: number }) => {
    const r = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
    const lat = Math.asin(pos.z / r);
    const lon = Math.atan2(pos.y, pos.x);
    const altitude = (r - 6371) / SCALE_FACTOR;
    return { lat, lon, r: EARTH_RADIUS + Math.max(altitude, 0.02) };
  }, []);

  const sphericalToCartesian = useCallback((lat: number, lon: number, r: number) => {
    return {
      x: r * Math.cos(lat) * Math.cos(lon),
      y: r * Math.sin(lat),
      z: r * Math.cos(lat) * Math.sin(lon)
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current || isInitialized.current) return;
    isInitialized.current = true;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);
    camera.position.set(0, 0, 3);
    cameraRef.current = camera;

    // Renderer - optimized settings
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1.3;
    controls.maxDistance = 10;
    controls.enablePan = false;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // Lighting - Full even illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.5);
    scene.add(ambientLight);

    const lights = [
      [5, 0, 5], [-5, 0, -5], [0, 5, 0], [0, -5, 0], [5, 0, -5], [-5, 0, 5]
    ];
    lights.forEach(([x, y, z]) => {
      const light = new THREE.DirectionalLight(0xffffff, 0.5);
      light.position.set(x, y, z);
      scene.add(light);
    });

    // Texture loader
    const textureLoader = new THREE.TextureLoader();
    
    // Earth - reduced segments for performance
    const earthGeometry = new THREE.SphereGeometry(EARTH_RADIUS, 48, 48);
    const earthDayUrl = 'https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg';
    const earthBumpUrl = 'https://unpkg.com/three-globe@2.31.1/example/img/earth-topology.png';
    const cloudsUrl = 'https://unpkg.com/three-globe@2.31.1/example/img/earth-clouds.png';
    
    textureLoader.load(
      earthDayUrl,
      (dayTexture) => {
        dayTexture.colorSpace = THREE.SRGBColorSpace;
        const earthMaterial = new THREE.MeshPhongMaterial({
          map: dayTexture,
          shininess: 5,
        });
        
        textureLoader.load(earthBumpUrl, (bumpTexture) => {
          earthMaterial.bumpMap = bumpTexture;
          earthMaterial.bumpScale = 0.05;
          earthMaterial.needsUpdate = true;
        });
        
        textureLoader.load('https://unpkg.com/three-globe@2.31.1/example/img/earth-water.png', (specTexture) => {
          earthMaterial.specularMap = specTexture;
          earthMaterial.specular = new THREE.Color(0x333333);
          earthMaterial.needsUpdate = true;
        });
        
        const earth = new THREE.Mesh(earthGeometry, earthMaterial);
        scene.add(earth);
        earthRef.current = earth;
      },
      undefined,
      () => {
        const fallbackMaterial = new THREE.MeshPhongMaterial({
          color: 0x2233aa,
          emissive: 0x112244,
          shininess: 10,
        });
        const earth = new THREE.Mesh(earthGeometry, fallbackMaterial);
        scene.add(earth);
        earthRef.current = earth;
      }
    );

    // Clouds - reduced segments
    textureLoader.load(cloudsUrl, (cloudsTexture) => {
      const cloudsGeometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.01, 32, 32);
      const cloudsMaterial = new THREE.MeshPhongMaterial({
        map: cloudsTexture,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      });
      const clouds = new THREE.Mesh(cloudsGeometry, cloudsMaterial);
      scene.add(clouds);
      cloudsRef.current = clouds;
    });

    // Atmosphere glow - reduced segments
    const atmosphereGeometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.15, 32, 32);
    const atmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
          gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity * 0.6;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(atmosphereGeometry, atmosphereMaterial));

    // Stars - reduced count
    const starsGeometry = new THREE.BufferGeometry();
    const starCount = 2000;
    const starPositions = new Float32Array(starCount * 3);
    
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 50 + Math.random() * 50;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
    }
    
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(starsGeometry, new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.15,
      transparent: true,
      opacity: 0.8,
    }));
    scene.add(stars);

    // Pre-create satellite points with max capacity
    const maxSatellites = 200;
    const satGeometry = new THREE.BufferGeometry();
    const satPositions = new Float32Array(maxSatellites * 3);
    const satColors = new Float32Array(maxSatellites * 3);
    
    satGeometry.setAttribute('position', new THREE.BufferAttribute(satPositions, 3));
    satGeometry.setAttribute('color', new THREE.BufferAttribute(satColors, 3));
    satGeometry.setDrawRange(0, 0);
    
    const satMaterial = new THREE.PointsMaterial({
      size: 0.015,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
    });
    
    const satellites = new THREE.Points(satGeometry, satMaterial);
    scene.add(satellites);
    satellitesRef.current = satellites;

    // Pre-create debris points with max capacity
    const maxDebris = 200;
    const debrisGeometry = new THREE.BufferGeometry();
    const debrisPositions = new Float32Array(maxDebris * 3);
    const debrisColors = new Float32Array(maxDebris * 3);
    
    debrisGeometry.setAttribute('position', new THREE.BufferAttribute(debrisPositions, 3));
    debrisGeometry.setAttribute('color', new THREE.BufferAttribute(debrisColors, 3));
    debrisGeometry.setDrawRange(0, 0);
    
    const debrisMaterial = new THREE.PointsMaterial({
      size: 0.008,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
    });
    
    const debrisPoints = new THREE.Points(debrisGeometry, debrisMaterial);
    scene.add(debrisPoints);
    debrisRef.current = debrisPoints;

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);

      if (earthRef.current) {
        earthRef.current.rotation.y += 0.0003;
      }
      if (cloudsRef.current) {
        cloudsRef.current.rotation.y += 0.0004;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationIdRef.current);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      isInitialized.current = false;
    };
  }, []);

  // Update satellites - optimized to update buffer attributes instead of recreating
  useEffect(() => {
    if (!satellitesRef.current) return;
    
    const geometry = satellitesRef.current.geometry;
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
    
    if (!posAttr || !colorAttr) return;
    
    const len = Math.min(positions.length, 200);
    
    for (let i = 0; i < len; i++) {
      const sat = positions[i];
      const spherical = eciToSpherical(sat.position);
      const pos = sphericalToCartesian(spherical.lat, spherical.lon, spherical.r);
      
      posAttr.setXYZ(i, pos.x, pos.y, pos.z);
      
      const altKm = (spherical.r - EARTH_RADIUS) * SCALE_FACTOR;
      const isSelected = filters.selectedSatelliteId === sat.id;
      
      let color: THREE.Color;
      if (isSelected) {
        color = SELECTED_COLOR;
      } else if (altKm < 2000) {
        color = LEO_COLOR;
      } else if (altKm < 20000) {
        color = MEO_COLOR;
      } else {
        color = GEO_COLOR;
      }
      
      colorAttr.setXYZ(i, color.r, color.g, color.b);
    }
    
    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    geometry.setDrawRange(0, len);
    
    prevPositionCountRef.current = len;
  }, [positions, filters.selectedSatelliteId, eciToSpherical, sphericalToCartesian]);

  // Update debris positions
  useEffect(() => {
    if (!debrisRef.current || !debrisFilters.showDebris) {
      if (debrisRef.current) {
        debrisRef.current.geometry.setDrawRange(0, 0);
      }
      return;
    }
    
    const geometry = debrisRef.current.geometry;
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
    
    if (!posAttr || !colorAttr) return;
    
    // Filter debris based on settings
    const filteredDebris = debris.filter(d => {
      if (d.altitudeKm < debrisFilters.minAltitudeKm || d.altitudeKm > debrisFilters.maxAltitudeKm) {
        return false;
      }
      if (d.type === 'rocket_body' && !debrisFilters.showRocketBodies) {
        return false;
      }
      if ((d.type === 'fragmentation' || d.type === 'payload_debris') && !debrisFilters.showFragments) {
        return false;
      }
      return true;
    });
    
    const len = Math.min(filteredDebris.length, 200);
    
    for (let i = 0; i < len; i++) {
      const deb = filteredDebris[i];
      const spherical = eciToSpherical(deb.position);
      const pos = sphericalToCartesian(spherical.lat, spherical.lon, spherical.r);
      
      posAttr.setXYZ(i, pos.x, pos.y, pos.z);
      
      // Color based on debris type
      let color: THREE.Color;
      switch (deb.type) {
        case 'rocket_body':
          color = DEBRIS_ROCKET_BODY;
          break;
        case 'payload_debris':
          color = DEBRIS_PAYLOAD;
          break;
        case 'fragmentation':
          color = DEBRIS_FRAGMENT;
          break;
        default:
          color = DEBRIS_OTHER;
      }
      
      colorAttr.setXYZ(i, color.r, color.g, color.b);
    }
    
    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    geometry.setDrawRange(0, len);
  }, [debris, debrisFilters, eciToSpherical, sphericalToCartesian]);

  // Handle click for satellite selection
  const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !cameraRef.current || !satellitesRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 0.03 };
    raycaster.setFromCamera(mouse, cameraRef.current);

    const intersects = raycaster.intersectObject(satellitesRef.current);
    if (intersects.length > 0 && intersects[0].index !== undefined) {
      const satIndex = intersects[0].index;
      if (satIndex < positions.length) {
        onSatelliteClick(positions[satIndex].id);
      }
    }
  }, [positions, onSatelliteClick]);

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className="absolute inset-0 z-0"
      style={{ 
        cursor: 'grab',
        background: 'radial-gradient(ellipse at center, #0a1628 0%, #000000 100%)',
      }}
    />
  );
}

export const GlobeViewer = memo(GlobeViewerComponent);
