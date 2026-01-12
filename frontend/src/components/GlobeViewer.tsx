import { useEffect, useRef, memo, useCallback, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SatellitePosition, FilterState, ConjunctionWarning, DebrisObject, DebrisFilterState, Vec3 } from '../types';

interface GlobeViewerProps {
  positions: SatellitePosition[];
  conjunctions: ConjunctionWarning[];
  debris: DebrisObject[];
  filters: FilterState;
  debrisFilters: DebrisFilterState;
  onSatelliteClick: (id: number) => void;
  theme: 'light' | 'dark';
}

// Orbital path type for rendering
interface OrbitPath {
  satelliteId: number;
  points: Vec3[];
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

// Conjunction colors
const CONJUNCTION_CRITICAL = new THREE.Color(0xff0000);
const CONJUNCTION_HIGH = new THREE.Color(0xff6600);
const CONJUNCTION_MEDIUM = new THREE.Color(0xffcc00);
const CONJUNCTION_LOW = new THREE.Color(0x00ff00);

// Orbit path colors
const ORBIT_PATH_COLOR = new THREE.Color(0x4488ff);
const ORBIT_PATH_SELECTED = new THREE.Color(0x00ffff);

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

  // New refs for advanced visualizations
  const orbitPathsRef = useRef<THREE.Group | null>(null);
  const conjunctionLinesRef = useRef<THREE.Group | null>(null);
  const labelsContainerRef = useRef<HTMLDivElement | null>(null);

  // Track previous positions count for buffer resizing
  const prevPositionCountRef = useRef(0);

  // State for label positions (updated during animation)
  const [labelPositions, setLabelPositions] = useState<Map<number, { x: number; y: number; visible: boolean }>>(new Map());

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

  // Generate orbital path points for a satellite (simple circular approximation)
  const generateOrbitPath = useCallback((position: Vec3, velocity: Vec3, numPoints: number = 100): Vec3[] => {
    const points: Vec3[] = [];
    const r = Math.sqrt(position.x * position.x + position.y * position.y + position.z * position.z);

    // Calculate orbital plane from position and velocity
    const posNorm = { x: position.x / r, y: position.y / r, z: position.z / r };

    // Normal to orbital plane (position x velocity)
    const normal = {
      x: position.y * velocity.z - position.z * velocity.y,
      y: position.z * velocity.x - position.x * velocity.z,
      z: position.x * velocity.y - position.y * velocity.x,
    };
    const normalLen = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
    if (normalLen < 0.001) return points;

    normal.x /= normalLen;
    normal.y /= normalLen;
    normal.z /= normalLen;

    // Create orthonormal basis in the orbital plane
    const u = { x: posNorm.x, y: posNorm.y, z: posNorm.z };
    const v = {
      x: normal.y * u.z - normal.z * u.y,
      y: normal.z * u.x - normal.x * u.z,
      z: normal.x * u.y - normal.y * u.x,
    };

    // Generate points around the orbit
    for (let i = 0; i <= numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      points.push({
        x: r * (cos * u.x + sin * v.x),
        y: r * (cos * u.y + sin * v.y),
        z: r * (cos * u.z + sin * v.z),
      });
    }

    return points;
  }, []);

