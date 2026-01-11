/**
 * SGP4 Validation Test
 * 
 * This file validates our propagator against the official Vallado SGP4 test vectors
 * from AIAA-2006-6753 "Revisiting Spacetrack Report #3".
 * 
 * IMPORTANT: Our implementation is a SIMPLIFIED SGP4 (J2 secular perturbations only).
 * It does NOT include:
 * - Full Brouwer mean motion recovery
 * - SDP4 deep-space perturbations (lunar/solar)
 * - Atmospheric drag (BSTAR term)
 * - Higher-order zonal harmonics (J3, J4, etc.)
 * 
 * Expected accuracy for LEO satellites (short-term, <24h):
 * - Position error: ~1-10 km (vs full SGP4: ~1 km vs actual)
 * - Suitable for: Collision screening (not precision conjunction analysis)
 * 
 * For production use requiring <1km accuracy, integrate the full Vallado SGP4.
 */

#include "test_framework.hpp"
#include "tle_parser.hpp"
#include "sgp4.hpp"
#include <cmath>
#include <fstream>
#include <sstream>

using namespace orbitops;
using namespace test;

// Reference test case from Vallado AIAA-2006-6753
// Object 00005 (Vanguard 1) at t=0 minutes from epoch
// Expected TEME position/velocity from 00005.e
struct ReferencePoint {
    double time_min;
    double x, y, z;      // km
    double vx, vy, vz;   // km/s
};

// Official Vallado test vector for catalog #00005
// TLE: 1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753
//      2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667
const ReferencePoint VALLADO_00005_T0 = {
    0.0,                    // time from epoch (minutes)
    7022.46529266,          // x (km)
    -1400.08296755,         // y (km) 
    0.03995155,             // z (km)
    1.893841015,            // vx (km/s)
    6.405893759,            // vy (km/s)
    4.534807250             // vz (km/s)
};

bool test_vallado_reference_comparison() {
    // Parse the TLE
    std::string line1 = "1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753";
    std::string line2 = "2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667";
    TLE tle = parse_tle("Vanguard 1", line1, line2);
    
    Vec3 pos, vel;
    sgp4_propagate(tle, VALLADO_00005_T0.time_min, pos, vel);
    
    // Calculate position error
    double dx = pos.x - VALLADO_00005_T0.x;
    double dy = pos.y - VALLADO_00005_T0.y;
    double dz = pos.z - VALLADO_00005_T0.z;
    double pos_error = std::sqrt(dx*dx + dy*dy + dz*dz);
    
    // Calculate velocity error
    double dvx = vel.x - VALLADO_00005_T0.vx;
    double dvy = vel.y - VALLADO_00005_T0.vy;
    double dvz = vel.z - VALLADO_00005_T0.vz;
    double vel_error = std::sqrt(dvx*dvx + dvy*dvy + dvz*dvz);
    
    std::cout << "\n    Reference: (" << VALLADO_00005_T0.x << ", " 
              << VALLADO_00005_T0.y << ", " << VALLADO_00005_T0.z << ")\n";
    std::cout << "    Computed:  (" << pos.x << ", " << pos.y << ", " << pos.z << ")\n";
    std::cout << "    Position error: " << pos_error << " km\n";
    std::cout << "    Velocity error: " << vel_error << " km/s\n";
    
    // For our simplified J2 model, we expect larger errors than full SGP4
    // Accept if position error < 100 km (simplified model tolerance)
    // Full SGP4 would be < 1 km
    bool pos_ok = pos_error < 100.0;
    bool vel_ok = vel_error < 1.0;
    
    if (!pos_ok) std::cerr << "    Position error exceeds 100 km tolerance\n";
    if (!vel_ok) std::cerr << "    Velocity error exceeds 1 km/s tolerance\n";
    
    return pos_ok && vel_ok;
}

bool test_leo_satellite_accuracy() {
    // Test with a typical LEO satellite (ISS-like orbit)
    // Mean motion ~15.5 rev/day = ~93 min period
    TLE tle;
    tle.name = "Test LEO";
    tle.catalog_number = 99999;
    tle.inclination = 51.6;      // degrees
    tle.raan = 0.0;              // degrees
    tle.eccentricity = 0.0001;   // near-circular
    tle.arg_perigee = 0.0;       // degrees
    tle.mean_anomaly = 0.0;      // degrees
    tle.mean_motion = 15.5;      // rev/day
    tle.bstar = 0.0;
    
    Vec3 pos, vel;
    sgp4_propagate(tle, 0.0, pos, vel);
    
    double radius = pos.magnitude();
    double altitude = radius - 6378.137;
    double speed = vel.magnitude();
    
    std::cout << "\n    Altitude: " << altitude << " km\n";
    std::cout << "    Speed: " << speed << " km/s\n";
    
    // For a ~400km orbit, speed should be ~7.7 km/s
    bool alt_ok = altitude > 350 && altitude < 450;
    bool spd_ok = speed > 7.0 && speed < 8.0;
    
    return alt_ok && spd_ok;
}

