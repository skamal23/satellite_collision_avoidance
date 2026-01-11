# CLAUDE.md - Orbit-Ops: Satellite Collision Avoidance System

## Project Overview

A high-performance satellite collision avoidance system that propagates orbits using SGP4, detects conjunctions via spatial hashing, and visualizes results in real-time using CesiumJS. The system emphasizes HPC techniques: SoA memory layout, SIMD vectorization, cache optimization, and multi-threading.

---

## Git Workflow

**CRITICAL**: Commit and push after every single change. Use one-line, one-sentence commit messages.

Examples:
- `Add CMakeLists.txt with basic project structure`
- `Implement TLE parser`
- `Add SoA satellite data structure`
- `Fix cache alignment for position arrays`

Never batch multiple logical changes into one commit. Push immediately after each commit.

---

## Data Sources

### Primary Sources

| Source | URL | Description |
|--------|-----|-------------|
| **CelesTrak** | https://celestrak.org/NORAD/elements/ | Free TLE data, no registration required. GP data in TLE/3LE/CSV/JSON/XML formats |
| **Space-Track** | https://www.space-track.org | Official USSPACECOM data, requires free registration. Most authoritative source |
| **CelesTrak Supplemental** | https://celestrak.org/NORAD/elements/supplemental/ | Additional objects not in Space-Track |

### Recommended TLE Datasets to Download

1. `stations.txt` - ISS and space stations (small, good for testing)
2. `starlink.txt` - SpaceX Starlink constellation (~6000 satellites)
3. `active.txt` - All active satellites (~8000+)
4. `tle-new.txt` - Recently launched objects

### Data Refresh Strategy

- TLEs degrade in accuracy over time (hours to days)
- Plan for periodic refresh mechanism (every 12-24 hours)
- Store historical TLEs for validation testing

---

## Phase 1: Foundation & Baseline Implementation

### Objective
Establish project structure, parse TLE data, and create a naive (slow) implementation as the control group for benchmarking.

### 1.1 Project Setup

- Initialize CMake project with C++20 standard
- Set up directory structure: `src/`, `include/`, `proto/`, `frontend/`, `tests/`, `benchmarks/`
- Configure compiler flags for optimization levels (-O0 for debug, -O3 -march=native for release)
- Add dependency management (vcpkg or Conan)
- Set up Google Test for unit testing
- Set up Google Benchmark for performance testing

### 1.2 TLE Parser

- Parse Two-Line Element format from text files
- Extract orbital elements: inclination, RAAN, eccentricity, argument of perigee, mean anomaly, mean motion
- Handle epoch time conversion (TLE uses fractional Julian dates)
- Validate checksum on TLE lines

### 1.3 Baseline SGP4 Implementation

- Use libsgp4 or implement from AIAA/Vallado reference
- Object-Oriented approach: `class Satellite` with position, velocity, TLE data
- Store as `std::vector<Satellite>` (Array of Structures)
- Sequential propagation loop
- Validate against reference data from CelesTrak (known satellite positions)

### 1.4 Baseline Collision Detection

- Naive O(N²) double nested loop
- For each pair, compute Euclidean distance
- Flag pairs within threshold (default 1km)
- Record: time of closest approach (TCA), miss distance, relative velocity

### 1.5 Benchmarking Harness

- Time propagation per satellite
- Time collision detection for N satellites
- Record memory usage
- Establish baseline metrics to beat

---

## Phase 2: High-Performance Computing Optimizations

### Objective
Transform the baseline into a cache-optimized, vectorized, multi-threaded engine.

### 2.1 Data Structure Transformation: AoS → SoA

**Before (AoS):**
```
struct Satellite { double x, y, z, vx, vy, vz; int id; char name[32]; }
vector<Satellite> satellites;
```

**After (SoA):**
```
struct SatelliteSystem {
    alignas(64) double* x;
    alignas(64) double* y;
    alignas(64) double* z;
    alignas(64) double* vx;
    alignas(64) double* vy;
    alignas(64) double* vz;
    // Metadata stored separately
}
```

- Align all arrays to 64-byte cache line boundaries
- Use aligned_alloc or posix_memalign
- Separate hot data (positions) from cold data (names, IDs)
- Measure cache miss reduction with `perf stat`

### 2.2 Multi-Threading with OpenMP

- Parallelize propagation loop with `#pragma omp parallel for`
- Use thread-local accumulators to avoid false sharing
- Set appropriate chunk sizes for load balancing
- Consider NUMA awareness for multi-socket systems
- Benchmark with varying thread counts (1, 2, 4, 8, 16)

