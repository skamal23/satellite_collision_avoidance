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
const SCALE_FACTOR = 6371;

// Atmosphere shader - improved transparency and glow
const atmosphereVertexShader = `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const atmosphereFragmentShader = `
  varying vec3 vNormal;
  uniform vec3 lightDirection;
  
  void main() {
    float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 4.0);
    vec3 atmosphereColor = vec3(0.3, 0.6, 1.0);
    gl_FragColor = vec4(atmosphereColor, intensity * 0.5);
  }
`;

// Earth shader for realistic day/night transition
const earthVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const earthFragmentShader = `
  uniform sampler2D dayTexture;
  uniform sampler2D nightTexture;
  uniform sampler2D cloudsTexture;
  uniform sampler2D specularTexture;
  uniform vec3 lightDirection;
  
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  
  void main() {
    // Sample textures
    vec4 dayColor = texture2D(dayTexture, vUv);
    vec4 nightColor = texture2D(nightTexture, vUv);
    vec4 clouds = texture2D(cloudsTexture, vUv);
    float specular = texture2D(specularTexture, vUv).r;
    
    // Calculate lighting
    vec3 normal = normalize(vNormal);
    vec3 lightDir = normalize(lightDirection);
    
    // Day/Night mixing factor (smooth transition)
    float sunDot = dot(normal, lightDir);
    float mixFactor = smoothstep(-0.15, 0.15, sunDot);
    
    // Base surface color mixing
    // Use night lights for the dark side, map texture for day side
    vec3 surfaceColor = mix(nightColor.rgb * 2.0, dayColor.rgb, mixFactor);
    
    // Add clouds with shadow simulation
    // Clouds are visible on both day and night, but shaded differently
    float cloudMix = clouds.r * 0.9;
    vec3 cloudColor = vec3(mix(0.05, 1.0, mixFactor)); // Dark clouds at night, white at day
    surfaceColor = mix(surfaceColor, cloudColor, cloudMix);
    
    // Specular reflection (oceans)
    if (mixFactor > 0.05) {
      vec3 viewDir = normalize(cameraPosition - vPosition);
      vec3 reflectDir = reflect(-lightDir, normal);
      float spec = pow(max(dot(viewDir, reflectDir), 0.0), 30.0);
      surfaceColor += vec3(0.5) * spec * specular * mixFactor;
    }
    
    // Atmospheric scattering rim (Fresnel)
    float fresnel = pow(1.0 - max(dot(normal, normalize(cameraPosition - vPosition)), 0.0), 3.0);
    vec3 atmosphereColor = vec3(0.1, 0.4, 0.8);
    surfaceColor = mix(surfaceColor, atmosphereColor, fresnel * 0.4 * mixFactor); // More visible on day side
    
    gl_FragColor = vec4(surfaceColor, 1.0);
  }
