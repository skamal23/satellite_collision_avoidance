#pragma once

#include "types.hpp"
#include <vector>
#include <string>

namespace orbitops {

// Parse TLE file and return vector of TLE records
std::vector<TLE> parse_tle_file(const std::string& filepath);

// Parse a single TLE from three lines (name, line1, line2)
TLE parse_tle(const std::string& name, const std::string& line1, const std::string& line2);

} // namespace orbitops

