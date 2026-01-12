import { useState, useEffect, useCallback, useRef } from 'react';
import type { SatellitePosition, ConjunctionWarning, SatelliteInfo, DebrisObject, DebrisStatistics, DebrisType, DebrisSize } from '../types';

// Pre-compute satellite data once
function generateMockSatellites(count: number): SatelliteInfo[] {
  const satellites: SatelliteInfo[] = [];
  const names = [
    'ISS (ZARYA)', 'CSS (TIANHE)', 'STARLINK', 'ONEWEB', 'COSMOS', 
    'IRIDIUM', 'GLOBALSTAR', 'ORBCOMM', 'GOES', 'NOAA'
  ];
  
  for (let i = 0; i < count; i++) {
    const namePrefix = names[i % names.length];
    satellites.push({
      id: i,
      name: i < 10 ? namePrefix : `${namePrefix}-${i}`,
      intlDesignator: `${2020 + (i % 6)}-${String(i % 100).padStart(3, '0')}A`,
      inclination: 20 + Math.random() * 80,
      eccentricity: Math.random() * 0.1,
      meanMotion: 12 + Math.random() * 4,
      epoch: Date.now() / 1000 - Math.random() * 86400 * 7,
    });
  }
  return satellites;
}

// Reusable position array to avoid GC pressure
let positionsBuffer: SatellitePosition[] = [];

function generateMockPositions(satellites: SatelliteInfo[], time: number): SatellitePosition[] {
  const len = satellites.length;
  
  // Resize buffer if needed
  if (positionsBuffer.length !== len) {
    positionsBuffer = new Array(len);
    for (let i = 0; i < len; i++) {
      positionsBuffer[i] = {
        id: 0,
        name: '',
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        timestamp: 0,
      };
    }
  }
  
  const earthRadius = 6371;
  const twoPi = 2 * Math.PI;
  const now = Date.now() / 1000;
  
  for (let i = 0; i < len; i++) {
    const sat = satellites[i];
    const altitude = 400 + (i % 20) * 100;
    const r = earthRadius + altitude;
    
    const orbitalPeriod = 90 + (altitude / 100) * 5;
    const angularVelocity = twoPi / (orbitalPeriod * 60);
    const theta = angularVelocity * time + (i * twoPi) / len;
    
    const incl = sat.inclination * Math.PI / 180;
    const phi = incl * Math.sin(theta);
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);
    
    const pos = positionsBuffer[i];
    pos.id = sat.id;
    pos.name = sat.name;
    pos.position.x = r * cosTheta * cosPhi;
    pos.position.y = r * sinTheta * cosPhi;
    pos.position.z = r * sinPhi;
    pos.velocity.x = -7.5 * sinTheta;
    pos.velocity.y = 7.5 * cosTheta;
    pos.velocity.z = 0.5 * cosPhi;
    pos.timestamp = now;
  }
  
  return positionsBuffer;
}

function generateMockConjunctions(): ConjunctionWarning[] {
  return [
    {
      sat1Id: 0,
      sat1Name: 'ISS (ZARYA)',
      sat2Id: 5,
      sat2Name: 'COSMOS-1234',
      tca: Date.now() / 1000 + 3600 * 2,
      missDistance: 0.85,
      relativeVelocity: 12.3,
      collisionProbability: 0.00023,
    },
    {
      sat1Id: 2,
      sat1Name: 'STARLINK-1234',
      sat2Id: 8,
      sat2Name: 'ONEWEB-456',
      tca: Date.now() / 1000 + 3600 * 5,
      missDistance: 2.1,
      relativeVelocity: 8.7,
      collisionProbability: 0.00001,
    },
    {
      sat1Id: 15,
      sat1Name: 'IRIDIUM-789',
      sat2Id: 42,
      sat2Name: 'DEBRIS-9876',
      tca: Date.now() / 1000 + 3600 * 0.5,
      missDistance: 0.42,
      relativeVelocity: 14.2,
      collisionProbability: 0.0015,
    },
  ];
}

// Generate mock debris data
const DEBRIS_TYPES: DebrisType[] = ['rocket_body', 'payload_debris', 'fragmentation', 'mission_debris', 'unknown'];
const DEBRIS_SIZES: DebrisSize[] = ['large', 'medium', 'small'];
const DEBRIS_ORIGINS = ['COSMOS-954', 'FENGYUN-1C', 'IRIDIUM-33', 'COSMOS-2251', 'BREEZE-M', 'CZ-3B'];

