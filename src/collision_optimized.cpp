#include "collision_optimized.hpp"
#include "simd_utils.hpp"
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
    grid.reserve(sys.count / 8);
    
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
    const double threshold_sq = threshold_km * threshold_km;
    
    // Collect all cell keys for parallel iteration
    std::vector<uint64_t> cell_keys;
    cell_keys.reserve(grid.size());
    for (const auto& [key, _] : grid) {
        cell_keys.push_back(key);
    }

    // Adjacent cell offsets (13 to avoid double-counting)
    static const int64_t offsets[13][3] = {
        {1,0,0}, {0,1,0}, {0,0,1},
        {1,1,0}, {1,-1,0}, {1,0,1}, {1,0,-1},
        {0,1,1}, {0,1,-1},
        {1,1,1}, {1,1,-1}, {1,-1,1}, {1,-1,-1}
    };

    // Thread-local conjunction storage for parallel collection
    #ifdef _OPENMP
    std::vector<std::vector<Conjunction>> thread_conjunctions(omp_get_max_threads());
    #endif

    #pragma omp parallel
    {
        #ifdef _OPENMP
        auto& local_conj = thread_conjunctions[omp_get_thread_num()];
        #else
        auto& local_conj = conjunctions;
        #endif

        #pragma omp for schedule(dynamic, 16) nowait
        for (size_t cell_idx = 0; cell_idx < cell_keys.size(); ++cell_idx) {
            uint64_t cell_key = cell_keys[cell_idx];
            const auto& indices = grid.at(cell_key);
            
            // Unpack cell coordinates
            int64_t cx = static_cast<int64_t>((cell_key >> 42) & 0x1FFFFF) - (1 << 20);
            int64_t cy = static_cast<int64_t>((cell_key >> 21) & 0x1FFFFF) - (1 << 20);
            int64_t cz = static_cast<int64_t>(cell_key & 0x1FFFFF) - (1 << 20);

            // Check pairs within same cell
            for (size_t a = 0; a < indices.size(); ++a) {
                size_t i = indices[a];
                double xi = sys.x[i], yi = sys.y[i], zi = sys.z[i];
                
                // Prefetch next satellite data
                if (a + 1 < indices.size()) {
                    __builtin_prefetch(&sys.x[indices[a + 1]], 0, 3);
                    __builtin_prefetch(&sys.y[indices[a + 1]], 0, 3);
                    __builtin_prefetch(&sys.z[indices[a + 1]], 0, 3);
                }
                
                for (size_t b = a + 1; b < indices.size(); ++b) {
                    size_t j = indices[b];
                    double dist_sq = simd::distance_squared(xi, yi, zi, 
                                                            sys.x[j], sys.y[j], sys.z[j]);
                    
                    if (dist_sq < threshold_sq) [[unlikely]] {
                        local_conj.push_back({
                            sys.catalog_numbers[i],
                            sys.catalog_numbers[j],
                            std::sqrt(dist_sq),
                            time_minutes
                        });
                    }
                }
            }

            // Check adjacent cells
            for (const auto& off : offsets) {
                uint64_t neighbor_key = pack_cell(cx + off[0], cy + off[1], cz + off[2]);
                auto it = grid.find(neighbor_key);
                if (it == grid.end()) [[likely]] continue;
                
                const auto& neighbor_indices = it->second;
                
                for (size_t i : indices) {
                    double xi = sys.x[i], yi = sys.y[i], zi = sys.z[i];
                    
                    for (size_t j : neighbor_indices) {
                        double dist_sq = simd::distance_squared(xi, yi, zi,
                                                                sys.x[j], sys.y[j], sys.z[j]);
                        
                        if (dist_sq < threshold_sq) [[unlikely]] {
                            local_conj.push_back({
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
    }

    // Merge thread-local results
    #ifdef _OPENMP
    for (auto& tc : thread_conjunctions) {
        conjunctions.insert(conjunctions.end(), tc.begin(), tc.end());
    }
    #endif
    
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
