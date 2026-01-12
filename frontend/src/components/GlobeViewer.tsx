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
const SCALE_FACTOR = 6371; // km

function GlobeViewerComponent({
  positions,
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
  const cloudsRef = useRef<THREE.Mesh | null>(null);
  const atmosphereRef = useRef<THREE.Mesh | null>(null);
  const animationIdRef = useRef<number>(0);
  const isInitialized = useRef(false);

  // Convert ECI coordinates to spherical for rendering
  const eciToSpherical = useCallback((pos: { x: number; y: number; z: number }) => {
    const r = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
    const lat = Math.asin(pos.z / r);
    const lon = Math.atan2(pos.y, pos.x);
    const altitude = (r - 6371) / SCALE_FACTOR;
    return { lat, lon, r: EARTH_RADIUS + Math.max(altitude, 0.02) };
  }, []);

  const sphericalToCartesian = useCallback((lat: number, lon: number, r: number): THREE.Vector3 => {
    return new THREE.Vector3(
      r * Math.cos(lat) * Math.cos(lon),
      r * Math.sin(lat),
      r * Math.cos(lat) * Math.sin(lon)
    );
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

    // Camera - centered on Earth
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);
    camera.position.set(0, 0, 3);
    cameraRef.current = camera;

    // Renderer
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

    // Controls - Earth stays centered
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1.3;
    controls.maxDistance = 10;
    controls.enablePan = false; // Keep Earth centered
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // Lighting - Full even illumination from all directions
    // Very strong ambient light for base illumination (no shadows)
    const ambientLight = new THREE.AmbientLight(0xffffff, 2.5);
    scene.add(ambientLight);

    // Multiple directional lights from all angles for completely even coverage
    const sunLight1 = new THREE.DirectionalLight(0xffffff, 0.5);
    sunLight1.position.set(5, 0, 5);
    scene.add(sunLight1);

    const sunLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    sunLight2.position.set(-5, 0, -5);
    scene.add(sunLight2);

    const sunLight3 = new THREE.DirectionalLight(0xffffff, 0.5);
    sunLight3.position.set(0, 5, 0);
    scene.add(sunLight3);

    const sunLight4 = new THREE.DirectionalLight(0xffffff, 0.5);
    sunLight4.position.set(0, -5, 0);
    scene.add(sunLight4);

    const sunLight5 = new THREE.DirectionalLight(0xffffff, 0.5);
    sunLight5.position.set(5, 0, -5);
    scene.add(sunLight5);

    const sunLight6 = new THREE.DirectionalLight(0xffffff, 0.5);
    sunLight6.position.set(-5, 0, 5);
    scene.add(sunLight6);

    // Texture loader with error handling
    const textureLoader = new THREE.TextureLoader();
    
    // Create Earth with reliable texture URLs
    const earthGeometry = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);
    
    // Use NASA Blue Marble textures from a reliable CDN
    const earthDayUrl = 'https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg';
    const earthNightUrl = 'https://unpkg.com/three-globe@2.31.1/example/img/earth-night.jpg';
    const earthBumpUrl = 'https://unpkg.com/three-globe@2.31.1/example/img/earth-topology.png';
    const cloudsUrl = 'https://unpkg.com/three-globe@2.31.1/example/img/earth-clouds.png';
    
    // Load day texture first, then add other maps
    textureLoader.load(
      earthDayUrl,
      (dayTexture) => {
        dayTexture.colorSpace = THREE.SRGBColorSpace;
        
        const earthMaterial = new THREE.MeshPhongMaterial({
          map: dayTexture,
          shininess: 5,
        });
        
        // Load bump map
        textureLoader.load(earthBumpUrl, (bumpTexture) => {
          earthMaterial.bumpMap = bumpTexture;
          earthMaterial.bumpScale = 0.05;
          earthMaterial.needsUpdate = true;
        });
        
        // Load specular map for oceans
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
      (error) => {
        console.error('Failed to load Earth texture, using fallback:', error);
        // Fallback: Create procedural Earth
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

    // Clouds layer
    textureLoader.load(
      cloudsUrl,
      (cloudsTexture) => {
        const cloudsGeometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.01, 64, 64);
        const cloudsMaterial = new THREE.MeshPhongMaterial({
          map: cloudsTexture,
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
        });
        const clouds = new THREE.Mesh(cloudsGeometry, cloudsMaterial);
        scene.add(clouds);
        cloudsRef.current = clouds;
      }
    );

    // Atmosphere glow
    const atmosphereGeometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.15, 64, 64);
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
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    scene.add(atmosphere);
    atmosphereRef.current = atmosphere;

    // Stars background
    const starsGeometry = new THREE.BufferGeometry();
    const starCount = 3000;
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
    const starsMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.15,
      transparent: true,
      opacity: 0.8,
    });
    const stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(stars);

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

      // Rotate Earth slowly
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

    const satPositions = new Float32Array(positions.length * 3);
    const satColors = new Float32Array(positions.length * 3);

    positions.forEach((sat, i) => {
      const spherical = eciToSpherical(sat.position);
      const pos = sphericalToCartesian(spherical.lat, spherical.lon, spherical.r);
      
      satPositions[i * 3] = pos.x;
      satPositions[i * 3 + 1] = pos.y;
      satPositions[i * 3 + 2] = pos.z;

      const altKm = (spherical.r - EARTH_RADIUS) * SCALE_FACTOR;
      const isSelected = filters.selectedSatelliteId === sat.id;
      
      let color: THREE.Color;
      if (isSelected) {
        color = new THREE.Color(0xffffff);
      } else if (altKm < 2000) {
        color = new THREE.Color(0x00d4ff); // LEO - Cyan
      } else if (altKm < 20000) {
        color = new THREE.Color(0xffcc00); // MEO - Yellow
      } else {
        color = new THREE.Color(0xff6600); // GEO - Orange
      }

      satColors[i * 3] = color.r;
      satColors[i * 3 + 1] = color.g;
      satColors[i * 3 + 2] = color.b;
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(satPositions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(satColors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.015,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      sizeAttenuation: true,
    });

    const satellites = new THREE.Points(geometry, material);
    scene.add(satellites);
    satellitesRef.current = satellites;
  }, [positions, filters.selectedSatelliteId, eciToSpherical, sphericalToCartesian]);

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

  // Background gradient based on theme
  const bgStyle = theme === 'dark' 
    ? 'radial-gradient(ellipse at center, #0a1628 0%, #000000 100%)'
    : 'radial-gradient(ellipse at center, #d0e0f0 0%, #a0b8d0 100%)';

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className="absolute inset-0 z-0"
      style={{ 
        cursor: 'grab',
        background: bgStyle,
      }}
    />
  );
}

export const GlobeViewer = memo(GlobeViewerComponent);
