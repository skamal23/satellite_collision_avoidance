#include "satellite_system.hpp"
#include <cmath>

namespace orbitops {

namespace {
    constexpr double DEG2RAD = M_PI / 180.0;
    constexpr double TWOPI = 2.0 * M_PI;
    constexpr double MIN_PER_DAY = 1440.0;
    constexpr double MU = 398600.4418;  // km^3/s^2
}

SatelliteSystem create_satellite_system(const std::vector<TLE>& tles) {
    SatelliteSystem sys;
    sys.allocate(tles.size());
    
    for (size_t i = 0; i < tles.size(); ++i) {
        const TLE& tle = tles[i];
        
        // Convert to radians and compute derived values
        sys.incl[i] = tle.inclination * DEG2RAD;
        sys.raan0[i] = tle.raan * DEG2RAD;
        sys.ecc[i] = tle.eccentricity;
        sys.argp0[i] = tle.arg_perigee * DEG2RAD;
        sys.M0[i] = tle.mean_anomaly * DEG2RAD;
        sys.n0[i] = tle.mean_motion * TWOPI / MIN_PER_DAY;  // rad/min
        sys.bstar[i] = tle.bstar;
        
        // Semi-major axis from mean motion
        double n_rad_sec = sys.n0[i] / 60.0;  // rad/s
        sys.a0[i] = std::pow(MU / (n_rad_sec * n_rad_sec), 1.0/3.0);
        
        // Cold data
        sys.catalog_numbers[i] = tle.catalog_number;
        sys.names[i] = tle.name;
    }
    
    return sys;
}

} // namespace orbitops