function generateMockDebris(count: number, time: number): DebrisObject[] {
  const debris: DebrisObject[] = [];
  const earthRadius = 6371;
  const twoPi = 2 * Math.PI;
  
  for (let i = 0; i < count; i++) {
    // Orbital parameters
    const altitude = 300 + (i % 30) * 50 + Math.random() * 100;
    const r = earthRadius + altitude;
    const inclination = 40 + Math.random() * 60;
    
    // Position calculation
    const orbitalPeriod = 90 + (altitude / 100) * 5;
    const angularVelocity = twoPi / (orbitalPeriod * 60);
    const theta = angularVelocity * time + (i * twoPi) / count + Math.random() * 0.5;
    const incl = inclination * Math.PI / 180;
    const phi = incl * Math.sin(theta);
    
    const x = r * Math.cos(theta) * Math.cos(phi);
    const y = r * Math.sin(theta) * Math.cos(phi);
    const z = r * Math.sin(phi);
    
    const type = DEBRIS_TYPES[i % DEBRIS_TYPES.length];
    const size = DEBRIS_SIZES[Math.floor(i / 20) % DEBRIS_SIZES.length];
    
    debris.push({
      id: 10000 + i,
      name: `DEB ${DEBRIS_ORIGINS[i % DEBRIS_ORIGINS.length]}-${String(i).padStart(4, '0')}`,
      origin: DEBRIS_ORIGINS[i % DEBRIS_ORIGINS.length],
      type,
      size,
      position: { x, y, z },
      velocity: { x: -7 * Math.sin(theta), y: 7 * Math.cos(theta), z: 0.3 },
      altitudeKm: altitude,
      apogeeKm: altitude + Math.random() * 100,
      perigeeKm: altitude - Math.random() * 50,
      inclinationDeg: inclination,
      radarCrossSection: type === 'rocket_body' ? 5.0 : (size === 'large' ? 1.0 : 0.1),
      estimatedMassKg: type === 'rocket_body' ? 1000 : (size === 'large' ? 50 : 5),
      decayDays: altitude < 400 ? Math.floor(365 * (altitude / 200)) : -1,
      timestamp: Date.now() / 1000,
    });
  }
  
  return debris;
}

function calculateDebrisStatistics(debris: DebrisObject[]): DebrisStatistics {
  const stats: DebrisStatistics = {
    totalDebris: debris.length,
    rocketBodies: 0,
    payloadDebris: 0,
    fragments: 0,
    leoDebris: 0,
    meoDebris: 0,
    geoDebris: 0,
    averageAltitudeKm: 0,
    maxDensityAltitudeKm: 800,
  };
  
  let totalAlt = 0;
  const altBins: Record<number, number> = {};
  
  for (const d of debris) {
    if (d.type === 'rocket_body') stats.rocketBodies++;
    else if (d.type === 'payload_debris') stats.payloadDebris++;
    else stats.fragments++;
    
    if (d.altitudeKm < 2000) stats.leoDebris++;
    else if (d.altitudeKm < 35786) stats.meoDebris++;
    else stats.geoDebris++;
    
    totalAlt += d.altitudeKm;
    const bin = Math.floor(d.altitudeKm / 50) * 50;
    altBins[bin] = (altBins[bin] || 0) + 1;
  }
  
  if (debris.length > 0) {
    stats.averageAltitudeKm = totalAlt / debris.length;
    
    // Find max density altitude
    let maxCount = 0;
    for (const [alt, count] of Object.entries(altBins)) {
      if (count > maxCount) {
        maxCount = count;
        stats.maxDensityAltitudeKm = Number(alt) + 25;
      }
    }
  }
  
  return stats;
}

export function useSatellites() {
  const [satellites, setSatellites] = useState<SatelliteInfo[]>([]);
  const [positions, setPositions] = useState<SatellitePosition[]>([]);
  const [conjunctions, setConjunctions] = useState<ConjunctionWarning[]>([]);
  const [debris, setDebris] = useState<DebrisObject[]>([]);
  const [debrisStats, setDebrisStats] = useState<DebrisStatistics>({
    totalDebris: 0,
    rocketBodies: 0,
    payloadDebris: 0,
    fragments: 0,
    leoDebris: 0,
    meoDebris: 0,
    geoDebris: 0,
    averageAltitudeKm: 0,
    maxDensityAltitudeKm: 800,
  });
  const [loading, setLoading] = useState(true);
  const [time, setTime] = useState(0);
  const startTimeRef = useRef(Date.now());
  const satellitesRef = useRef<SatelliteInfo[]>([]);

  // Initialize with mock data - only once
  useEffect(() => {
    const mockSatellites = generateMockSatellites(100);
    satellitesRef.current = mockSatellites;
    setSatellites(mockSatellites);
    setPositions([...generateMockPositions(mockSatellites, 0)]);
    setConjunctions(generateMockConjunctions());
    
    // Generate debris
    const mockDebris = generateMockDebris(150, 0);
    setDebris(mockDebris);
    setDebrisStats(calculateDebrisStatistics(mockDebris));
    
    setLoading(false);
  }, []);

  // Update positions using setInterval instead of RAF (more efficient for throttled updates)
  useEffect(() => {
    if (satellitesRef.current.length === 0) return;
    
    const updateInterval = 2000; // 2 seconds
    
    const intervalId = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      setTime(Math.floor(elapsed));
      // Create new array reference to trigger React update
      setPositions([...generateMockPositions(satellitesRef.current, elapsed)]);
      
      // Update debris positions
      setDebris(generateMockDebris(150, elapsed));
    }, updateInterval);

    return () => clearInterval(intervalId);
  }, []);

  const refreshData = useCallback(async () => {
    setLoading(true);
    await new Promise(r => setTimeout(r, 500));
    setLoading(false);
  }, []);

  return {
    satellites,
    positions,
    conjunctions,
    debris,
    debrisStats,
    loading,
    refreshData,
    time,
  };
}
