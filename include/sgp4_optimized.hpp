#pragma once

#include "satellite_system.hpp"

namespace orbitops {

// Optimized SGP4 propagator using SoA layout and OpenMP
// Propagates all satellites in parallel
void propagate_all_optimized(SatelliteSystem& sys, double time_minutes);

} // namespace orbitops

