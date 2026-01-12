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

// Atmosphere shader
const atmosphereVertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const atmosphereFragmentShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform vec3 lightDirection;
  
  void main() {
    float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
    float sunFacing = max(0.0, dot(vNormal, lightDirection));
    vec3 atmosphereColor = mix(
      vec3(0.1, 0.4, 0.8),
      vec3(0.3, 0.6, 1.0),
      sunFacing
    );
    gl_FragColor = vec4(atmosphereColor, intensity * 0.6);
  }
`;

// Earth shader for day/night transition
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
  uniform sampler2D bumpTexture;
  uniform sampler2D specularTexture;
  uniform vec3 lightDirection;
  uniform float cloudOpacity;
  
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  
  void main() {
    vec3 dayColor = texture2D(dayTexture, vUv).rgb;
    vec3 nightColor = texture2D(nightTexture, vUv).rgb;
    vec3 clouds = texture2D(cloudsTexture, vUv).rgb;
    float specular = texture2D(specularTexture, vUv).r;
    
    // Day/night blending based on sun direction
    float sunIntensity = dot(vNormal, lightDirection);
    float dayNightMix = smoothstep(-0.2, 0.3, sunIntensity);
    
    // Blend day and night
    vec3 surfaceColor = mix(nightColor * 1.5, dayColor, dayNightMix);
    
    // Add clouds on day side
    surfaceColor = mix(surfaceColor, vec3(1.0), clouds.r * cloudOpacity * dayNightMix);
    
    // Add specular highlight for oceans
    vec3 viewDir = normalize(cameraPosition - vPosition);
    vec3 reflectDir = reflect(-lightDirection, vNormal);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
    surfaceColor += vec3(1.0) * spec * specular * 0.5 * dayNightMix;
    
    // Fresnel rim lighting
    float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 3.0);
    surfaceColor += vec3(0.3, 0.6, 1.0) * fresnel * 0.15;
    
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
  const cloudsRef = useRef<THREE.Mesh | null>(null);
  const animationIdRef = useRef<number>(0);
  const isInitialized = useRef(false);
  const lightDirectionRef = useRef(new THREE.Vector3(1, 0.5, 0.5).normalize());

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

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1.3;
    controls.maxDistance = 8;
    controls.enablePan = false;
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 0.8;
    controlsRef.current = controls;

    // Texture loader
    const textureLoader = new THREE.TextureLoader();
    
    // Load Earth textures
    const dayTexture = textureLoader.load('/textures/earth_day.jpg');
    const nightTexture = textureLoader.load('/textures/earth_night.jpg');
    const cloudsTexture = textureLoader.load('/textures/earth_clouds.png');
    const bumpTexture = textureLoader.load('/textures/earth_bump.jpg');
    const specularTexture = textureLoader.load('/textures/earth_specular.jpg');

    // Set texture properties
    [dayTexture, nightTexture, cloudsTexture, bumpTexture, specularTexture].forEach(tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    });

    // Earth with custom shader
    const earthGeometry = new THREE.SphereGeometry(EARTH_RADIUS, 128, 64);
    const earthMaterial = new THREE.ShaderMaterial({
      vertexShader: earthVertexShader,
      fragmentShader: earthFragmentShader,
      uniforms: {
        dayTexture: { value: dayTexture },
        nightTexture: { value: nightTexture },
        cloudsTexture: { value: cloudsTexture },
        bumpTexture: { value: bumpTexture },
        specularTexture: { value: specularTexture },
        lightDirection: { value: lightDirectionRef.current },
        cloudOpacity: { value: 0.4 },
      },
    });
    
    const earth = new THREE.Mesh(earthGeometry, earthMaterial);
    scene.add(earth);
    earthRef.current = earth;

    // Clouds layer
    const cloudsGeometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.005, 64, 32);
    const cloudsMaterial = new THREE.MeshPhongMaterial({
      map: cloudsTexture,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const clouds = new THREE.Mesh(cloudsGeometry, cloudsMaterial);
    scene.add(clouds);
    cloudsRef.current = clouds;

    // Atmosphere glow
    const atmosphereGeometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.15, 64, 32);
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

    // Ambient light
    const ambientLight = new THREE.AmbientLight(0x404060, 0.3);
    scene.add(ambientLight);

    // Sun light
    const sunLight = new THREE.DirectionalLight(0xffffff, 2);
    sunLight.position.copy(lightDirectionRef.current.clone().multiplyScalar(10));
    scene.add(sunLight);

    // Stars
    const starsGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(5000 * 3);
    const starColors = new Float32Array(5000 * 3);
    for (let i = 0; i < 5000; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 30 + Math.random() * 40;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
      
      const brightness = 0.5 + Math.random() * 0.5;
      const tint = Math.random();
      starColors[i * 3] = brightness * (tint > 0.8 ? 1.0 : 0.9);
      starColors[i * 3 + 1] = brightness * (tint > 0.9 ? 0.8 : 0.95);
      starColors[i * 3 + 2] = brightness;
    }
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starsGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    
    const starsMaterial = new THREE.PointsMaterial({
      size: 0.08,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
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
      time += 0.001;

      // Slowly rotate Earth
      if (earthRef.current) {
        earthRef.current.rotation.y += 0.0003;
      }
      
      // Rotate clouds slightly faster
      if (cloudsRef.current) {
        cloudsRef.current.rotation.y += 0.0004;
      }

      // Update light direction (simulate sun movement)
      const sunAngle = time * 0.1;
      lightDirectionRef.current.set(
        Math.cos(sunAngle),
        0.3,
        Math.sin(sunAngle)
      ).normalize();

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

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
    if (!sceneRef.current) return;
    sceneRef.current.background = null; // Transparent for dark theme
  }, [theme]);

  // Update satellites
  useEffect(() => {
    if (!sceneRef.current) return;
    
    const scene = sceneRef.current;
    
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
        color = new THREE.Color(0x00ff88);
      } else if (altKm < 2000) {
        color = new THREE.Color(0x00d4ff);
      } else if (altKm < 20000) {
        color = new THREE.Color(0xffcc00);
      } else {
        color = new THREE.Color(0xff6600);
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
      opacity: 0.95,
      sizeAttenuation: true,
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
      className="absolute inset-0"
      style={{ cursor: 'grab', background: 'radial-gradient(ellipse at center, #0a1628 0%, #000000 100%)' }}
    />
  );
}

export const GlobeViewer = memo(GlobeViewerComponent);
