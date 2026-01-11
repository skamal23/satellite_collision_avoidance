#pragma once

#include "types.hpp"
#include <vector>

namespace orbitops {

// Naive O(N^2) collision detection
// Returns all pairs within threshold_km distance
std::vector<Conjunction> detect_collisions_naive(
    const std::vector<Satellite>& satellites,
    double threshold_km,
    double time_minutes
);

} // namespace orbitops

