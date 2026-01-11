export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SatellitePosition {
  id: number;
  name: string;
  position: Vec3;
  velocity: Vec3;
  timestamp: number;
}

export interface ConjunctionWarning {
  sat1Id: number;
  sat1Name: string;
  sat2Id: number;
  sat2Name: string;
  tca: number;
  missDistance: number;
  relativeVelocity: number;
  collisionProbability: number;
}

export interface SatelliteInfo {
  id: number;
  name: string;
  intlDesignator: string;
  inclination: number;
  eccentricity: number;
  meanMotion: number;
  epoch: number;
}

export interface FilterState {
  searchQuery: string;
  showOrbits: boolean;
  showLabels: boolean;
  minInclination: number;
  maxInclination: number;
  showConjunctions: boolean;
  conjunctionThreshold: number;
  selectedSatelliteId: number | null;
  orbitType: 'all' | 'leo' | 'meo' | 'geo';
}

export type Theme = 'light' | 'dark';