`;

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
  const animationIdRef = useRef<number>(0);
  const isInitialized = useRef(false);
  const lightDirectionRef = useRef(new THREE.Vector3(1, 0.3, 0.5).normalize());

  useEffect(() => {
    if (!containerRef.current || isInitialized.current) return;
    isInitialized.current = true;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera - Centered focus
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
    camera.position.set(0, 0, 3.5); // Move back slightly to see full globe
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer - High quality
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      precision: 'highp',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // Tone mapping for realistic lighting
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls - Always rotate around center
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1.5;
    controls.maxDistance = 8;
    controls.enablePan = false; // Disable panning to keep Earth centered
    controls.target.set(0, 0, 0); // Always look at center
    controlsRef.current = controls;

    // Texture loader
    const textureLoader = new THREE.TextureLoader();
    
    // Load high-res textures
    const dayTexture = textureLoader.load('/textures/earth_day.jpg');
    const nightTexture = textureLoader.load('/textures/earth_night.jpg');
    const cloudsTexture = textureLoader.load('/textures/earth_clouds.png');
    const specularTexture = textureLoader.load('/textures/earth_specular.jpg');

    // Filter settings for sharpness
    [dayTexture, nightTexture, cloudsTexture, specularTexture].forEach(tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      tex.minFilter = THREE.LinearMipMapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
    });

    // Earth geometry - increased segments for smoothness
    const earthGeometry = new THREE.SphereGeometry(EARTH_RADIUS, 128, 128);
    
    // Shader material
    const earthMaterial = new THREE.ShaderMaterial({
      vertexShader: earthVertexShader,
      fragmentShader: earthFragmentShader,
      uniforms: {
        dayTexture: { value: dayTexture },
        nightTexture: { value: nightTexture },
        cloudsTexture: { value: cloudsTexture },
        specularTexture: { value: specularTexture },
        lightDirection: { value: lightDirectionRef.current },
      },
    });
    
    const earth = new THREE.Mesh(earthGeometry, earthMaterial);
    scene.add(earth);
    earthRef.current = earth;

    // Atmosphere glow
    const atmosphereGeometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.12, 64, 64);
    const atmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      uniforms: {
        lightDirection: { value: lightDirectionRef.current },
      },
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    scene.add(atmosphere);

    // Stars background
    const starsGeometry = new THREE.BufferGeometry();
    const starCount = 4000;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 40 + Math.random() * 40;
      
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
      
      // Star colors (white/blue/yellow tints)
      const colorType = Math.random();
      let color = new THREE.Color();
      if (colorType > 0.9) color.setHex(0xaaaaff); // Blueish
      else if (colorType > 0.7) color.setHex(0xffddaa); // Yellowish
      else color.setHex(0xffffff); // White
      
      const brightness = 0.4 + Math.random() * 0.6;
      starColors[i * 3] = color.r * brightness;
      starColors[i * 3 + 1] = color.g * brightness;
      starColors[i * 3 + 2] = color.b * brightness;
    }
    
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starsGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    
    const starsMaterial = new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
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
    let time = 0;
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      time += 0.0005;

      // Rotate Earth slowly
      if (earthRef.current) {
        earthRef.current.rotation.y += 0.0005;
      }

      // Move sun slightly to simulate day cycle (very slow)
      // Keeping it relatively static for better visibility of day side
      // lightDirectionRef.current.set(Math.sin(time), 0.3, Math.cos(time)).normalize();

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationIdRef.current);
      controls.dispose();
      renderer.dispose();
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      isInitialized.current = false;
    };
  }, []);

  // Update background based on theme
  useEffect(() => {
    // We use a transparent background for the renderer so CSS gradient shows through
    // No action needed here unless we want to change star colors
  }, [theme]);

  // Update satellites
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;
    
    // Cleanup old points
    if (satellitesRef.current) {
      scene.remove(satellitesRef.current);
      satellitesRef.current.geometry.dispose();
      (satellitesRef.current.material as THREE.PointsMaterial).dispose();
    }

    if (positions.length === 0) return;

    const satPositions = new Float32Array(positions.length * 3);
    const satColors = new Float32Array(positions.length * 3);
    const satSizes = new Float32Array(positions.length);

    positions.forEach((sat, i) => {
      const spherical = eciToSpherical(sat.position);
      const pos = sphericalToCartesian(spherical.lat, spherical.lon, spherical.r);
      
      satPositions[i * 3] = pos.x;
      satPositions[i * 3 + 1] = pos.y;
      satPositions[i * 3 + 2] = pos.z;

      const altKm = (spherical.r - EARTH_RADIUS) * SCALE_FACTOR;
      const isSelected = filters.selectedSatelliteId === sat.id;
      
      let color = new THREE.Color();
      let size = 0.02;

      if (isSelected) {
        color.setHex(0xffffff); // White for selected
        size = 0.05;
      } else if (altKm < 2000) {
        color.setHex(0x00d4ff); // LEO - Cyan
      } else if (altKm < 20000) {
        color.setHex(0xffcc00); // MEO - Yellow
      } else {
        color.setHex(0xff6600); // GEO - Orange
      }

      satColors[i * 3] = color.r;
      satColors[i * 3 + 1] = color.g;
      satColors[i * 3 + 2] = color.b;
      satSizes[i] = size;
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(satPositions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(satColors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(satSizes, 1));

    // Custom shader material for better looking points
    const material = new THREE.PointsMaterial({
      size: 0.02,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    });

    const satellites = new THREE.Points(geometry, material);
    scene.add(satellites);
    satellitesRef.current = satellites;
  }, [positions, filters.selectedSatelliteId]);

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
      className="absolute inset-0 z-0"
      style={{ 
        cursor: 'grab', 
        background: theme === 'dark' 
          ? 'radial-gradient(circle at center, #1a2a3a 0%, #000000 100%)' 
          : 'radial-gradient(circle at center, #f0f4f8 0%, #dde1e6 100%)'
      }}
    />
  );
}

export const GlobeViewer = memo(GlobeViewerComponent);