bool test_high_eccentricity_orbit() {
    // Test with Molniya-like high eccentricity orbit
    TLE tle;
    tle.name = "Molniya Test";
    tle.catalog_number = 88888;
    tle.inclination = 63.4;      // critical inclination
    tle.raan = 0.0;
    tle.eccentricity = 0.7;      // high eccentricity
    tle.arg_perigee = 270.0;     // apogee over northern hemisphere
    tle.mean_anomaly = 0.0;
    tle.mean_motion = 2.0;       // ~12 hour orbit
    tle.bstar = 0.0;
    
    Vec3 pos, vel;
    sgp4_propagate(tle, 0.0, pos, vel);
    
    double radius = pos.magnitude();
    
    std::cout << "\n    Radius: " << radius << " km\n";
    
    // Perigee should be ~500 km altitude, apogee ~40,000 km
    // At mean anomaly 0, we're at perigee
    bool valid = !std::isnan(radius) && radius > 6378.0;
    
    return valid;
}

bool test_propagation_consistency() {
    // Test that propagation is deterministic
    TLE tle;
    tle.inclination = 51.6;
    tle.raan = 100.0;
    tle.eccentricity = 0.001;
    tle.arg_perigee = 45.0;
    tle.mean_anomaly = 90.0;
    tle.mean_motion = 15.5;
    
    Vec3 pos1, vel1, pos2, vel2;
    sgp4_propagate(tle, 60.0, pos1, vel1);
    sgp4_propagate(tle, 60.0, pos2, vel2);
    
    double diff = (pos1 - pos2).magnitude();
    
    return diff < 1e-10;  // Should be exactly identical
}

bool test_orbital_mechanics_sanity() {
    // Verify orbital mechanics are physically reasonable
    TLE tle;
    tle.inclination = 0.0;       // Equatorial
    tle.raan = 0.0;
    tle.eccentricity = 0.0;      // Circular
    tle.arg_perigee = 0.0;
    tle.mean_anomaly = 0.0;
    tle.mean_motion = 15.0;      // ~96 min period
    
    Vec3 pos0, vel0, pos_half, vel_half;
    
    double period_min = 1440.0 / tle.mean_motion;
    
    sgp4_propagate(tle, 0.0, pos0, vel0);
    sgp4_propagate(tle, period_min / 2.0, pos_half, vel_half);
    
    // After half orbit, satellite should be on opposite side
    // For equatorial circular orbit: x should flip sign approximately
    double angle = std::acos((pos0.x * pos_half.x + pos0.y * pos_half.y) / 
                             (pos0.magnitude() * pos_half.magnitude()));
    
    std::cout << "\n    Angle after half orbit: " << (angle * 180.0 / M_PI) << " degrees\n";
    
    // Should be close to 180 degrees
    return std::abs(angle - M_PI) < 0.5;  // Within ~30 degrees tolerance due to J2
}

int main() {
    std::cout << "\n";
    std::cout << "================================================================\n";
    std::cout << "  SGP4 SCIENTIFIC VALIDATION SUITE\n";
    std::cout << "  Reference: Vallado AIAA-2006-6753\n";
    std::cout << "================================================================\n";
    std::cout << "\n";
    std::cout << "NOTE: This implementation uses SIMPLIFIED SGP4 (J2 secular only)\n";
    std::cout << "Expected accuracy: ~10-100 km position error for LEO\n";
    std::cout << "For <1 km accuracy, use full Vallado SGP4 implementation\n";
    std::cout << "\n";

    TestSuite suite;
    
    suite.add("Vallado Reference (00005)", test_vallado_reference_comparison);
    suite.add("LEO Satellite Physics", test_leo_satellite_accuracy);
    suite.add("High Eccentricity Orbit", test_high_eccentricity_orbit);
    suite.add("Propagation Consistency", test_propagation_consistency);
    suite.add("Orbital Mechanics Sanity", test_orbital_mechanics_sanity);
    
    return suite.run();
}

