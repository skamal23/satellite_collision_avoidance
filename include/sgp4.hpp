#pragma once

#include "types.hpp"
#include <vector>

namespace orbitops {

// SGP4 propagator - propagates satellite position to given time
// time_minutes: minutes since TLE epoch
void sgp4_propagate(const TLE& tle, double time_minutes, Vec3& position, Vec3& velocity);

// Propagate all satellites to a given time
void propagate_all(std::vector<Satellite>& satellites, double time_minutes);

} // namespace orbitops

