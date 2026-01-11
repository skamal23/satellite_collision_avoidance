#include "collision_optimized.hpp"
#include <cmath>
#include <algorithm>

#ifdef _OPENMP
#include <omp.h>
#endif

namespace orbitops {

SpatialGrid::SpatialGrid(double cell_size_km) 
    : cell_size(cell_size_km), inv_cell_size(1.0 / cell_size_km) {}

void SpatialGrid::build(const SatelliteSystem& sys) {
    grid.clear();
    grid.reserve(sys.count / 10);  // Estimate bucket count
    
    for (size_t i = 0; i < sys.count; ++i) {
        int64_t cx = pos_to_cell(sys.x[i]);
        int64_t cy = pos_to_cell(sys.y[i]);
        int64_t cz = pos_to_cell(sys.z[i]);
        uint64_t key = pack_cell(cx, cy, cz);
        grid[key].push_back(i);
    }
}

std::vector<Conjunction> SpatialGrid::find_conjunctions(
    const SatelliteSystem& sys,
    double threshold_km,
    double time_minutes
) {
    std::vector<Conjunction> conjunctions;
    double threshold_sq = threshold_km * threshold_km;
    
    // For each occupied cell
    for (const auto& [cell_key, indices] : grid) {
        // Check pairs within the same cell
        for (size_t a = 0; a < indices.size(); ++a) {
            size_t i = indices[a];
            double xi = sys.x[i], yi = sys.y[i], zi = sys.z[i];
            
            // Same cell pairs
            for (size_t b = a + 1; b < indices.size(); ++b) {
                size_t j = indices[b];
                double dx = xi - sys.x[j];
                double dy = yi - sys.y[j];
                double dz = zi - sys.z[j];
                double dist_sq = dx*dx + dy*dy + dz*dz;
                
                if (dist_sq < threshold_sq) {
                    conjunctions.push_back({
                        sys.catalog_numbers[i],
                        sys.catalog_numbers[j],
                        std::sqrt(dist_sq),
                        time_minutes
                    });
                }
            }
        }
    }
    
    // Check adjacent cells (26 neighbors)
    // We only check half the neighbors to avoid double-counting
    static const int64_t offsets[13][3] = {
        {1,0,0}, {0,1,0}, {0,0,1},
        {1,1,0}, {1,-1,0}, {1,0,1}, {1,0,-1},
        {0,1,1}, {0,1,-1},
        {1,1,1}, {1,1,-1}, {1,-1,1}, {1,-1,-1}
    };
    
    for (const auto& [cell_key, indices] : grid) {
        // Unpack cell coordinates (reverse of pack)
        int64_t cx = static_cast<int64_t>((cell_key >> 42) & 0x1FFFFF) - (1 << 20);
        int64_t cy = static_cast<int64_t>((cell_key >> 21) & 0x1FFFFF) - (1 << 20);
        int64_t cz = static_cast<int64_t>(cell_key & 0x1FFFFF) - (1 << 20);
        
        for (const auto& off : offsets) {
            uint64_t neighbor_key = pack_cell(cx + off[0], cy + off[1], cz + off[2]);
            auto it = grid.find(neighbor_key);
            if (it == grid.end()) continue;
            
            const auto& neighbor_indices = it->second;
            
            for (size_t i : indices) {
                double xi = sys.x[i], yi = sys.y[i], zi = sys.z[i];
                
                for (size_t j : neighbor_indices) {
                    double dx = xi - sys.x[j];
                    double dy = yi - sys.y[j];
                    double dz = zi - sys.z[j];
                    double dist_sq = dx*dx + dy*dy + dz*dz;
                    
                    if (dist_sq < threshold_sq) {
                        conjunctions.push_back({
                            sys.catalog_numbers[i],
                            sys.catalog_numbers[j],
                            std::sqrt(dist_sq),
                            time_minutes
                        });
                    }
                }
            }
        }
    }
    
    return conjunctions;
}

std::vector<Conjunction> detect_collisions_optimized(
    const SatelliteSystem& sys,
    double threshold_km,
    double time_minutes
) {
    // Cell size should be >= threshold to catch all pairs
    SpatialGrid grid(std::max(threshold_km, 50.0));
    grid.build(sys);
    return grid.find_conjunctions(sys, threshold_km, time_minutes);
}

} // namespace orbitops

