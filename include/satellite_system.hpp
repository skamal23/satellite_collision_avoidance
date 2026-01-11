#pragma once

#include "types.hpp"
#include <vector>
#include <cstdlib>
#include <cstring>

namespace orbitops {

// Structure of Arrays (SoA) for cache-efficient satellite data
// All position/velocity arrays are contiguous for SIMD and cache optimization
struct SatelliteSystem {
    size_t count = 0;
    
    // Hot data - accessed every frame (cache-line aligned)
    alignas(64) double* x = nullptr;
    alignas(64) double* y = nullptr;
    alignas(64) double* z = nullptr;
    alignas(64) double* vx = nullptr;
    alignas(64) double* vy = nullptr;
    alignas(64) double* vz = nullptr;
    
    // TLE orbital elements (needed for propagation)
    alignas(64) double* incl = nullptr;      // radians
    alignas(64) double* raan0 = nullptr;     // radians
    alignas(64) double* ecc = nullptr;
    alignas(64) double* argp0 = nullptr;     // radians
    alignas(64) double* M0 = nullptr;        // radians
    alignas(64) double* n0 = nullptr;        // rad/min
    alignas(64) double* a0 = nullptr;        // km (semi-major axis)
    alignas(64) double* bstar = nullptr;
    
    // Cold data - rarely accessed
    std::vector<int> catalog_numbers;
    std::vector<std::string> names;

    SatelliteSystem() = default;
    ~SatelliteSystem() { deallocate(); }
    
    // No copy (move only)
    SatelliteSystem(const SatelliteSystem&) = delete;
    SatelliteSystem& operator=(const SatelliteSystem&) = delete;
    SatelliteSystem(SatelliteSystem&& other) noexcept { *this = std::move(other); }
    SatelliteSystem& operator=(SatelliteSystem&& other) noexcept {
        if (this != &other) {
            deallocate();
            count = other.count;
            x = other.x; y = other.y; z = other.z;
            vx = other.vx; vy = other.vy; vz = other.vz;
            incl = other.incl; raan0 = other.raan0; ecc = other.ecc;
            argp0 = other.argp0; M0 = other.M0; n0 = other.n0;
            a0 = other.a0; bstar = other.bstar;
            catalog_numbers = std::move(other.catalog_numbers);
            names = std::move(other.names);
            other.count = 0;
            other.x = other.y = other.z = nullptr;
            other.vx = other.vy = other.vz = nullptr;
            other.incl = other.raan0 = other.ecc = nullptr;
            other.argp0 = other.M0 = other.n0 = nullptr;
            other.a0 = other.bstar = nullptr;
        }
        return *this;
    }

    void allocate(size_t n) {
        deallocate();
        count = n;
        // Aligned allocation for SIMD
        x = static_cast<double*>(std::aligned_alloc(64, n * sizeof(double)));
        y = static_cast<double*>(std::aligned_alloc(64, n * sizeof(double)));
        z = static_cast<double*>(std::aligned_alloc(64, n * sizeof(double)));
        vx = static_cast<double*>(std::aligned_alloc(64, n * sizeof(double)));
        vy = static_cast<double*>(std::aligned_alloc(64, n * sizeof(double)));
        vz = static_cast<double*>(std::aligned_alloc(64, n * sizeof(double)));
        incl = static_cast<double*>(std::aligned_alloc(64, n * sizeof(double)));
        raan0 = static_cast<double*>(std::aligned_alloc(64, n * sizeof(double)));
        ecc = static_cast<double*>(std::aligned_alloc(64, n * sizeof(double)));
        argp0 = static_cast<double*>(std::aligned_alloc(64, n * sizeof(double)));
        M0 = static_cast<double*>(std::aligned_alloc(64, n * sizeof(double)));
        n0 = static_cast<double*>(std::aligned_alloc(64, n * sizeof(double)));
        a0 = static_cast<double*>(std::aligned_alloc(64, n * sizeof(double)));
        bstar = static_cast<double*>(std::aligned_alloc(64, n * sizeof(double)));
        catalog_numbers.resize(n);
        names.resize(n);
        
        // Zero initialize
        std::memset(x, 0, n * sizeof(double));
        std::memset(y, 0, n * sizeof(double));
        std::memset(z, 0, n * sizeof(double));
        std::memset(vx, 0, n * sizeof(double));
        std::memset(vy, 0, n * sizeof(double));
        std::memset(vz, 0, n * sizeof(double));
    }

    void deallocate() {
        if (x) { std::free(x); x = nullptr; }
        if (y) { std::free(y); y = nullptr; }
        if (z) { std::free(z); z = nullptr; }
        if (vx) { std::free(vx); vx = nullptr; }
        if (vy) { std::free(vy); vy = nullptr; }
        if (vz) { std::free(vz); vz = nullptr; }
        if (incl) { std::free(incl); incl = nullptr; }
        if (raan0) { std::free(raan0); raan0 = nullptr; }
        if (ecc) { std::free(ecc); ecc = nullptr; }
        if (argp0) { std::free(argp0); argp0 = nullptr; }
        if (M0) { std::free(M0); M0 = nullptr; }
        if (n0) { std::free(n0); n0 = nullptr; }
        if (a0) { std::free(a0); a0 = nullptr; }
        if (bstar) { std::free(bstar); bstar = nullptr; }
        catalog_numbers.clear();
        names.clear();
        count = 0;
    }
};

// Convert from AoS (vector<TLE>) to SoA
SatelliteSystem create_satellite_system(const std::vector<TLE>& tles);

} // namespace orbitops

