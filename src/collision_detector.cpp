#include "collision_detector.hpp"

namespace orbitops {

std::vector<Conjunction> detect_collisions_naive(
    const std::vector<Satellite>& satellites,
    double threshold_km,
    double time_minutes
) {
    std::vector<Conjunction> conjunctions;
    const size_t n = satellites.size();
    
    // O(N^2) double loop - check every pair
    for (size_t i = 0; i < n; ++i) {
        for (size_t j = i + 1; j < n; ++j) {
            Vec3 diff = satellites[i].position - satellites[j].position;
            double distance = diff.magnitude();
            
            if (distance < threshold_km) {
                conjunctions.push_back({
                    satellites[i].tle.catalog_number,
                    satellites[j].tle.catalog_number,
                    distance,
                    time_minutes
                });
            }
        }
    }
    
    return conjunctions;
}

} // namespace orbitops