  // Project 3D position to screen coordinates
  const projectToScreen = useCallback((position: THREE.Vector3, camera: THREE.Camera, width: number, height: number) => {
    const vector = position.clone();
    vector.project(camera);

    return {
      x: (vector.x * 0.5 + 0.5) * width,
      y: (-vector.y * 0.5 + 0.5) * height,
      visible: vector.z < 1, // In front of camera
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

    // Create group for orbital paths
    const orbitPaths = new THREE.Group();
    orbitPaths.name = 'orbitPaths';
    scene.add(orbitPaths);
    orbitPathsRef.current = orbitPaths;

    // Create group for conjunction lines
    const conjunctionLines = new THREE.Group();
    conjunctionLines.name = 'conjunctionLines';
    scene.add(conjunctionLines);
    conjunctionLinesRef.current = conjunctionLines;

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

    // Animation loop with label position updates
    let labelUpdateCounter = 0;
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

      // Update label positions every 3 frames for performance
      labelUpdateCounter++;
      if (labelUpdateCounter >= 3 && satellitesRef.current) {
        labelUpdateCounter = 0;
        const geometry = satellitesRef.current.geometry;
        const posAttr = geometry.getAttribute('position');
        const drawRange = geometry.drawRange;

        if (posAttr && drawRange.count > 0) {
          const newPositions = new Map<number, { x: number; y: number; visible: boolean }>();
          const tempVec = new THREE.Vector3();

          const minIdx = Math.min(drawRange.count, 20); // Only show labels for first 20 satellites for performance
          for (let i = 0; i < minIdx; i++) {
            tempVec.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
            const screenPos = tempVec.clone().project(camera);

            // Check if in front of camera and within screen bounds
            const visible = screenPos.z < 1 && Math.abs(screenPos.x) < 1.2 && Math.abs(screenPos.y) < 1.2;

            newPositions.set(i, {
              x: (screenPos.x * 0.5 + 0.5) * container.clientWidth,
              y: (-screenPos.y * 0.5 + 0.5) * container.clientHeight,
              visible,
            });
          }
          setLabelPositions(newPositions);
        }
      }
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

  // Update orbital paths when showOrbits is enabled
  useEffect(() => {
    if (!orbitPathsRef.current) return;

    // Clear existing paths
    while (orbitPathsRef.current.children.length > 0) {
      const child = orbitPathsRef.current.children[0];
      if (child instanceof THREE.Line) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
      orbitPathsRef.current.remove(child);
    }

    if (!filters.showOrbits || positions.length === 0) return;

    // Only render orbit for selected satellite, or first 5 if none selected
    const satellitesToShow = filters.selectedSatelliteId !== null
      ? positions.filter(p => p.id === filters.selectedSatelliteId)
      : positions.slice(0, 5);

    satellitesToShow.forEach((sat, idx) => {
      const orbitPoints = generateOrbitPath(sat.position, sat.velocity, 100);
      if (orbitPoints.length === 0) return;

      const geometry = new THREE.BufferGeometry();
      const pointsArray = new Float32Array(orbitPoints.length * 3);

      orbitPoints.forEach((p, i) => {
        const spherical = eciToSpherical(p);
        const cartesian = sphericalToCartesian(spherical.lat, spherical.lon, spherical.r);
        pointsArray[i * 3] = cartesian.x;
        pointsArray[i * 3 + 1] = cartesian.y;
        pointsArray[i * 3 + 2] = cartesian.z;
      });

      geometry.setAttribute('position', new THREE.BufferAttribute(pointsArray, 3));

      const isSelected = filters.selectedSatelliteId === sat.id;
      const material = new THREE.LineBasicMaterial({
        color: isSelected ? ORBIT_PATH_SELECTED : ORBIT_PATH_COLOR,
        transparent: true,
        opacity: isSelected ? 0.9 : 0.4 - idx * 0.05,
        linewidth: 1,
      });

      const line = new THREE.Line(geometry, material);
      line.userData.satelliteId = sat.id;
      orbitPathsRef.current!.add(line);
    });
  }, [filters.showOrbits, filters.selectedSatelliteId, positions, generateOrbitPath, eciToSpherical, sphericalToCartesian]);

  // Update conjunction lines
  useEffect(() => {
    if (!conjunctionLinesRef.current) return;

    // Clear existing lines
    while (conjunctionLinesRef.current.children.length > 0) {
      const child = conjunctionLinesRef.current.children[0];
      if (child instanceof THREE.Line) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
      conjunctionLinesRef.current.remove(child);
    }

    if (!filters.showConjunctions || conjunctions.length === 0 || positions.length === 0) return;

    // Create position lookup map
    const positionMap = new Map<number, SatellitePosition>();
    positions.forEach(p => positionMap.set(p.id, p));

    conjunctions.forEach(conj => {
      const sat1Pos = positionMap.get(conj.sat1Id);
      const sat2Pos = positionMap.get(conj.sat2Id);

      if (!sat1Pos || !sat2Pos) return;

      // Create line between the two satellites
      const geometry = new THREE.BufferGeometry();
      const pointsArray = new Float32Array(6);

      const sph1 = eciToSpherical(sat1Pos.position);
      const cart1 = sphericalToCartesian(sph1.lat, sph1.lon, sph1.r);
      pointsArray[0] = cart1.x;
      pointsArray[1] = cart1.y;
      pointsArray[2] = cart1.z;

      const sph2 = eciToSpherical(sat2Pos.position);
      const cart2 = sphericalToCartesian(sph2.lat, sph2.lon, sph2.r);
      pointsArray[3] = cart2.x;
      pointsArray[4] = cart2.y;
      pointsArray[5] = cart2.z;

      geometry.setAttribute('position', new THREE.BufferAttribute(pointsArray, 3));

      // Color based on collision probability
      let color: THREE.Color;
      if (conj.collisionProbability > 0.001) {
        color = CONJUNCTION_CRITICAL;
      } else if (conj.collisionProbability > 0.0001) {
        color = CONJUNCTION_HIGH;
      } else if (conj.collisionProbability > 0.00001) {
        color = CONJUNCTION_MEDIUM;
      } else {
        color = CONJUNCTION_LOW;
      }

      const material = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.8,
        linewidth: 2,
      });

      const line = new THREE.Line(geometry, material);
      line.userData.conjunctionId = `${conj.sat1Id}-${conj.sat2Id}`;
      conjunctionLinesRef.current!.add(line);

      // Add a pulsing sphere at midpoint for critical conjunctions
      if (conj.collisionProbability > 0.0001) {
        const midpoint = new THREE.Vector3(
          (cart1.x + cart2.x) / 2,
          (cart1.y + cart2.y) / 2,
          (cart1.z + cart2.z) / 2
        );
        const sphereGeometry = new THREE.SphereGeometry(0.015, 8, 8);
        const sphereMaterial = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.8,
        });
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphere.position.copy(midpoint);
        conjunctionLinesRef.current!.add(sphere);
      }
    });
  }, [filters.showConjunctions, conjunctions, positions, eciToSpherical, sphericalToCartesian]);

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
    <div className="absolute inset-0 z-0">
      <div
        ref={containerRef}
        onClick={handleClick}
        style={{
          width: '100%',
          height: '100%',
          cursor: 'grab',
          background: 'radial-gradient(ellipse at center, #0a1628 0%, #000000 100%)',
        }}
      />
      {/* Satellite Labels Overlay */}
      {filters.showLabels && (
        <div
          ref={labelsContainerRef}
          className="absolute inset-0 pointer-events-none overflow-hidden"
          style={{ zIndex: 10 }}
        >
          {Array.from(labelPositions.entries()).map(([idx, pos]) => {
            if (!pos.visible || idx >= positions.length) return null;
            const sat = positions[idx];
            const isSelected = filters.selectedSatelliteId === sat.id;

            return (
              <div
                key={sat.id}
                className="absolute text-xs font-mono whitespace-nowrap pointer-events-auto cursor-pointer"
                style={{
                  left: pos.x + 10,
                  top: pos.y - 8,
                  color: isSelected ? '#00ffff' : '#ffffff',
                  textShadow: '0 0 4px rgba(0,0,0,0.8), 0 0 2px rgba(0,0,0,0.9)',
                  opacity: isSelected ? 1 : 0.8,
                  fontSize: isSelected ? '11px' : '10px',
                  fontWeight: isSelected ? 600 : 400,
                  transition: 'opacity 0.2s',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onSatelliteClick(sat.id);
                }}
              >
                {sat.name}
              </div>
            );
          })}
        </div>
      )}
      {/* Conjunction Warning Overlay */}
      {filters.showConjunctions && conjunctions.length > 0 && (
        <div className="absolute top-4 right-4 pointer-events-none" style={{ zIndex: 20 }}>
          <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 border border-red-500/30">
            <div className="text-red-400 text-xs font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {conjunctions.length} Active Conjunction{conjunctions.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const GlobeViewer = memo(GlobeViewerComponent);
