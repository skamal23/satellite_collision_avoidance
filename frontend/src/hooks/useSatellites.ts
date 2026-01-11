import { useState, useEffect, useCallback, useRef } from 'react';
import type { SatellitePosition, ConjunctionWarning, SatelliteInfo } from '../types';

// Mock data for development - will be replaced with gRPC calls
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

function generateMockPositions(satellites: SatelliteInfo[], time: number): SatellitePosition[] {
  return satellites.map((sat, i) => {
    const earthRadius = 6371;
    const altitude = 400 + (i % 20) * 100; // Deterministic altitudes for stability
    const r = earthRadius + altitude;
    
    // Orbital motion - each satellite has different speed based on altitude
    const orbitalPeriod = 90 + (altitude / 100) * 5; // minutes
    const angularVelocity = (2 * Math.PI) / (orbitalPeriod * 60); // rad/s
    const theta = angularVelocity * time + (i * 2 * Math.PI) / satellites.length;
    
    // Inclination affects the z-component
    const incl = sat.inclination * Math.PI / 180;
    const phi = incl * Math.sin(theta);
    
    return {
      id: sat.id,
      name: sat.name,
      position: {
        x: r * Math.cos(theta) * Math.cos(phi),
        y: r * Math.sin(theta) * Math.cos(phi),
        z: r * Math.sin(phi),
      },
      velocity: {
        x: -7.5 * Math.sin(theta),
        y: 7.5 * Math.cos(theta),
        z: 0.5 * Math.cos(phi),
      },
      timestamp: Date.now() / 1000,
    };
  });
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

export function useSatellites() {
  const [satellites, setSatellites] = useState<SatelliteInfo[]>([]);
  const [positions, setPositions] = useState<SatellitePosition[]>([]);
  const [conjunctions, setConjunctions] = useState<ConjunctionWarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [time, setTime] = useState(0);
  const startTimeRef = useRef(Date.now());

  // Initialize with mock data
  useEffect(() => {
    const mockSatellites = generateMockSatellites(100); // Reduced from 150 for performance
    setSatellites(mockSatellites);
    setPositions(generateMockPositions(mockSatellites, 0));
    setConjunctions(generateMockConjunctions());
    setLoading(false);
  }, []);

  // Update positions over time (simulation) - throttled for performance
  useEffect(() => {
    if (satellites.length === 0) return;
    
    let animationId: number;
    let lastUpdate = 0;
    const updateInterval = 2000; // Update every 2 seconds instead of every frame
    
    const update = (timestamp: number) => {
      if (timestamp - lastUpdate >= updateInterval) {
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        setTime(Math.floor(elapsed));
        setPositions(generateMockPositions(satellites, elapsed));
        lastUpdate = timestamp;
      }
      animationId = requestAnimationFrame(update);
    };
    
    animationId = requestAnimationFrame(update);

    return () => cancelAnimationFrame(animationId);
  }, [satellites]);

  const refreshData = useCallback(async () => {
    setLoading(true);
    // TODO: Fetch from gRPC backend
    await new Promise(r => setTimeout(r, 500));
    setLoading(false);
  }, []);

  return {
    satellites,
    positions,
    conjunctions,
    loading,
    refreshData,
    time,
  };
}