### 2.3 SIMD Vectorization

- Use AVX2 intrinsics for distance calculations
- Load 4 doubles (256-bit) or 8 doubles (512-bit AVX-512) per instruction
- Vectorize the inner loop of collision detection
- Key intrinsics: `_mm256_load_pd`, `_mm256_sub_pd`, `_mm256_mul_pd`, `_mm256_cmp_pd`
- Verify vectorization with compiler reports (-fopt-info-vec)

### 2.4 Spatial Hashing Grid

**Algorithm:**
1. Define grid cell size (10km × 10km × 10km typical for LEO)
2. Hash satellite position to grid cell: `cell = floor(pos / cell_size)`
3. Insert satellite ID into bucket for that cell
4. For collision detection, only check satellites in same cell + 26 adjacent cells

**Implementation Details:**
- Use `unordered_map<uint64_t, vector<int>>` for sparse grid
- Pack (cx, cy, cz) into 64-bit key using bit shifting
- Rebuild grid each timestep (satellites move)
- Complexity drops from O(N²) to approximately O(N × k) where k is average satellites per cell

### 2.5 Additional Micro-Optimizations

- Prefetching: `__builtin_prefetch` for upcoming array elements
- Branch prediction hints: `[[likely]]` and `[[unlikely]]`
- Reduce floating-point divisions (multiply by reciprocal)
- Use `float` instead of `double` where precision allows (2x SIMD throughput)

---

## Phase 3: Physics Accuracy & Validation

### Objective
Ensure the optimized code produces physically correct results.

### 3.1 SGP4 Validation

- Compare output against NASA/NORAD reference implementation
- Test against known satellite passes (ISS visibility predictions)
- Verify orbital period, apogee, perigee match expected values
- Test edge cases: high eccentricity, polar orbits, GEO

### 3.2 Numerical Stability

- Test for accumulating floating-point errors over long propagation periods
- Compare single vs double precision results
- Validate time handling (Julian dates, leap seconds)

### 3.3 Unit Tests

- Test TLE parser with malformed input
- Test grid hashing boundary conditions
- Test SIMD code paths against scalar reference
- Fuzz testing with random TLE values

---

## Phase 4: gRPC Backend Service

### Objective
Expose the C++ engine as a streaming gRPC service.

### 4.1 Protocol Buffer Definitions

Define messages for:
- `SatellitePosition`: id, x, y, z, timestamp
- `ConjunctionWarning`: sat1_id, sat2_id, tca, miss_distance, relative_velocity, collision_probability
- `ManeuverRequest`: sat_id, delta_v (x, y, z), burn_time
- `OrbitPath`: satellite_id, list of positions (for rendering full orbit)

### 4.2 Service Endpoints

- `StreamPositions(TimeRange)`: Server-streaming RPC returning position updates
- `StreamConjunctions(ScreeningParams)`: Server-streaming RPC for conjunction warnings
- `SimulateManeuver(ManeuverRequest)`: Unary RPC returning new orbit prediction
- `GetActiveSatellites()`: Unary RPC returning satellite catalog

### 4.3 Threading Model

- Separate thread pool for propagation work
- gRPC async server for non-blocking I/O
- Producer-consumer queue for streaming results
- Backpressure handling for slow clients

### 4.4 Performance Considerations

- Batch position updates (send every 100ms, not every satellite)
- Binary protobuf encoding (smaller than JSON)
- Connection pooling
- Compression for large responses

---

## Phase 5: React + CesiumJS Frontend

### Objective
Build an interactive 3D visualization of Earth, satellites, and conjunction events.

### 5.1 Project Setup

- Create React app with TypeScript
- Install CesiumJS or Resium (React wrapper)
- Configure Cesium ion access token
- Set up gRPC-Web client

### 5.2 Core Visualization

- Render Earth with terrain and imagery layers
- Render satellite positions as point primitives
- Render orbital paths as polylines (CZML or direct primitives)
- Color-code satellites by type/constellation
- Add satellite labels on hover

### 5.3 Conjunction Visualization

- Highlight conjunction pairs in red/orange
- Draw line between approaching satellites
- Display time-to-closest-approach countdown
- Show miss distance in real-time
- Animate the predicted collision point

### 5.4 Maneuver Simulation UI

- Click satellite to select
- Input Delta-V vector (magnitude + direction)
- Input burn time
- Send maneuver request to backend
- Display "what-if" trajectory in different color
- Show updated miss distance after maneuver

### 5.5 Performance Optimization

