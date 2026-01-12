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

// Phase 6.1: Enhanced conjunction with probability details
export interface ConjunctionWarning {
  sat1Id: number;
  sat1Name: string;
  sat2Id: number;
  sat2Name: string;
  tca: number;
  missDistance: number;
  relativeVelocity: number;
  collisionProbability: number;
  // Monte Carlo results (Phase 6.1)
  monteCarloSamples?: number;
  minMissDistance?: number;
  maxMissDistance?: number;
  meanMissDistance?: number;
  stdMissDistance?: number;
  combinedRadius?: number;
}

export interface SatelliteInfo {
  id: number;
  name: string;
  intlDesignator: string;
  inclination: number;
  eccentricity: number;
  meanMotion: number;
  epoch: number;
  isDebris?: boolean;  // Phase 6.5
  tleAgeHours?: number;
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

// Phase 6.3: Maneuver optimization
export interface SpacecraftParams {
  massKg: number;
  ispS: number;
  maxThrustN: number;
  fuelMassKg: number;
}

export interface ManeuverAlternative {
  deltaV: Vec3;
  burnTime: number;
  newMissDistance: number;
  fuelCostKg: number;
  description: string;
}

export interface ManeuverResult {
  success: boolean;
  message: string;
  predictedPath: SatellitePosition[];
  newMissDistance: number;
  totalDeltaV: number;
  fuelCostKg: number;
  alternatives: ManeuverAlternative[];
}

// Phase 6.2: Historical replay
export interface PositionSnapshot {
  timestamp: number;
  satelliteIds: number[];
  positionsX: number[];
  positionsY: number[];
  positionsZ: number[];
}

export interface HistoryState {
  isRecording: boolean;
  isPlaying: boolean;
  currentTime: number;
  startTime: number;
  endTime: number;
  playbackSpeed: number;
  snapshots: PositionSnapshot[];
}

// Phase 6.4: TLE updates
export interface TLESource {
  name: string;
  url: string;
  refreshIntervalMinutes: number;
  enabled: boolean;
  lastUpdate?: number;
  satelliteCount?: number;
}

export interface TLEUpdateResult {
  sourceName: string;
  success: boolean;
  errorMessage?: string;
  satellitesUpdated: number;
  fetchTime: number;
}

// Phase 6.5: Space debris
export type DebrisType = 'rocket_body' | 'payload_debris' | 'mission_debris' | 'fragmentation' | 'unknown';
export type DebrisSize = 'large' | 'medium' | 'small';
export type DebrisRisk = 'critical' | 'high' | 'medium' | 'low' | 'negligible';

export interface DebrisObject {
  id: number;
  name: string;
  origin: string;
  type: DebrisType;
  size: DebrisSize;
  position: Vec3;
  velocity: Vec3;
  altitudeKm: number;
  apogeeKm: number;
  perigeeKm: number;
  inclinationDeg: number;
  radarCrossSection: number;
  estimatedMassKg: number;
  decayDays: number;
  timestamp: number;
}

export interface DebrisField {
  eventId: number;
  eventName: string;
  debrisIds: number[];
  totalFragments: number;
  spreadRadiusKm: number;
}

export interface DebrisStatistics {
  totalDebris: number;
  rocketBodies: number;
  payloadDebris: number;
  fragments: number;
  leoDebris: number;
  meoDebris: number;
  geoDebris: number;
  averageAltitudeKm: number;
  maxDensityAltitudeKm: number;
}

export interface DebrisRiskAssessment {
  satelliteId: number;
  overallRisk: DebrisRisk;
  nearbyDebrisCount: number;
  closestDebris: Array<{ debrisId: number; distance: number }>;
  estimatedFlux: number;
}

export interface DebrisFilterState {
  showDebris: boolean;
  showRocketBodies: boolean;
  showFragments: boolean;
  minAltitudeKm: number;
  maxAltitudeKm: number;
  showDebrisFields: boolean;
}
