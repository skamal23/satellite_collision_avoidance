import { useEffect, useRef, memo, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SatellitePosition, FilterState, ConjunctionWarning } from '../types';

interface GlobeViewerProps {
  positions: SatellitePosition[];
  conjunctions: ConjunctionWarning[];
  filters: FilterState;
  onSatelliteClick: (id: number) => void;
  theme: 'light' | 'dark';
}

const EARTH_RADIUS = 1;
const SCALE_FACTOR = 6371; // km per unit

function eciToSpherical(pos: { x: number; y: number; z: number }) {
  const r = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
  const lat = Math.asin(pos.z / r);
  const lon = Math.atan2(pos.y, pos.x);
  const altitude = (r - 6371) / SCALE_FACTOR;
  return { lat, lon, r: EARTH_RADIUS + Math.max(altitude, 0.02) };
}

function sphericalToCartesian(lat: number, lon: number, r: number): THREE.Vector3 {
  return new THREE.Vector3(
    r * Math.cos(lat) * Math.cos(lon),
    r * Math.sin(lat),
    r * Math.cos(lat) * Math.sin(lon)
  );
}

function GlobeViewerComponent({
  positions,
  conjunctions,
  filters,
  onSatelliteClick,
  theme,
}: GlobeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const satellitesRef = useRef<THREE.Points | null>(null);
  const earthRef = useRef<THREE.Mesh | null>(null);
  const atmosphereRef = useRef<THREE.Mesh | null>(null);
  const animationIdRef = useRef<number>(0);
  const isInitialized = useRef(false);

  // Initialize scene
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
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
    camera.position.set(0, 0, 4);
    cameraRef.current = camera;

    // Renderer with performance optimizations
    const renderer = new THREE.WebGLRenderer({
      antialias: false, // Disable for performance
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1.5;
    controls.maxDistance = 10;
    controls.enablePan = false;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(5, 3, 5);
    scene.add(directionalLight);

    // Earth - using procedural textures for instant loading
    const earthGeometry = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);
    
    // Create gradient texture for Earth
    const earthCanvas = document.createElement('canvas');
    earthCanvas.width = 512;
    earthCanvas.height = 256;
    const ctx = earthCanvas.getContext('2d')!;
    
    // Blue ocean base
    ctx.fillStyle = '#1a4f8c';
    ctx.fillRect(0, 0, 512, 256);
    
    // Add some landmass-like variations
    const gradient = ctx.createRadialGradient(256, 128, 0, 256, 128, 200);
    gradient.addColorStop(0, 'rgba(34, 139, 34, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 256);
    
    // Add noise pattern for continents
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 256;
      const r = 20 + Math.random() * 40;
      const landGrad = ctx.createRadialGradient(x, y, 0, x, y, r);
      landGrad.addColorStop(0, 'rgba(34, 85, 34, 0.6)');
      landGrad.addColorStop(0.5, 'rgba(76, 116, 61, 0.3)');
      landGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = landGrad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const earthTexture = new THREE.CanvasTexture(earthCanvas);
    earthTexture.wrapS = THREE.RepeatWrapping;
    
    const earthMaterial = new THREE.MeshPhongMaterial({
      map: earthTexture,
      shininess: 25,
    });
    
    const earth = new THREE.Mesh(earthGeometry, earthMaterial);
    scene.add(earth);
    earthRef.current = earth;

    // Atmosphere glow
    const atmosphereGeometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.02, 32, 32);
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
          float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
          gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
    });
    
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    atmosphere.scale.set(1.15, 1.15, 1.15);
    scene.add(atmosphere);
    atmosphereRef.current = atmosphere;

    // Stars background
    const starsGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(3000 * 3);
    for (let i = 0; i < 3000; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 50 + Math.random() * 50;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
    }
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    
    const starsMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.1,
      sizeAttenuation: true,
    });
    const stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(stars);

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Animation loop
    let lastTime = 0;
    const animate = (time: number) => {
      animationIdRef.current = requestAnimationFrame(animate);
      
      // Throttle to 60fps
      if (time - lastTime < 16) return;
      lastTime = time;

      // Slowly rotate Earth
      if (earthRef.current) {
        earthRef.current.rotation.y += 0.0005;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate(0);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationIdRef.current);
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      isInitialized.current = false;
    };
  }, []);

  // Update theme
  useEffect(() => {
    if (!sceneRef.current || !rendererRef.current) return;
    
    const bgColor = theme === 'dark' ? 0x080c18 : 0xe8f0ff;
    sceneRef.current.background = new THREE.Color(bgColor);
  }, [theme]);

  // Update satellites
  useEffect(() => {
    if (!sceneRef.current) return;
    
    const scene = sceneRef.current;
    
    // Remove old satellites
    if (satellitesRef.current) {
      scene.remove(satellitesRef.current);
      satellitesRef.current.geometry.dispose();
      (satellitesRef.current.material as THREE.PointsMaterial).dispose();
    }

    if (positions.length === 0) return;

    // Create new satellite points
    const satPositions = new Float32Array(positions.length * 3);
    const satColors = new Float32Array(positions.length * 3);
    const satSizes = new Float32Array(positions.length);

    positions.forEach((sat, i) => {
      const spherical = eciToSpherical(sat.position);
      const pos = sphericalToCartesian(spherical.lat, spherical.lon, spherical.r);
      
      satPositions[i * 3] = pos.x;
      satPositions[i * 3 + 1] = pos.y;
      satPositions[i * 3 + 2] = pos.z;

      // Color by altitude
      const altKm = (spherical.r - EARTH_RADIUS) * SCALE_FACTOR;
      const isSelected = filters.selectedSatelliteId === sat.id;
      
      let color: THREE.Color;
      if (isSelected) {
        color = new THREE.Color(0x60a5fa);
      } else if (altKm < 2000) {
        color = new THREE.Color(0x22d3ee); // Cyan for LEO
      } else if (altKm < 20000) {
        color = new THREE.Color(0xfacc15); // Yellow for MEO
      } else {
        color = new THREE.Color(0xfb923c); // Orange for GEO
      }

      satColors[i * 3] = color.r;
      satColors[i * 3 + 1] = color.g;
      satColors[i * 3 + 2] = color.b;
      satSizes[i] = isSelected ? 8 : 3;
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(satPositions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(satColors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(satSizes, 1));

    const material = new THREE.PointsMaterial({
      size: 0.02,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
    });

    const satellites = new THREE.Points(geometry, material);
    scene.add(satellites);
    satellitesRef.current = satellites;
  }, [positions, filters.selectedSatelliteId]);

  // Handle clicks
  const handleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !cameraRef.current || !satellitesRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 0.05 };
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
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        cursor: 'grab',
      }}
    />
  );
}

export const GlobeViewer = memo(GlobeViewerComponent);