- Use Web Workers for protobuf decoding
- Limit rendered satellites at far zoom levels
- Use instanced rendering for satellite points
- Throttle UI updates to 30fps
- Implement level-of-detail for orbit paths

---

## Phase 6: Advanced Features (Portfolio Differentiators)

### Objective
Add features that make this project stand out.

### 6.1 Collision Probability Calculation

- Implement Monte Carlo simulation for probability estimation
- Account for TLE uncertainty (covariance data from Space-Track)
- Display probability as percentage on conjunction warnings

### 6.2 Historical Replay

- Store propagated positions in time-series database
- Allow user to "scrub" through time
- Replay past conjunction events

### 6.3 Maneuver Optimization

- Given conjunction, compute minimum Delta-V to achieve safe miss distance
- Hohmann transfer calculations
- Fuel cost estimation

### 6.4 Real-Time TLE Updates

- Periodic fetch from CelesTrak API
- Websocket notifications for new launches
- Auto-refresh visualization

### 6.5 Space Debris Modeling

- Include tracked debris objects
- Model debris clouds from known fragmentation events
- Flux density calculations

---

## Phase 7: Performance Dashboard & Documentation

### Objective
Quantify and demonstrate optimization impact.

### 7.1 In-App Performance Metrics

- Real-time FPS counter
- Propagation time per frame
- Number of satellites rendered
- Conjunctions detected per second

### 7.2 Benchmark Report

Generate charts for:
- **Scalability**: N satellites vs. propagation time (show O(N) vs O(N²))
- **Cache Analysis**: L1/L2 miss rates before/after SoA
- **SIMD Speedup**: Scalar vs. AVX2 vs. AVX-512
- **Thread Scaling**: 1 thread vs. N threads speedup curve
- **Roofline Model**: FLOPS vs. arithmetic intensity

### 7.3 Documentation

- Architecture diagram (system components)
- Data flow diagram (TLE → propagation → collision → visualization)
- API documentation for gRPC endpoints
- README with setup instructions

---

## Additional Dimensions to Explore

### Machine Learning Integration
- Train model to predict conjunction probability from TLE features
- Anomaly detection for unexpected orbital changes

### Starlink/Constellation Analysis
- Specialized views for mega-constellations
- Inter-satellite link visualization

### Ground Station Coverage
- Visualize when satellites are in view of ground stations
- Compute communication windows

### Launch Window Analysis
- Given new launch, predict conjunctions with existing satellites
- Avoid times when debris field is dense

### Integration with External APIs
- N2YO API for additional satellite tracking
- OpenWeather for atmospheric density (affects drag)

---

## Technology Stack Summary

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Language | C++20 | Performance, concepts, ranges |
| Build | CMake | Industry standard |
| Threading | OpenMP | Directive-based, easy |
| SIMD | AVX2/AVX-512 | CPU vectorization |
| Networking | gRPC + Protobuf | Binary serialization, streaming |
| Frontend | React + TypeScript | Modern web stack |
| Visualization | CesiumJS | Geospatial standard |
| Testing | Google Test + Benchmark | Correctness + performance |
| Profiling | perf, VTune | Cache analysis, hotspots |

---

## Development Timeline (Suggested)

| Week | Focus | Deliverables |
|------|-------|--------------|
| 1 | Foundation | CMake setup, TLE parser, baseline propagator |
| 2 | HPC Core | SoA refactor, spatial grid, OpenMP threading |
| 3 | SIMD + Validation | AVX intrinsics, benchmark suite, unit tests |
| 4 | gRPC Backend | Proto definitions, server implementation |
| 5 | Frontend Core | React + Cesium setup, basic visualization |
| 6 | Integration | End-to-end streaming, maneuver UI |
| 7 | Polish | Performance dashboard, documentation |
| 8 | Advanced Features | Probability calc, historical replay |

---

## Key Success Metrics

1. **Correctness**: Propagated positions match NORAD reference within 1km
2. **Performance**: 20,000 satellites propagated + collision-checked in <100ms
3. **Scalability**: Linear time complexity demonstrated
4. **Cache Efficiency**: >80% reduction in L2 cache misses vs baseline
5. **SIMD Utilization**: >4x speedup from vectorization
6. **Thread Scaling**: >6x speedup on 8-core machine

---

## Notes for AI Assistant

When implementing this project:

1. **Commit after every logical change** - one line message
2. **Push immediately after each commit**
3. **Test before committing** when possible
4. **Profile regularly** to verify optimization impact
5. **Document performance gains** inline in code comments
6. **Keep baseline code** in a separate branch for comparison

