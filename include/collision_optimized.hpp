#pragma once

#include "satellite_system.hpp"
#include "types.hpp"
#include <vector>
#include <unordered_map>

namespace orbitops {

// Spatial hash grid for O(N) collision detection
class SpatialGrid {
public:
    explicit SpatialGrid(double cell_size_km = 50.0);
    
    // Clear and rebuild grid from satellite positions
    void build(const SatelliteSystem& sys);
    
    // Find all conjunctions within threshold
    std::vector<Conjunction> find_conjunctions(
        const SatelliteSystem& sys,
        double threshold_km,
        double time_minutes
    );

private:
    double cell_size;
    double inv_cell_size;  // 1/cell_size for faster division
    
    // Hash map: cell_id -> list of satellite indices
    std::unordered_map<uint64_t, std::vector<size_t>> grid;
    
    // Convert position to cell coordinates
    inline int64_t pos_to_cell(double pos) const {
        return static_cast<int64_t>(std::floor(pos * inv_cell_size));
    }
    
    // Pack cell coordinates into 64-bit key
    inline uint64_t pack_cell(int64_t cx, int64_t cy, int64_t cz) const {
        // Use 21 bits per coordinate (signed, so offset by 2^20)
        uint64_t ux = static_cast<uint64_t>(cx + (1 << 20)) & 0x1FFFFF;
        uint64_t uy = static_cast<uint64_t>(cy + (1 << 20)) & 0x1FFFFF;
        uint64_t uz = static_cast<uint64_t>(cz + (1 << 20)) & 0x1FFFFF;
        return (ux << 42) | (uy << 21) | uz;
    }
};

// Optimized collision detection using spatial grid
std::vector<Conjunction> detect_collisions_optimized(
    const SatelliteSystem& sys,
    double threshold_km,
    double time_minutes
);

} // namespace orbitops

